import type { ClassificationKey } from './constants.js';
import { assertCan } from './permissions.js';
import { runQuery, type QueryParams } from './query.js';
import {
  classificationChangeSchema,
  dubberFormSchema,
  issuesToMessages,
  noteSchema,
  reviewInputSchema,
  sampleLabelSchema,
  type DubberForm,
  type DubberFormInput,
  type ReviewInput,
} from './schemas.js';
import { MAX_SAMPLES_PER_DUBBER, validateAudioFile, formatBytes, type AudioFileInput } from './samples.js';
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
import type { ZodError } from 'zod';

export class NotFoundError extends Error {
  constructor(what = 'Registro') {
    super(`${what} não encontrado.`);
    this.name = 'NotFoundError';
  }
}
export class ValidationError extends Error {
  readonly messages: string[];
  constructor(messages: string[]) {
    super(messages.join(' '));
    this.name = 'ValidationError';
    this.messages = messages;
  }
  static from(error: ZodError) {
    return new ValidationError(issuesToMessages(error));
  }
}

export interface SubmitRules {
  /** Permite que o candidato atualize a própria ficha depois de enviada. */
  allowUpdates: boolean;
  /** Intervalo mínimo entre atualizações (0 = sem limite). */
  updateCooldownHours: number;
}
export const DEFAULT_SUBMIT_RULES: SubmitRules = { allowUpdates: true, updateCooldownHours: 0 };

export type SubmitResult =
  | { status: 'created' | 'updated'; dubber: Dubber }
  | { status: 'blocked'; reason: 'updates_disabled' | 'cooldown'; retryAt?: string };

export type SampleSubmitResult =
  | { status: 'added'; sample: VoiceSample }
  | { status: 'no_profile' }
  | { status: 'limit_reached'; max: number }
  | { status: 'invalid'; errors: string[] };

export type ReviewWithName = Review & { dubberName: string };

export interface DubberRepository {
  readonly kind: 'memory' | 'supabase';
  // ---- Usado pelo bot (contexto de sistema, sem ator administrativo) ----
  findByDiscordId(discordId: string): Promise<Dubber | null>;
  upsertFromForm(discordId: string, form: DubberForm, rules?: SubmitRules): Promise<SubmitResult>;
  /** Amostra enviada pelo próprio dublador via Discord (exige ficha já cadastrada). */
  addSampleFromDiscord(discordId: string, file: AudioFileInput, label?: string): Promise<SampleSubmitResult>;
  // ---- Usado pelo painel (sempre com um ator autenticado) ----
  query(actor: Actor, params: QueryParams): Promise<Page<Dubber>>;
  listAll(actor: Actor): Promise<Dubber[]>;
  getDetails(actor: Actor, id: string): Promise<DubberDetails>;
  updateDubber(actor: Actor, id: string, patch: Partial<DubberFormInput>): Promise<Dubber>;
  setActive(actor: Actor, id: string, active: boolean): Promise<Dubber>;
  changeClassification(actor: Actor, id: string, next: ClassificationKey, reason: string): Promise<Dubber>;
  addReview(actor: Actor, input: ReviewInput): Promise<Review>;
  markReviewed(actor: Actor, id: string): Promise<Dubber>;
  addNote(actor: Actor, id: string, body: string): Promise<InternalNote>;
  addSample(actor: Actor, dubberId: string, file: AudioFileInput, label?: string): Promise<VoiceSample>;
  deleteSample(actor: Actor, sampleId: string): Promise<void>;
  listReviews(actor: Actor): Promise<ReviewWithName[]>;
  listAudit(actor: Actor): Promise<AuditLogEntry[]>;
}

export function dubberToFormInput(d: Dubber): DubberFormInput {
  return {
    displayName: d.displayName,
    age: d.age,
    pronouns: d.pronouns,
    selfLevel: d.selfLevel,
    experience: d.experience,
    voiceTone: d.voiceTone,
    voiceTypes: [...d.voiceTypes],
    intensity: d.intensity,
    diction: d.diction,
    speechSpeed: d.speechSpeed,
    specialties: [...d.specialties],
    availability: [...d.availability],
    interests: [...d.interests],
    wantedCharacters: d.wantedCharacters,
  };
}

