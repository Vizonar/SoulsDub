import {
  CLASSIFICATION_KEYS,
  SELF_LEVEL_KEYS,
  VOICE_TONE_KEYS,
  VOICE_TYPE_KEYS,
  type ClassificationKey,
  type SelfLevel,
  type VoiceTone,
  type VoiceType,
} from './constants.js';
import type { Dubber } from './types.js';

export interface DashboardStats {
  total: number;
  active: number;
  byClassification: Record<ClassificationKey, number>;
  bySelfLevel: Record<SelfLevel, number>;
  byTone: Record<VoiceTone, number>;
  byType: Record<VoiceType, number>;
  /** Ativos com ao menos uma disponibilidade informada. */
  availableForProjects: number;
  recent: Dubber[];
  needsReview: Dubber[];
}

const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Todos os indicadores são derivados da lista recebida — nada é fixo. */
export function computeStats(dubbers: Dubber[], recentLimit = 5): DashboardStats {
  const s: DashboardStats = {
    total: dubbers.length,
    active: 0,
    byClassification: zero(CLASSIFICATION_KEYS),
    bySelfLevel: zero(SELF_LEVEL_KEYS),
    byTone: zero(VOICE_TONE_KEYS),
    byType: zero(VOICE_TYPE_KEYS),
    availableForProjects: 0,
    recent: [],
    needsReview: [],
  };
  for (const d of dubbers) {
    if (d.isActive) {
      s.active += 1;
      if (d.availability.length > 0) s.availableForProjects += 1;
    }
    s.byClassification[d.classification] += 1;
    s.bySelfLevel[d.selfLevel] += 1;
    s.byTone[d.voiceTone] += 1;
    for (const t of d.voiceTypes) s.byType[t] += 1;
  }
  s.recent = [...dubbers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, recentLimit);
  s.needsReview = dubbers
    .filter((d) => d.needsReview && d.isActive)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return s;
}
