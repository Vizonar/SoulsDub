import { z } from 'zod';
import {
  INTENSITY_KEYS,
  SELF_LEVEL_KEYS,
  SPEECH_SPEED_KEYS,
  VOICE_TONE_KEYS,
  VOICE_TYPE_KEYS,
  CLASSIFICATION_KEYS,
} from './constants.js';
import { normalizeTag } from './text.js';

export interface FormPolicy {
  /** A idade só é obrigatória se a política da comunidade exigir. */
  requireAge: boolean;
}
export const DEFAULT_POLICY: FormPolicy = { requireAge: false };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const tag = z
  .string()
  .trim()
  .min(1)
  .max(40, 'Cada item pode ter no máximo 40 caracteres.')
  .transform(normalizeTag);

const tagList = (max: number) =>
  z
    .array(tag)
    .max(max, `Informe no máximo ${max} itens.`)
    .transform((list) => [...new Set(list)]);

export function buildSchemas(policy: FormPolicy = DEFAULT_POLICY) {
  const age = policy.requireAge
    ? z.number({ error: 'Informe sua idade.' }).int('A idade deve ser um número inteiro.').min(1).max(120, 'Informe uma idade plausível.')
    : z.number().int('A idade deve ser um número inteiro.').min(1, 'Informe uma idade plausível.').max(120, 'Informe uma idade plausível.').optional();

  const personal = z.object({
    displayName: z.string({ error: 'Informe seu nome ou nick.' }).trim().min(1, 'Informe seu nome ou nick.').max(64, 'O nome pode ter no máximo 64 caracteres.'),
    age,
    pronouns: optionalText(40),
    selfLevel: z.enum(SELF_LEVEL_KEYS, { error: 'Escolha o seu nível.' }),
    experience: optionalText(2000),
  });

  const vocal = z.object({
    voiceTone: z.enum(VOICE_TONE_KEYS, { error: 'Escolha o tom de voz.' }),
    voiceTypes: z.array(z.enum(VOICE_TYPE_KEYS), { error: 'Escolha ao menos um tipo de voz.' }).min(1, 'Escolha ao menos um tipo de voz.').max(VOICE_TYPE_KEYS.length),
    intensity: z.enum(INTENSITY_KEYS, { error: 'Escolha a intensidade.' }),
    diction: optionalText(500),
    speechSpeed: z.enum(SPEECH_SPEED_KEYS, { error: 'Escolha a velocidade de fala.' }),
    specialties: tagList(20).default([]),
  });

  const availability = z.object({
    availability: tagList(15).default([]),
    interests: tagList(15).default([]),
    wantedCharacters: optionalText(2000),
  });

  const full = personal.extend(vocal.shape).extend(availability.shape);
  return { personal, vocal, availability, full };
}

const defaults = buildSchemas();
export const personalSchema = defaults.personal;
export const vocalSchema = defaults.vocal;
export const availabilitySchema = defaults.availability;
export const dubberFormSchema = defaults.full;

export type DubberFormInput = z.input<typeof dubberFormSchema>;
/** Dados validados da ficha. Repare: NÃO contém classificação oficial nem observações. */
export type DubberForm = z.output<typeof dubberFormSchema>;

export const classificationChangeSchema = z.object({
  newClassification: z.enum(CLASSIFICATION_KEYS),
  reason: z.string().trim().min(3, 'Explique o motivo da mudança.').max(1000),
});

export const reviewInputSchema = z.object({
  dubberId: z.string().min(1),
  newClassification: z.enum(CLASSIFICATION_KEYS).optional(),
  criteria: z
    .array(z.object({ label: z.string().trim().min(1).max(80), notes: optionalText(500) }))
    .max(20)
    .default([]),
  comments: optionalText(2000),
  reason: optionalText(1000),
});
export type ReviewInput = z.input<typeof reviewInputSchema>;

export const noteSchema = z.string().trim().min(1, 'Escreva a observação.').max(4000);

/** Converte erros do Zod em mensagens simples para exibir ao usuário. */
export function issuesToMessages(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((i) => i.message))];
}

export const sampleLabelSchema = optionalText(60);
