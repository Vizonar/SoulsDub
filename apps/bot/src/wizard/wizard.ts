import {
  AVAILABILITY_PRESETS,
  buildSchemas,
  dubberToFormInput,
  INTEREST_PRESETS,
  issuesToMessages,
  normalizeTag,
  parseListText,
  type Dubber,
  type DubberFormInput,
  type DubberRepository,
  type FormPolicy,
  type SubmitResult,
  type SubmitRules,
} from '@soul/shared';
import type { SelectField } from './ids.js';

export type WizardStep = 'personal' | 'vocal' | 'availability' | 'review';
export const STEP_ORDER: readonly WizardStep[] = ['personal', 'vocal', 'availability', 'review'];
export const STEP_TITLES: Record<WizardStep, string> = {
  personal: 'Informações pessoais e experiência',
  vocal: 'Perfil vocal',
  availability: 'Disponibilidade e interesses',
  review: 'Revisão e envio',
};

export type Draft = Partial<DubberFormInput>;

export interface WizardSession {
  userId: string;
  mode: 'create' | 'update';
  step: WizardStep;
  data: Draft;
  errors: string[];
  startedAt: number;
  touchedAt: number;
}

export function createSession(userId: string, now: number, existing?: Dubber | null): WizardSession {
  return {
    userId,
    mode: existing ? 'update' : 'create',
    step: 'personal',
    data: existing ? dubberToFormInput(existing) : {},
    errors: [],
    startedAt: now,
    touchedAt: now,
  };
}

/** Mescla um trecho nas respostas atuais. NUNCA descarta o que já foi preenchido. */
export function applyPatch(s: WizardSession, patch: Draft, now: number): WizardSession {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const cleared = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] === undefined);
  const data: Draft = { ...s.data, ...defined };
  // "campo opcional apagado no modal" precisa limpar o valor antigo
  for (const k of cleared) delete (data as Record<string, unknown>)[k];
  return { ...s, data, errors: [], touchedAt: now };
}

export interface StepCheck {
  ok: boolean;
  errors: string[];
}

export function validateStep(data: Draft, step: WizardStep, policy: FormPolicy): StepCheck {
  const schemas = buildSchemas(policy);
  const schema = step === 'personal' ? schemas.personal : step === 'vocal' ? schemas.vocal : step === 'availability' ? schemas.availability : schemas.full;
  const r = schema.safeParse(data);
  return r.success ? { ok: true, errors: [] } : { ok: false, errors: issuesToMessages(r.error) };
}

export function advance(s: WizardSession, policy: FormPolicy, now: number): WizardSession {
  const check = validateStep(s.data, s.step, policy);
  if (!check.ok) return { ...s, errors: check.errors, touchedAt: now };
  const next = STEP_ORDER[STEP_ORDER.indexOf(s.step) + 1] ?? s.step;
  return { ...s, step: next, errors: [], touchedAt: now };
}

export function goBack(s: WizardSession, now: number): WizardSession {
  const prev = STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(s.step) - 1)] ?? s.step;
  return { ...s, step: prev, errors: [], touchedAt: now };
}

// ---------------------------------------------------------------- entradas dos modais
export interface Parsed {
  patch: Draft;
  errors: string[];
}

export function parsePersonalModal(f: { displayName: string; age: string; pronouns: string; experience: string }): Parsed {
  const errors: string[] = [];
  const ageText = f.age.trim();
  let age: number | undefined;
  if (ageText) {
    if (!/^\d{1,3}$/.test(ageText)) errors.push('A idade deve ser um número inteiro.');
    else age = Number(ageText);
  }
  return {
    patch: { displayName: f.displayName.trim(), age, pronouns: f.pronouns.trim() || undefined, experience: f.experience.trim() || undefined },
    errors,
  };
}

export function parseVocalModal(f: { diction: string; specialties: string }): Parsed {
  return { patch: { diction: f.diction.trim() || undefined, specialties: parseListText(f.specialties) }, errors: [] };
}

export function parseAvailabilityModal(f: { wantedCharacters: string; extraAvailability: string; extraInterests: string }, current: Draft): Parsed {
  return {
    patch: {
      wantedCharacters: f.wantedCharacters.trim() || undefined,
      availability: mergeTags(current.availability, AVAILABILITY_PRESETS, { customs: parseListText(f.extraAvailability) }),
      interests: mergeTags(current.interests, INTEREST_PRESETS, { customs: parseListText(f.extraInterests) }),
    },
    errors: [],
  };
}

/** Lista = opções sugeridas marcadas no menu + itens livres digitados. Cada origem é substituída sem apagar a outra. */
export function mergeTags(
  current: readonly string[] | undefined,
  presets: readonly string[],
  next: { presets?: string[]; customs?: string[] },
): string[] {
  const cur = current ?? [];
  const keptPresets = next.presets ?? cur.filter((t) => presets.includes(t));
  const keptCustoms = next.customs ?? cur.filter((t) => !presets.includes(t));
  return [...new Set([...keptPresets, ...keptCustoms.map(normalizeTag)])];
}

/** Aplica a escolha de um menu de seleção. Valida contra a lista fechada: valores forjados são ignorados. */
export function applySelect(s: WizardSession, field: SelectField, values: string[], allowed: readonly string[], now: number): WizardSession {
  const valid = values.filter((v) => allowed.includes(v));
  switch (field) {
    case 'voiceTypes':
      return applyPatch(s, { voiceTypes: valid as DubberFormInput['voiceTypes'] }, now);
    case 'availability':
      return applyPatch(s, { availability: mergeTags(s.data.availability, AVAILABILITY_PRESETS, { presets: valid }) }, now);
    case 'interests':
      return applyPatch(s, { interests: mergeTags(s.data.interests, INTEREST_PRESETS, { presets: valid }) }, now);
    default: {
      const v = valid[0];
      return v ? applyPatch(s, { [field]: v } as Draft, now) : s;
    }
  }
}

// ---------------------------------------------------------------- envio
export type SubmitOutcome = SubmitResult | { status: 'invalid'; errors: string[] };

export async function submitSession(repo: DubberRepository, s: WizardSession, rules: SubmitRules, policy: FormPolicy): Promise<SubmitOutcome> {
  const r = buildSchemas(policy).full.safeParse(s.data);
  if (!r.success) return { status: 'invalid', errors: issuesToMessages(r.error) };
  return repo.upsertFromForm(s.userId, r.data, rules);
}

// ---------------------------------------------------------------- armazenamento temporário
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Rascunhos em memória (um por usuário). Ao reiniciar o bot os rascunhos são perdidos; fichas enviadas ficam no banco. */
export class SessionStore {
  private map = new Map<string, WizardSession>();
  constructor(private readonly ttlMs = SESSION_TTL_MS) {}

  get(userId: string, now: number): WizardSession | undefined {
    const s = this.map.get(userId);
    if (!s) return undefined;
    if (now - s.touchedAt > this.ttlMs) {
      this.map.delete(userId);
      return undefined;
    }
    return s;
  }
  set(s: WizardSession) {
    this.map.set(s.userId, s);
  }
  delete(userId: string) {
    this.map.delete(userId);
  }
  sweep(now: number) {
    for (const [k, v] of this.map) if (now - v.touchedAt > this.ttlMs) this.map.delete(k);
  }
  get size() {
    return this.map.size;
  }
}
