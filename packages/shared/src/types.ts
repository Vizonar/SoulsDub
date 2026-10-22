import type {
  ClassificationKey,
  Intensity,
  SelfLevel,
  SpeechSpeed,
  VoiceTone,
  VoiceType,
} from './constants.js';

export type Role = 'admin' | 'reviewer';

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export interface Dubber {
  id: string;
  discordId: string;
  displayName: string;
  age?: number;
  pronouns?: string;
  selfLevel: SelfLevel;
  experience?: string;
  voiceTone: VoiceTone;
  voiceTypes: VoiceType[];
  intensity: Intensity;
  diction?: string;
  speechSpeed: SpeechSpeed;
  specialties: string[];
  availability: string[];
  interests: string[];
  wantedCharacters?: string;
  /** Classificação oficial. Só muda via changeClassification (administradores). */
  classification: ClassificationKey;
  isActive: boolean;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCriterion {
  label: string;
  notes?: string;
}

export interface Review {
  id: string;
  dubberId: string;
  reviewerId: string;
  reviewerName: string;
  previousClassification: ClassificationKey;
  newClassification: ClassificationKey;
  criteria: ReviewCriterion[];
  comments?: string;
  reason?: string;
  createdAt: string;
}

export interface ClassificationHistoryEntry {
  id: string;
  dubberId: string;
  previousClassification: ClassificationKey | null;
  newClassification: ClassificationKey;
  reason: string;
  changedById: string | null;
  changedByName: string;
  reviewId?: string;
  createdAt: string;
}

export interface InternalNote {
  id: string;
  dubberId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface VoiceSample {
  id: string;
  dubberId: string;
  fileName: string;
  mimeType: 'audio/mpeg' | 'audio/wav';
  sizeBytes: number;
  label?: string;
  source: 'discord' | 'panel';
  uploadedByName: string;
  createdAt: string;
  /** URL temporária para ouvir (link assinado no Supabase; URL local no modo DEMO). */
  url?: string;
}

export interface DubberDetails {
  dubber: Dubber;
  reviews: Review[];
  history: ClassificationHistoryEntry[];
  /** Vazio quando o ator não tem permissão para ler observações internas. */
  notes: InternalNote[];
  audit: AuditLogEntry[];
  samples: VoiceSample[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
