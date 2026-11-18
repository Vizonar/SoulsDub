import { Pool } from 'pg';
import type { ClassificationKey } from './constants.js';
import { assertCan } from './permissions.js';
import { runQuery, type QueryParams } from './query.js';
import {
  classificationChangeSchema,
  dubberFormSchema,
  noteSchema,
  reviewInputSchema,
  sampleLabelSchema,
  type DubberForm,
  type DubberFormInput,
  type ReviewInput,
} from './schemas.js';
import { MAX_SAMPLES_PER_DUBBER, validateAudioFile, type AudioFileInput } from './samples.js';
import { DEFAULT_SUBMIT_RULES, NotFoundError, ValidationError, type DubberRepository, type ReviewWithName, type SampleSubmitResult, type SubmitResult, type SubmitRules } from './repository.js';
import type {
  Actor,
  AuditLogEntry,
  ClassificationHistoryEntry,
  Dubber,
  DubberDetails,
  InternalNote,
  Page,
  Review,
  VoiceSample,
} from './types.js';

/** Mapeia uma linha do Postgres (snake_case) para Dubber (camelCase). */
function rowToDubber(r: any): Dubber {
  return {
    id: r.id,
    discordId: r.discord_id,
    displayName: r.display_name,
    age: r.age != null ? Number(r.age) : undefined,
    pronouns: r.pronouns ?? undefined,
    selfLevel: r.self_level,
    experience: r.experience ?? undefined,
    voiceTone: r.voice_tone,
    voiceTypes: r.voice_types ?? [],
    intensity: r.intensity,
    diction: r.diction ?? undefined,
    speechSpeed: r.speech_speed,
    specialties: r.specialties ?? [],
    availability: r.availability ?? [],
    interests: r.interests ?? [],
    wantedCharacters: r.wanted_characters ?? undefined,
    classification: r.classification,
    isActive: r.is_active,
    needsReview: r.needs_review,
    createdAt: r.created_at?.toISOString?.() ?? String(r.created_at),
    updatedAt: r.updated_at?.toISOString?.() ?? String(r.updated_at),
  };
}

const FORM_COLUMNS = `display_name, age, pronouns, self_level, experience, voice_tone, voice_types,
  intensity, diction, speech_speed, specialties, availability, interests, wanted_characters`;

/** Upsert dos campos do formulário. Retorna (colunas, valores, placeholders). */
function formValues(form: DubberForm) {
  return {
    cols: FORM_COLUMNS.split(',').map((s) => s.trim()),
    vals: [
      form.displayName,
      form.age ?? null,
      form.pronouns ?? null,
      form.selfLevel,
      form.experience ?? null,
      form.voiceTone,
      form.voiceTypes,
      form.intensity,
      form.diction ?? null,
      form.speechSpeed,
      form.specialties,
      form.availability,
      form.interests,
      form.wantedCharacters ?? null,
    ],
  };
}