export function parseForm(input: unknown): DubberForm {
  const r = dubberFormSchema.safeParse(input);
  if (!r.success) throw ValidationError.from(r.error);
  return r.data;
}

const newId = (): string => globalThis.crypto.randomUUID();

export interface MemorySeed {
  dubbers: Dubber[];
  reviews: Review[];
  history: ClassificationHistoryEntry[];
  notes: InternalNote[];
  audit: AuditLogEntry[];
  samples: { meta: VoiceSample; bytes: Uint8Array }[];
}

/**
 * Repositório em memória. Usado no modo DEMO e nos testes.
 * Nunca acessa rede, disco ou localStorage — os dados somem ao recarregar a página.
 */
export class MemoryRepository implements DubberRepository {
  readonly kind = 'memory' as const;
  private s: MemorySeed;

  constructor(seed?: Partial<MemorySeed>, private readonly clock: () => Date = () => new Date()) {
    this.s = structuredClone({ dubbers: [], reviews: [], history: [], notes: [], audit: [], samples: [], ...seed });
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private log(actor: { id: string | null; name: string }, action: string, entityId: string, details?: Record<string, unknown>, entity = 'dubber') {
    this.s.audit.push({ id: newId(), actorId: actor.id, actorName: actor.name, action, entity, entityId, details, createdAt: this.now() });
  }

  private find(id: string): Dubber {
    const d = this.s.dubbers.find((x) => x.id === id);
    if (!d) throw new NotFoundError('Dubrador');
    return d;
  }

  async findByDiscordId(discordId: string) {
    const d = this.s.dubbers.find((x) => x.discordId === discordId);
    return d ? structuredClone(d) : null;
  }

  async upsertFromForm(discordId: string, form: DubberForm, rules: SubmitRules = DEFAULT_SUBMIT_RULES): Promise<SubmitResult> {
    if (!/^\d{15,25}$/.test(discordId)) throw new ValidationError(['ID do Discord inválido.']);
    const existing = this.s.dubbers.find((x) => x.discordId === discordId);
    const now = this.now();
    if (!existing) {
      const d: Dubber = {
        ...form, id: newId(), discordId, classification: 'novato', isActive: true, needsReview: true, createdAt: now, updatedAt: now,
      };
      this.s.dubbers.push(d);
      this.log({ id: null, name: 'Bot do Discord' }, 'dubber.created', d.id);
      return { status: 'created', dubber: structuredClone(d) };
    }
    if (!rules.allowUpdates) return { status: 'blocked', reason: 'updates_disabled' };
    if (rules.updateCooldownHours > 0) {
      const retryAt = new Date(new Date(existing.updatedAt).getTime() + rules.updateCooldownHours * 3600_000);
      if (retryAt.getTime() > this.clock().getTime()) return { status: 'blocked', reason: 'cooldown', retryAt: retryAt.toISOString() };
    }
    // Só campos autodeclarados: classificação, id, discordId e datas de criação não são tocados.
    Object.assign(existing, form, { needsReview: true, updatedAt: now });
    this.log({ id: null, name: 'Bot do Discord' }, 'dubber.self_updated', existing.id);
    return { status: 'updated', dubber: structuredClone(existing) };
  }

  async query(actor: Actor, params: QueryParams) {
    assertCan(actor.role, 'dubber.read');
    return structuredClone(runQuery(this.s.dubbers, params));
  }

  async listAll(actor: Actor) {
    assertCan(actor.role, 'dubber.read');
    return structuredClone(this.s.dubbers);
  }

  async getDetails(actor: Actor, id: string): Promise<DubberDetails> {
    assertCan(actor.role, 'dubber.read');
    const dubber = this.find(id);
    const canNotes = actor.role === 'admin' || actor.role === 'reviewer';
    const byDate = <T extends { createdAt: string }>(a: T[]) => [...a].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    const details = structuredClone({
      dubber,
      reviews: byDate(this.s.reviews.filter((r) => r.dubberId === id)),
      history: byDate(this.s.history.filter((h) => h.dubberId === id)),
      notes: canNotes ? byDate(this.s.notes.filter((n) => n.dubberId === id)) : [],
      audit: actor.role === 'admin' ? byDate(this.s.audit.filter((a) => a.entityId === id)) : [],
      samples: [],
    }) satisfies DubberDetails;
    return { ...details, samples: this.samplesOf(id) };
  }

  private samplesOf(dubberId: string): VoiceSample[] {
    return this.s.samples
      .filter((x) => x.meta.dubberId === dubberId)
      .sort((a, b) => b.meta.createdAt.localeCompare(a.meta.createdAt))
      .map((x) => ({ ...x.meta, url: URL.createObjectURL(new Blob([x.bytes as unknown as ArrayBuffer], { type: x.meta.mimeType })) }));
  }

  private storeSample(dubber: Dubber, file: AudioFileInput, label: string | undefined, source: 'discord' | 'panel', by: string): VoiceSample {
    const v = validateAudioFile(file);
    if (!v.ok || !v.mimeType) throw new ValidationError(v.errors);
    const meta: VoiceSample = {
      id: newId(), dubberId: dubber.id, fileName: v.fileName, mimeType: v.mimeType, sizeBytes: file.bytes.length,
      label: sampleLabelSchema.parse(label), source, uploadedByName: by, createdAt: this.now(),
    };
    this.s.samples.push({ meta, bytes: new Uint8Array(file.bytes) });
    return meta;
  }

  async addSampleFromDiscord(discordId: string, file: AudioFileInput, label?: string): Promise<SampleSubmitResult> {
    const d = this.s.dubbers.find((x) => x.discordId === discordId);
    if (!d) return { status: 'no_profile' };
    const v = validateAudioFile(file);
    if (!v.ok) return { status: 'invalid', errors: v.errors };
    if (this.s.samples.filter((x) => x.meta.dubberId === d.id).length >= MAX_SAMPLES_PER_DUBBER) return { status: 'limit_reached', max: MAX_SAMPLES_PER_DUBBER };
    const meta = this.storeSample(d, file, label, 'discord', d.displayName);
    d.needsReview = true;
    this.log({ id: null, name: 'Bot do Discord' }, 'sample.created', d.id, { size: formatBytes(meta.sizeBytes) });
    return { status: 'added', sample: structuredClone(meta) };
  }

  async addSample(actor: Actor, dubberId: string, file: AudioFileInput, label?: string) {
    assertCan(actor.role, 'sample.upload');
    const d = this.find(dubberId);
    if (this.s.samples.filter((x) => x.meta.dubberId === d.id).length >= MAX_SAMPLES_PER_DUBBER) {
      throw new ValidationError([`Limite de ${MAX_SAMPLES_PER_DUBBER} amostras por dublador. Remova uma antes de enviar outra.`]);
    }
    const meta = this.storeSample(d, file, label, 'panel', actor.name);
    this.log(actor, 'sample.created', d.id, { size: formatBytes(meta.sizeBytes) });
    return structuredClone(meta);
  }

  async deleteSample(actor: Actor, sampleId: string) {
    assertCan(actor.role, 'sample.delete');
    const i = this.s.samples.findIndex((x) => x.meta.id === sampleId);
    if (i < 0) throw new NotFoundError('Amostra');
    const [removed] = this.s.samples.splice(i, 1);
    this.log(actor, 'sample.deleted', (removed as { meta: VoiceSample }).meta.dubberId);
  }

  async updateDubber(actor: Actor, id: string, patch: Partial<DubberFormInput>) {
    assertCan(actor.role, 'dubber.edit');
    const d = this.find(id);
    const merged = parseForm({ ...dubberToFormInput(d), ...patch });
    const changed = Object.keys(merged).filter((k) => JSON.stringify(merged[k as keyof DubberForm]) !== JSON.stringify(d[k as keyof Dubber]));
    Object.assign(d, merged, { updatedAt: this.now() });
    this.log(actor, 'dubber.updated', id, { changed });
    return structuredClone(d);
  }

  async setActive(actor: Actor, id: string, active: boolean) {
    assertCan(actor.role, 'dubber.setActive');
    const d = this.find(id);
    d.isActive = active;
    d.updatedAt = this.now();
    this.log(actor, 'dubber.active_changed', id, { isActive: active });
    return structuredClone(d);
  }

  private applyClassification(actor: Actor, d: Dubber, next: ClassificationKey, reason: string, reviewId?: string) {
    const entry: ClassificationHistoryEntry = {
      id: newId(), dubberId: d.id, previousClassification: d.classification, newClassification: next,
      reason, changedById: actor.id, changedByName: actor.name, reviewId, createdAt: this.now(),
    };
    this.s.history.push(entry); // append-only: nunca sobrescreve registros anteriores
    this.log(actor, 'classification.changed', d.id, { from: d.classification, to: next });
    d.classification = next;
    d.updatedAt = entry.createdAt;
  }

  async changeClassification(actor: Actor, id: string, next: ClassificationKey, reason: string) {
    assertCan(actor.role, 'classification.change');
    const parsed = classificationChangeSchema.safeParse({ newClassification: next, reason });
    if (!parsed.success) throw ValidationError.from(parsed.error);
    const d = this.find(id);
    if (d.classification === next) throw new ValidationError(['A ficha já está nessa classificação.']);
    this.applyClassification(actor, d, next, parsed.data.reason);
    return structuredClone(d);
  }

  async addReview(actor: Actor, input: ReviewInput) {
    assertCan(actor.role, 'review.create');
    const parsed = reviewInputSchema.safeParse(input);
    if (!parsed.success) throw ValidationError.from(parsed.error);
    const v = parsed.data;
    const d = this.find(v.dubberId);
    const next = v.newClassification ?? d.classification;
    const changes = next !== d.classification;
    if (changes) {
      assertCan(actor.role, 'classification.change'); // avaliador não altera classificação
      if (!v.reason) throw new ValidationError(['Informe o motivo da mudança de classificação.']);
    }
    const review: Review = {
      id: newId(), dubberId: d.id, reviewerId: actor.id, reviewerName: actor.name,
      previousClassification: d.classification, newClassification: next,
      criteria: v.criteria, comments: v.comments, reason: v.reason, createdAt: this.now(),
    };
    this.s.reviews.push(review);
    this.log(actor, 'review.created', d.id, { reviewId: review.id });
    if (changes) this.applyClassification(actor, d, next, v.reason as string, review.id);
    d.needsReview = false;
    return structuredClone(review);
  }

  async markReviewed(actor: Actor, id: string) {
    assertCan(actor.role, 'review.create');
    const d = this.find(id);
    d.needsReview = false;
    this.log(actor, 'dubber.reviewed', id);
    return structuredClone(d);
  }

  async addNote(actor: Actor, id: string, body: string) {
    assertCan(actor.role, 'note.create');
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) throw ValidationError.from(parsed.error);
    this.find(id);
    const note: InternalNote = { id: newId(), dubberId: id, authorId: actor.id, authorName: actor.name, body: parsed.data, createdAt: this.now() };
    this.s.notes.push(note);
    this.log(actor, 'note.created', id, undefined);
    return structuredClone(note);
  }

  async listReviews(actor: Actor) {
    assertCan(actor.role, 'dubber.read');
    const names = new Map(this.s.dubbers.map((d) => [d.id, d.displayName]));
    return structuredClone(
      [...this.s.reviews]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({ ...r, dubberName: names.get(r.dubberId) ?? '(removido)' })),
    );
  }

  async listAudit(actor: Actor) {
    assertCan(actor.role, 'audit.read');
    return structuredClone([...this.s.audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
}
