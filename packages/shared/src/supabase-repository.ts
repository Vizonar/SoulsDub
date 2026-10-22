import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassificationKey } from './constants.js';
import { assertCan, can, PermissionError } from './permissions.js';
import { MAX_SAMPLES_PER_DUBBER, SAMPLE_BUCKET, validateAudioFile, type AudioFileInput } from './samples.js';
import type { QueryParams } from './query.js';
import { normalizeTag } from './text.js';
import {
  classificationChangeSchema,
  noteSchema,
  reviewInputSchema,
  sampleLabelSchema,
  type DubberForm,
  type DubberFormInput,
  type ReviewInput,
} from './schemas.js';
import {
  DEFAULT_SUBMIT_RULES,
  NotFoundError,
  ValidationError,
  dubberToFormInput,
  parseForm,
  type DubberRepository,
  type ReviewWithName,
  type SampleSubmitResult,
  type SubmitResult,
  type SubmitRules,
} from './repository.js';
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

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const rowToDubber = (r: Row): Dubber => ({
  id: r.id,
  discordId: r.discord_id,
  displayName: r.display_name,
  age: r.age ?? undefined,
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
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Somente colunas autodeclaradas. Classificação oficial NUNCA é enviada por aqui. */
const formToRow = (f: DubberForm): Row => ({
  display_name: f.displayName,
  age: f.age ?? null,
  pronouns: f.pronouns ?? null,
  self_level: f.selfLevel,
  experience: f.experience ?? null,
  voice_tone: f.voiceTone,
  voice_types: f.voiceTypes,
  intensity: f.intensity,
  diction: f.diction ?? null,
  speech_speed: f.speechSpeed,
  specialties: f.specialties,
  availability: f.availability,
  interests: f.interests,
  wanted_characters: f.wantedCharacters ?? null,
});

const rowToReview = (r: Row): Review => ({
  id: r.id,
  dubberId: r.dubber_id,
  reviewerId: r.reviewer_id,
  reviewerName: r.reviewer_name,
  previousClassification: r.previous_classification,
  newClassification: r.new_classification,
  criteria: r.criteria ?? [],
  comments: r.comments ?? undefined,
  reason: r.reason ?? undefined,
  createdAt: r.created_at,
});

const rowToHistory = (r: Row): ClassificationHistoryEntry => ({
  id: r.id,
  dubberId: r.dubber_id,
  previousClassification: r.previous_classification,
  newClassification: r.new_classification,
  reason: r.reason,
  changedById: r.changed_by,
  changedByName: r.changed_by_name,
  reviewId: r.review_id ?? undefined,
  createdAt: r.created_at,
});

const rowToNote = (r: Row): InternalNote => ({
  id: r.id, dubberId: r.dubber_id, authorId: r.author_id, authorName: r.author_name, body: r.body, createdAt: r.created_at,
});

const rowToAudit = (r: Row): AuditLogEntry => ({
  id: String(r.id), actorId: r.actor_id, actorName: r.actor_name ?? 'Sistema', action: r.action,
  entity: r.entity, entityId: r.entity_id, details: r.details ?? undefined, createdAt: r.created_at,
});

const rowToSample = (r: Row, url?: string): VoiceSample => ({
  id: r.id, dubberId: r.dubber_id, fileName: r.file_name, mimeType: r.mime_type, sizeBytes: r.size_bytes,
  label: r.label ?? undefined, source: r.source, uploadedByName: r.uploaded_by_name, createdAt: r.created_at, url,
});

const sampleToRow = (s: VoiceSample): Row => ({
  id: s.id, dubber_id: s.dubberId, storage_path: `${s.dubberId}/${s.id}.${s.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`,
  file_name: s.fileName, mime_type: s.mimeType, size_bytes: s.sizeBytes, label: s.label ?? null, source: s.source, uploaded_by_name: s.uploadedByName,
});

const SORT_COLUMNS = {
  displayName: 'display_name',
  classification: 'classification_rank',
  selfLevel: 'self_level_rank',
  updatedAt: 'updated_at',
  createdAt: 'created_at',
} as const;

interface DbError { code?: string; message: string }

/** Converte erros do Postgres/PostgREST em erros de domínio. */
function fail(error: DbError): never {
  if (error.code === '42501' || error.code === 'PGRST301') throw new PermissionError('dubber.edit');
  if (error.code === 'P0001' || error.code === '23514' || error.code === '23502') throw new ValidationError([error.message]);
  throw new Error(`Erro do banco de dados: ${error.message}`);
}

/**
 * Repositório Supabase. No painel usa a chave anon + sessão do administrador (RLS aplica as regras).
 * No bot usa a service role, que ignora a RLS — por isso o bot só chama findByDiscordId/upsertFromForm.
 */
export class SupabaseRepository implements DubberRepository {
  readonly kind = 'supabase' as const;
  constructor(private readonly db: SupabaseClient) {}

  private async fetchOne(id: string): Promise<Dubber> {
    const { data, error } = await this.db.from('dubbers').select('*').eq('id', id).maybeSingle();
    if (error) fail(error);
    if (!data) throw new NotFoundError('Dubrador');
    return rowToDubber(data);
  }

  async findByDiscordId(discordId: string) {
    const { data, error } = await this.db.from('dubbers').select('*').eq('discord_id', discordId).maybeSingle();
    if (error) fail(error);
    return data ? rowToDubber(data) : null;
  }

  async upsertFromForm(discordId: string, form: DubberForm, rules: SubmitRules = DEFAULT_SUBMIT_RULES): Promise<SubmitResult> {
    if (!/^\d{15,25}$/.test(discordId)) throw new ValidationError(['ID do Discord inválido.']);
    let existing = await this.findByDiscordId(discordId);
    if (!existing) {
      const { data, error } = await this.db.from('dubbers').insert({ discord_id: discordId, ...formToRow(form) }).select('*').single();
      if (!error) return { status: 'created', dubber: rowToDubber(data) };
      if (error.code !== '23505') fail(error); // 23505 = ficha criada em paralelo: trata como atualização
      existing = await this.findByDiscordId(discordId);
      if (!existing) fail(error);
    }
    if (!rules.allowUpdates) return { status: 'blocked', reason: 'updates_disabled' };
    if (rules.updateCooldownHours > 0) {
      const retryAt = new Date(new Date(existing.updatedAt).getTime() + rules.updateCooldownHours * 3600_000);
      if (retryAt.getTime() > Date.now()) return { status: 'blocked', reason: 'cooldown', retryAt: retryAt.toISOString() };
    }
    const { data, error } = await this.db
      .from('dubbers')
      .update({ ...formToRow(form), needs_review: true })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) fail(error);
    return { status: 'updated', dubber: rowToDubber(data) };
  }

  async query(actor: Actor, p: QueryParams): Promise<Page<Dubber>> {
    assertCan(actor.role, 'dubber.read');
    const run = async (page: number) => {
      let q = this.db.from('dubbers').select('*', { count: 'exact' });
      const f = p.filters;
      if (f.search) {
        const s = f.search.replace(/[,()%*\\"'.:]/g, ' ').trim();
        if (s) q = q.or(`display_name.ilike.%${s}%,discord_id.ilike.%${s}%`);
      }
      if (f.classification) q = q.eq('classification', f.classification);
      if (f.selfLevel) q = q.eq('self_level', f.selfLevel);
      if (f.voiceTone) q = q.eq('voice_tone', f.voiceTone);
      if (f.voiceType) q = q.contains('voice_types', [f.voiceType]);
      if (f.intensity) q = q.eq('intensity', f.intensity);
      if (f.speechSpeed) q = q.eq('speech_speed', f.speechSpeed);
      if (f.specialty) q = q.contains('specialties', [normalizeTag(f.specialty)]);
      if (f.availability) q = q.contains('availability', [normalizeTag(f.availability)]);
      if (f.interest) q = q.contains('interests', [normalizeTag(f.interest)]);
      if (f.status === 'active') q = q.eq('is_active', true);
      if (f.status === 'inactive') q = q.eq('is_active', false);
      if (f.needsReview !== undefined) q = q.eq('needs_review', f.needsReview);
      const from = (page - 1) * p.pageSize;
      return q
        .order(SORT_COLUMNS[p.sort.key], { ascending: p.sort.dir === 'asc' })
        .order('display_name', { ascending: true })
        .range(from, from + p.pageSize - 1);
    };
    let page = Math.max(1, p.page);
    let res = await run(page);
    if (res.error?.code === 'PGRST103') { page = 1; res = await run(1); } // página além do total
    if (res.error) fail(res.error);
    return { items: (res.data ?? []).map(rowToDubber), total: res.count ?? 0, page, pageSize: p.pageSize };
  }

  async listAll(actor: Actor) {
    assertCan(actor.role, 'dubber.read');
    const all: Dubber[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from('dubbers').select('*').order('created_at').range(from, from + 999);
      if (error) fail(error);
      all.push(...(data ?? []).map(rowToDubber));
      if (!data || data.length < 1000) return all;
    }
  }

  async getDetails(actor: Actor, id: string): Promise<DubberDetails> {
    assertCan(actor.role, 'dubber.read');
    const dubber = await this.fetchOne(id);
    const desc = { ascending: false };
    const [reviews, history, notes, audit, samples] = await Promise.all([
      this.db.from('dubber_reviews').select('*').eq('dubber_id', id).order('created_at', desc),
      this.db.from('dubber_classification_history').select('*').eq('dubber_id', id).order('created_at', desc),
      this.db.from('dubber_internal_notes').select('*').eq('dubber_id', id).order('created_at', desc),
      actor.role === 'admin'
        ? this.db.from('audit_logs').select('*').eq('entity_id', id).order('created_at', desc).limit(100)
        : Promise.resolve({ data: [] as Row[], error: null }),
      can(actor.role, 'sample.read')
        ? this.db.from('dubber_voice_samples').select('*').eq('dubber_id', id).order('created_at', desc)
        : Promise.resolve({ data: [] as Row[], error: null }),
    ]);
    for (const r of [reviews, history, notes, audit, samples]) if (r.error) fail(r.error);
    return {
      dubber,
      reviews: (reviews.data ?? []).map(rowToReview),
      history: (history.data ?? []).map(rowToHistory),
      notes: (notes.data ?? []).map(rowToNote),
      audit: (audit.data ?? []).map(rowToAudit),
      samples: await this.withSignedUrls(samples.data ?? []),
    };
  }

  /** Links temporários (1 h) para ouvir os áudios do bucket privado. */
  private async withSignedUrls(rows: Row[]): Promise<VoiceSample[]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.db.storage.from(SAMPLE_BUCKET).createSignedUrls(rows.map((r) => r.storage_path as string), 3600);
    if (error) throw new Error(`Não foi possível gerar os links de áudio: ${error.message}`);
    const byPath = new Map((data ?? []).map((x) => [x.path, x.signedUrl]));
    return rows.map((r) => rowToSample(r, byPath.get(r.storage_path) ?? undefined));
  }

  private async insertSample(d: Dubber, file: AudioFileInput, label: string | undefined, source: 'discord' | 'panel', by: { id: string | null; name: string }) {
    const v = validateAudioFile(file);
    if (!v.ok || !v.mimeType || !v.extension) throw new ValidationError(v.errors);
    const id = globalThis.crypto.randomUUID();
    const path = `${d.id}/${id}.${v.extension}`;
    const up = await this.db.storage.from(SAMPLE_BUCKET).upload(path, file.bytes, { contentType: v.mimeType, upsert: false });
    if (up.error) throw new Error(`Falha ao enviar o áudio: ${up.error.message}`);
    const ins = await this.db
      .from('dubber_voice_samples')
      .insert({
        id, dubber_id: d.id, storage_path: path, file_name: v.fileName, mime_type: v.mimeType, size_bytes: file.bytes.length,
        label: sampleLabelSchema.parse(label) ?? null, source, uploaded_by: by.id, uploaded_by_name: by.name,
      })
      .select('*')
      .single();
    if (ins.error) {
      await this.db.storage.from(SAMPLE_BUCKET).remove([path]); // não deixa arquivo órfão
      fail(ins.error);
    }
    return rowToSample(ins.data);
  }

  async addSampleFromDiscord(discordId: string, file: AudioFileInput, label?: string): Promise<SampleSubmitResult> {
    const d = await this.findByDiscordId(discordId);
    if (!d) return { status: 'no_profile' };
    const v = validateAudioFile(file);
    if (!v.ok) return { status: 'invalid', errors: v.errors };
    const { count, error } = await this.db.from('dubber_voice_samples').select('id', { count: 'exact', head: true }).eq('dubber_id', d.id);
    if (error) fail(error);
    if ((count ?? 0) >= MAX_SAMPLES_PER_DUBBER) return { status: 'limit_reached', max: MAX_SAMPLES_PER_DUBBER };
    const sample = await this.insertSample(d, file, label, 'discord', { id: null, name: d.displayName });
    await this.db.from('dubbers').update({ needs_review: true }).eq('id', d.id);
    return { status: 'added', sample };
  }

  async addSample(actor: Actor, dubberId: string, file: AudioFileInput, label?: string) {
    assertCan(actor.role, 'sample.upload');
    const d = await this.fetchOne(dubberId);
    const sample = await this.insertSample(d, file, label, 'panel', { id: actor.id, name: actor.name });
    const [signed] = await this.withSignedUrls([{ ...sampleToRow(sample), created_at: sample.createdAt }]);
    return signed ?? sample;
  }

  async deleteSample(actor: Actor, sampleId: string) {
    assertCan(actor.role, 'sample.delete');
    const { data, error } = await this.db.from('dubber_voice_samples').select('*').eq('id', sampleId).maybeSingle();
    if (error) fail(error);
    if (!data) throw new NotFoundError('Amostra');
    const del = await this.db.from('dubber_voice_samples').delete().eq('id', sampleId);
    if (del.error) fail(del.error);
    await this.db.storage.from(SAMPLE_BUCKET).remove([data.storage_path as string]);
  }

  async updateDubber(actor: Actor, id: string, patch: Partial<DubberFormInput>) {
    assertCan(actor.role, 'dubber.edit');
    const current = await this.fetchOne(id);
    const merged = parseForm({ ...dubberToFormInput(current), ...patch });
    const { data, error } = await this.db.from('dubbers').update(formToRow(merged)).eq('id', id).select('*').single();
    if (error) fail(error);
    return rowToDubber(data);
  }

  async setActive(actor: Actor, id: string, active: boolean) {
    assertCan(actor.role, 'dubber.setActive');
    const { data, error } = await this.db.from('dubbers').update({ is_active: active }).eq('id', id).select('*').single();
    if (error) fail(error);
    return rowToDubber(data);
  }

  async changeClassification(actor: Actor, id: string, next: ClassificationKey, reason: string) {
    assertCan(actor.role, 'classification.change');
    const parsed = classificationChangeSchema.safeParse({ newClassification: next, reason });
    if (!parsed.success) throw ValidationError.from(parsed.error);
    const { error } = await this.db.rpc('set_classification', { p_dubber_id: id, p_new: next, p_reason: parsed.data.reason });
    if (error) fail(error);
    return this.fetchOne(id);
  }

  async addReview(actor: Actor, input: ReviewInput) {
    assertCan(actor.role, 'review.create');
    const parsed = reviewInputSchema.safeParse(input);
    if (!parsed.success) throw ValidationError.from(parsed.error);
    const v = parsed.data;
    const { data, error } = await this.db.rpc('add_review', {
      p_dubber_id: v.dubberId,
      p_new: v.newClassification ?? null,
      p_criteria: v.criteria,
      p_comments: v.comments ?? null,
      p_reason: v.reason ?? null,
    });
    if (error) fail(error);
    const res = await this.db.from('dubber_reviews').select('*').eq('id', data).single();
    if (res.error) fail(res.error);
    return rowToReview(res.data);
  }

  async markReviewed(actor: Actor, id: string) {
    assertCan(actor.role, 'review.create');
    const { error } = await this.db.rpc('mark_reviewed', { p_dubber_id: id });
    if (error) fail(error);
    return this.fetchOne(id);
  }

  async addNote(actor: Actor, id: string, body: string) {
    assertCan(actor.role, 'note.create');
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) throw ValidationError.from(parsed.error);
    const { data, error } = await this.db
      .from('dubber_internal_notes')
      .insert({ dubber_id: id, author_id: actor.id, author_name: actor.name, body: parsed.data })
      .select('*')
      .single();
    if (error) fail(error);
    return rowToNote(data);
  }

  async listReviews(actor: Actor): Promise<ReviewWithName[]> {
    assertCan(actor.role, 'dubber.read');
    const { data, error } = await this.db
      .from('dubber_reviews')
      .select('*, dubbers(display_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) fail(error);
    return (data ?? []).map((r: Row) => ({ ...rowToReview(r), dubberName: r.dubbers?.display_name ?? '(removido)' }));
  }

  async listAudit(actor: Actor) {
    assertCan(actor.role, 'audit.read');
    const { data, error } = await this.db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) fail(error);
    return (data ?? []).map(rowToAudit);
  }
}
