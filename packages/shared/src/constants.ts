/** Opções oficiais da ficha e da classificação. Fonte única para bot, painel e banco. */

export const CLASSIFICATION_KEYS = ['novato', 'aprendiz', 'intermediario', 'avancado', 'elite'] as const;
export type ClassificationKey = (typeof CLASSIFICATION_KEYS)[number];
export const CLASSIFICATION_LABELS: Record<ClassificationKey, string> = {
  novato: 'NOVATO',
  aprendiz: 'APRENDIZ',
  intermediario: 'INTERMEDIÁRIO',
  avancado: 'AVANÇADO',
  elite: 'ELITE',
};

export const SELF_LEVEL_KEYS = ['iniciante', 'intermediario', 'avancado', 'profissional'] as const;
export type SelfLevel = (typeof SELF_LEVEL_KEYS)[number];
export const SELF_LEVEL_LABELS: Record<SelfLevel, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
  profissional: 'Profissional',
};

export const VOICE_TONE_KEYS = ['grave', 'medio', 'agudo', 'variavel'] as const;
export type VoiceTone = (typeof VOICE_TONE_KEYS)[number];
export const VOICE_TONE_LABELS: Record<VoiceTone, string> = {
  grave: 'Grave',
  medio: 'Médio',
  agudo: 'Agudo',
  variavel: 'Variável',
};

/** Descritores de voz para casting. Não inferem identidade de gênero. */
export const VOICE_TYPE_KEYS = ['masculina', 'feminina', 'neutra', 'infantil', 'adolescente', 'adulta'] as const;
export type VoiceType = (typeof VOICE_TYPE_KEYS)[number];
export const VOICE_TYPE_LABELS: Record<VoiceType, string> = {
  masculina: 'Masculina',
  feminina: 'Feminina',
  neutra: 'Neutra',
  infantil: 'Infantil',
  adolescente: 'Adolescente',
  adulta: 'Adulta',
};

export const INTENSITY_KEYS = ['baixa', 'media', 'alta'] as const;
export type Intensity = (typeof INTENSITY_KEYS)[number];
export const INTENSITY_LABELS: Record<Intensity, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

export const SPEECH_SPEED_KEYS = ['lenta', 'moderada', 'rapida'] as const;
export type SpeechSpeed = (typeof SPEECH_SPEED_KEYS)[number];
export const SPEECH_SPEED_LABELS: Record<SpeechSpeed, string> = { lenta: 'Lenta', moderada: 'Moderada', rapida: 'Rápida' };

/** Sugestões configuráveis. O usuário pode cadastrar novas categorias livremente (texto). */
export const AVAILABILITY_PRESETS = ['manha', 'tarde', 'noite', 'fins_de_semana', 'horarios_flexiveis'] as const;
export const AVAILABILITY_LABELS: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  fins_de_semana: 'Fins de semana',
  horarios_flexiveis: 'Horários flexíveis',
};

export const INTEREST_PRESETS = ['animacoes', 'jogos', 'fan_dubs', 'parodias', 'videos', 'audiobooks', 'narracao'] as const;
export const INTEREST_LABELS: Record<string, string> = {
  animacoes: 'Animações',
  jogos: 'Jogos',
  fan_dubs: 'Fan dubs',
  parodias: 'Paródias',
  videos: 'Vídeos',
  audiobooks: 'Audiobooks',
  narracao: 'Narração',
};

export const SPECIALTY_SUGGESTIONS = [
  'personagens sérios',
  'vilões',
  'protagonistas',
  'comédia',
  'narração',
  'personagens caricatos',
] as const;

const ALL_LABELS: Record<string, string> = {
  ...CLASSIFICATION_LABELS,
  ...SELF_LEVEL_LABELS,
  ...VOICE_TONE_LABELS,
  ...VOICE_TYPE_LABELS,
  ...INTENSITY_LABELS,
  ...SPEECH_SPEED_LABELS,
  ...AVAILABILITY_LABELS,
  ...INTEREST_LABELS,
};

/** Rótulo amigável; para categorias livres devolve o texto com a primeira letra maiúscula. */
export function labelOf(value: string): string {
  const known = ALL_LABELS[value];
  if (known) return known;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const classificationRank = (k: ClassificationKey): number => CLASSIFICATION_KEYS.indexOf(k) + 1;
export const selfLevelRank = (k: SelfLevel): number => SELF_LEVEL_KEYS.indexOf(k) + 1;