export class PgRepository implements DubberRepository {
  readonly kind = 'neon' as const;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });
  }

  async close() {
    await this.pool.end();
  }

  private async log(actor: { id: string | null; name: string }, action: string, entityId: string, details?: Record<string, unknown>, entity = 'dubber') {
    await this.pool.query(
      `INSERT INTO audit_log (actor_id, actor_name, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor.id, actor.name, action, entity, entityId, details ? JSON.stringify(details) : null],
    );
  }

  private async findRow(id: string): Promise<any> {
    const { rows } = await this.pool.query(`SELECT * FROM dubbers WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundError('Dubrador');
    return rows[0];
  }

  // ===================== Bot =====================

  async findByDiscordId(discordId: string): Promise<Dubber | null> {
    const { rows } = await this.pool.query(`SELECT * FROM dubbers WHERE discord_id = $1`, [discordId]);
    return rows[0] ? rowToDubber(rows[0]) : null;
  }

  async upsertFromForm(discordId: string, form: DubberForm, rules: SubmitRules = DEFAULT_SUBMIT_RULES): Promise<SubmitResult> {
    if (!/^\d{15,25}$/.test(discordId)) throw new ValidationError(['ID do Discord inválido.']);
    const parsed = dubberFormSchema.safeParse(form);
    if (!parsed.success) throw ValidationError.from(parsed.error as any);
    const f = parsed.data;
    const { cols, vals } = formValues(f);
    const existing = await this.findByDiscordId(discordId);
    const bot = { id: null, name: 'Bot do Discord' };

    if (!existing) {
      const ph = cols.map((_, i) => `$${i + 2}`).join(', ');
      const { rows } = await this.pool.query(
        `INSERT INTO dubbers (discord_id, ${cols.join(', ')}) VALUES ($1, ${ph}) RETURNING *`,
        [discordId, ...vals],
      );
      await this.log(bot, 'dubber.created', rows[0].id);
      return { status: 'created', dubber: rowToDubber(rows[0]) };
    }
    if (!rules.allowUpdates) return { status: 'blocked', reason: 'updates_disabled' };
    if (rules.updateCooldownHours > 0) {
      const last = new Date(existing.updatedAt).getTime() + rules.updateCooldownHours * 3600_000;
      if (last > Date.now()) return { status: 'blocked', reason: 'cooldown', retryAt: new Date(last).toISOString() };
    }
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const { rows } = await this.pool.query(
      `UPDATE dubbers SET ${sets}, needs_review = true, updated_at = now() WHERE id = $${cols.length + 1} RETURNING *`,
      [...vals, existing.id],
    );
    await this.log(bot, 'dubber.self_updated', existing.id);
    return { status: 'updated', dubber: rowToDubber(rows[0]) };
  }

  private async sampleMeta(r: any): Promise<VoiceSample> {
    return {
      id: r.id,
      dubberId: r.dubber_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      label: r.label ?? undefined,
      source: r.source,
      uploadedByName: r.uploaded_by_name,
      createdAt: r.created_at?.toISOString?.() ?? String(r.created_at),
    };
  }

  async addSampleFromDiscord(discordId: string, file: AudioFileInput, label?: string): Promise<SampleSubmitResult> {
    const d = await this.findByDiscordId(discordId);
    if (!d) return { status: 'no_profile' };
    const v = validateAudioFile(file);
    if (!v.ok) return { status: 'invalid', errors: v.errors };
    const { rows: cnt } = await this.pool.query(`SELECT count(*)::int AS n FROM samples WHERE dubber_id = $1`, [d.id]);
    if (cnt[0].n >= MAX_SAMPLES_PER_DUBBER) return { status: 'limit_reached', max: MAX_SAMPLES_PER_DUBBER };
    const parsedLabel = label ? sampleLabelSchema.parse(label) : undefined;
    const { rows } = await this.pool.query(
      `INSERT INTO samples (dubber_id, file_name, mime_type, size_bytes, label, source, uploaded_by_name, bytes)
       VALUES ($1,$2,$3,$4,$5,'discord',$6,$7) RETURNING id, dubber_id, file_name, mime_type, size_bytes, label, source, uploaded_by_name, created_at`,
      [d.id, v.fileName, v.mimeType, file.bytes.length, parsedLabel ?? null, d.displayName, Buffer.from(file.bytes)],
    );
    await this.pool.query(`UPDATE dubbers SET needs_review = true WHERE id = $1`, [d.id]);
    await this.log({ id: null, name: 'Bot do Discord' }, 'sample.created', d.id, { size: v.fileName });
    return { status: 'added', sample: await this.sampleMeta(rows[0]) };
  }

  // ===================== Painel =====================

  async query(actor: Actor, params: QueryParams): Promise<Page<Dubber>> {
    assertCan(actor.role, 'dubber.read');
    const { rows } = await this.pool.query(`SELECT * FROM dubbers ORDER BY created_at DESC`);
    const all = rows.map(rowToDubber);
    return runQuery(all, params);
  }

  async listAll(actor: Actor): Promise<Dubber[]> {
    assertCan(actor.role, 'dubber.read');
    const { rows } = await this.pool.query(`SELECT * FROM dubbers ORDER BY created_at DESC`);
    return rows.map(rowToDubber);
  }

  async getDetails(actor: Actor, id: string): Promise<DubberDetails> {
    assertCan(actor.role, 'dubber.read');
    const dubber = rowToDubber(await this.findRow(id));
    const canNotes = actor.role === 'admin' || actor.role === 'reviewer';
    const [reviews, history, notes, audit, samples] = await Promise.all([
      this.pool.query(`SELECT * FROM reviews WHERE dubber_id = $1 ORDER BY created_at DESC`, [id]),
      this.pool.query(`SELECT * FROM classification_history WHERE dubber_id = $1 ORDER BY created_at DESC`, [id]),
      canNotes
        ? this.pool.query(`SELECT * FROM internal_notes WHERE dubber_id = $1 ORDER BY created_at DESC`, [id])
        : Promise.resolve({ rows: [] } as any),
      actor.role === 'admin'
        ? this.pool.query(`SELECT * FROM audit_log WHERE entity_id = $1 ORDER BY created_at DESC`, [id])
        : Promise.resolve({ rows: [] } as any),
      this.pool.query(`SELECT id, dubber_id, file_name, mime_type, size_bytes, label, source, uploaded_by_name, created_at FROM samples WHERE dubber_id = $1 ORDER BY created_at DESC`, [id]),
    ]);
    const iso = (v: any) => (v?.toISOString?.() ?? String(v));
    return {
      dubber,
      reviews: reviews.rows.map((r: any) => ({
        id: r.id, dubberId: r.dubber_id, reviewerId: r.reviewer_id, reviewerName: r.reviewer_name,
        previousClassification: r.previous_classification, newClassification: r.new_classification,
        criteria: r.criteria ?? [], comments: r.comments ?? undefined, reason: r.reason ?? undefined,
        createdAt: iso(r.created_at),
      })),
      history: history.rows.map((h: any) => ({
        id: h.id, dubberId: h.dubber_id, previousClassification: h.previous_classification,
        newClassification: h.new_classification, reason: h.reason ?? '', changedById: h.changed_by_id,
        changedByName: h.changed_by_name, reviewId: h.review_id ?? undefined, createdAt: iso(h.created_at),
      })),
      notes: notes.rows.map((n: any) => ({
        id: n.id, dubberId: n.dubber_id, authorId: n.author_id, authorName: n.author_name, body: n.body, createdAt: iso(n.created_at),
      })),
      audit: audit.rows.map((a: any) => ({
        id: a.id, actorId: a.actor_id, actorName: a.actor_name, action: a.action, entity: a.entity,
        entityId: a.entity_id, details: a.details ?? undefined, createdAt: iso(a.created_at),
      })),
      samples: samples.rows.map((s: any) => ({
        id: s.id, dubberId: s.dubber_id, fileName: s.file_name, mimeType: s.mime_type,
        sizeBytes: s.size_bytes, label: s.label ?? undefined, source: s.source,
        uploadedByName: s.uploaded_by_name, createdAt: iso(s.created_at),
        url: `/api/samples/${s.id}/audio`,
      })),
    };
  }

  async updateDubber(actor: Actor, id: string, patch: Partial<DubberFormInput>): Promise<Dubber> {
    assertCan(actor.role, 'dubber.edit');
    const row = await this.findRow(id);
    const current = rowToDubber(row);
    const { dubberFormSchema } = await import('./schemas.js');
    const merged = dubberFormSchema.safeParse({
      displayName: patch.displayName ?? current.displayName,
      age: patch.age ?? current.age,
      pronouns: patch.pronouns ?? current.pronouns,
      selfLevel: patch.selfLevel ?? current.selfLevel,
      experience: patch.experience ?? current.experience,
      voiceTone: patch.voiceTone ?? current.voiceTone,
      voiceTypes: patch.voiceTypes ?? current.voiceTypes,
      intensity: patch.intensity ?? current.intensity,
      diction: patch.diction ?? current.diction,
      speechSpeed: patch.speechSpeed ?? current.speechSpeed,
      specialties: patch.specialties ?? current.specialties,
      availability: patch.availability ?? current.availability,
      interests: patch.interests ?? current.interests,
      wantedCharacters: patch.wantedCharacters ?? current.wantedCharacters,
    });
    if (!merged.success) throw ValidationError.from(merged.error as any);
    const { cols, vals } = formValues(merged.data as DubberForm);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const { rows } = await this.pool.query(
      `UPDATE dubbers SET ${sets}, updated_at = now() WHERE id = $${cols.length + 1} RETURNING *`,
      [...vals, id],
    );
    await this.log(actor, 'dubber.updated', id);
    return rowToDubber(rows[0]);
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<Dubber> {
    assertCan(actor.role, 'dubber.setActive');
    const { rows } = await this.pool.query(`UPDATE dubbers SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *`, [id, active]);
    if (!rows[0]) throw new NotFoundError('Dubrador');
    await this.log(actor, 'dubber.active_changed', id, { isActive: active });
    return rowToDubber(rows[0]);
  }

  async changeClassification(actor: Actor, id: string, next: ClassificationKey, reason: string): Promise<Dubber> {
    assertCan(actor.role, 'classification.change');
    const parsed = classificationChangeSchema.safeParse({ newClassification: next, reason });
    if (!parsed.success) throw ValidationError.from(parsed.error as any);
    const row = await this.findRow(id);
    const d = rowToDubber(row);
    if (d.classification === next) throw new ValidationError(['A ficha já está nessa classificação.']);
    await this.pool.query(
      `INSERT INTO classification_history (dubber_id, previous_classification, new_classification, reason, changed_by_id, changed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, d.classification, next, reason, actor.id, actor.name],
    );
    const { rows } = await this.pool.query(
      `UPDATE dubbers SET classification = $2, updated_at = now() WHERE id = $1 RETURNING *`, [id, next],
    );
    await this.log(actor, 'classification.changed', id, { from: d.classification, to: next });
    return rowToDubber(rows[0]);
  }

  async addReview(actor: Actor, input: ReviewInput): Promise<Review> {
    assertCan(actor.role, 'review.create');
    const parsed = reviewInputSchema.safeParse(input);
    if (!parsed.success) throw ValidationError.from(parsed.error as any);
    const v = parsed.data;
    const row = await this.findRow(v.dubberId);
    const d = rowToDubber(row);
    const next = v.newClassification ?? d.classification;
    const changes = next !== d.classification;
    if (changes) {
      assertCan(actor.role, 'classification.change');
      if (!v.reason) throw new ValidationError(['Informe o motivo da mudança de classificação.']);
    }
    const { rows } = await this.pool.query(
      `INSERT INTO reviews (dubber_id, reviewer_id, reviewer_name, previous_classification, new_classification, criteria, comments, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.id, actor.id, actor.name, d.classification, next, JSON.stringify(v.criteria ?? []), v.comments ?? null, v.reason ?? null],
    );
    await this.log(actor, 'review.created', d.id, { reviewId: rows[0].id });
    if (changes) {
      await this.pool.query(
        `INSERT INTO classification_history (dubber_id, previous_classification, new_classification, reason, changed_by_id, changed_by_name, review_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [d.id, d.classification, next, v.reason ?? '', actor.id, actor.name, rows[0].id],
      );
      await this.pool.query(`UPDATE dubbers SET classification = $2, updated_at = now() WHERE id = $1`, [d.id, next]);
      await this.log(actor, 'classification.changed', d.id, { from: d.classification, to: next });
    }
    await this.pool.query(`UPDATE dubbers SET needs_review = false WHERE id = $1`, [d.id]);
    const iso = (x: any) => (x?.toISOString?.() ?? String(x));
    return {
      id: rows[0].id, dubberId: rows[0].dubber_id, reviewerId: rows[0].reviewer_id, reviewerName: rows[0].reviewer_name,
      previousClassification: rows[0].previous_classification, newClassification: rows[0].new_classification,
      criteria: rows[0].criteria ?? [], comments: rows[0].comments ?? undefined, reason: rows[0].reason ?? undefined,
      createdAt: iso(rows[0].created_at),
    };
  }

  async markReviewed(actor: Actor, id: string): Promise<Dubber> {
    assertCan(actor.role, 'review.create');
    const { rows } = await this.pool.query(`UPDATE dubbers SET needs_review = false WHERE id = $1 RETURNING *`, [id]);
    if (!rows[0]) throw new NotFoundError('Dubrador');
    await this.log(actor, 'dubber.reviewed', id);
    return rowToDubber(rows[0]);
  }

  async addNote(actor: Actor, id: string, body: string): Promise<InternalNote> {
    assertCan(actor.role, 'note.create');
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) throw ValidationError.from(parsed.error as any);
    await this.findRow(id);
    const { rows } = await this.pool.query(
      `INSERT INTO internal_notes (dubber_id, author_id, author_name, body) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, actor.id, actor.name, parsed.data],
    );
    await this.log(actor, 'note.created', id);
    const iso = (x: any) => (x?.toISOString?.() ?? String(x));
    return { id: rows[0].id, dubberId: rows[0].dubber_id, authorId: rows[0].author_id, authorName: rows[0].author_name, body: rows[0].body, createdAt: iso(rows[0].created_at) };
  }

  async addSample(actor: Actor, dubberId: string, file: AudioFileInput, label?: string): Promise<VoiceSample> {
    assertCan(actor.role, 'sample.upload');
    const d = await this.findRow(dubberId);
    const { rows: cnt } = await this.pool.query(`SELECT count(*)::int AS n FROM samples WHERE dubber_id = $1`, [dubberId]);
    if (cnt[0].n >= MAX_SAMPLES_PER_DUBBER) throw new ValidationError([`Limite de ${MAX_SAMPLES_PER_DUBBER} amostras por dublador.`]);
    const v = validateAudioFile(file);
    if (!v.ok || !v.mimeType) throw new ValidationError(v.errors);
    const parsedLabel = label ? sampleLabelSchema.parse(label) : undefined;
    const { rows } = await this.pool.query(
      `INSERT INTO samples (dubber_id, file_name, mime_type, size_bytes, label, source, uploaded_by_name, bytes)
       VALUES ($1,$2,$3,$4,$5,'panel',$6,$7)
       RETURNING id, dubber_id, file_name, mime_type, size_bytes, label, source, uploaded_by_name, created_at`,
      [dubberId, v.fileName, v.mimeType, file.bytes.length, parsedLabel ?? null, actor.name, Buffer.from(file.bytes)],
    );
    await this.log(actor, 'sample.created', dubberId);
    return this.sampleMeta(rows[0]);
  }

  async deleteSample(actor: Actor, sampleId: string): Promise<void> {
    assertCan(actor.role, 'sample.delete');
    const { rows } = await this.pool.query(`DELETE FROM samples WHERE id = $1 RETURNING dubber_id`, [sampleId]);
    if (!rows[0]) throw new NotFoundError('Amostra');
    await this.log(actor, 'sample.deleted', rows[0].dubber_id);
  }

  async listReviews(actor: Actor): Promise<ReviewWithName[]> {
    assertCan(actor.role, 'dubber.read');
    const { rows } = await this.pool.query(
      `SELECT r.*, d.display_name AS dubber_name FROM reviews r
       LEFT JOIN dubbers d ON d.id = r.dubber_id ORDER BY r.created_at DESC`,
    );
    const iso = (x: any) => (x?.toISOString?.() ?? String(x));
    return rows.map((r: any) => ({
      id: r.id, dubberId: r.dubber_id, reviewerId: r.reviewer_id, reviewerName: r.reviewer_name,
      previousClassification: r.previous_classification, newClassification: r.new_classification,
      criteria: r.criteria ?? [], comments: r.comments ?? undefined, reason: r.reason ?? undefined,
      createdAt: iso(r.created_at), dubberName: r.dubber_name ?? '(removido)',
    }));
  }

  async listAudit(actor: Actor): Promise<AuditLogEntry[]> {
    assertCan(actor.role, 'audit.read');
    const { rows } = await this.pool.query(`SELECT * FROM audit_log ORDER BY created_at DESC`);
    const iso = (x: any) => (x?.toISOString?.() ?? String(x));
    return rows.map((a: any) => ({
      id: a.id, actorId: a.actor_id, actorName: a.actor_name, action: a.action, entity: a.entity,
      entityId: a.entity_id, details: a.details ?? undefined, createdAt: iso(a.created_at),
    }));
  }

  /** Bytes de um sample (para o endpoint de áudio). */
  async getSampleBytes(sampleId: string): Promise<{ meta: VoiceSample; bytes: Buffer } | null> {
    const { rows } = await this.pool.query(`SELECT * FROM samples WHERE id = $1`, [sampleId]);
    if (!rows[0]) return null;
    return { meta: await this.sampleMeta(rows[0]), bytes: rows[0].bytes };
  }
}
