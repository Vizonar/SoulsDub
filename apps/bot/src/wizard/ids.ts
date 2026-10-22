/** IDs de componentes. Formato: sd:<tipo>:<argumento>. Limite do Discord: 100 caracteres. */
export const IDS = {
  start: 'sd:start',
  nav: (a: 'next' | 'back' | 'cancel' | 'submit') => `sd:nav:${a}`,
  select: (f: SelectField) => `sd:sel:${f}`,
  open: (m: ModalName) => `sd:open:${m}`,
  modal: (m: ModalName) => `sd:modal:${m}`,
} as const;

export type SelectField = 'selfLevel' | 'voiceTone' | 'voiceTypes' | 'intensity' | 'speechSpeed' | 'availability' | 'interests';
export type ModalName = 'personal' | 'vocal' | 'availability';

const SELECTS: SelectField[] = ['selfLevel', 'voiceTone', 'voiceTypes', 'intensity', 'speechSpeed', 'availability', 'interests'];
const MODALS: ModalName[] = ['personal', 'vocal', 'availability'];

export type ParsedId =
  | { kind: 'start' }
  | { kind: 'nav'; action: 'next' | 'back' | 'cancel' | 'submit' }
  | { kind: 'select'; field: SelectField }
  | { kind: 'open'; modal: ModalName }
  | { kind: 'modal'; modal: ModalName }
  | { kind: 'unknown' };

export function parseCustomId(id: string): ParsedId {
  const [ns, kind, arg] = id.split(':');
  if (ns !== 'sd') return { kind: 'unknown' };
  if (kind === 'start' && arg === undefined) return { kind: 'start' };
  if (kind === 'nav' && (arg === 'next' || arg === 'back' || arg === 'cancel' || arg === 'submit')) return { kind: 'nav', action: arg };
  if (kind === 'sel' && SELECTS.includes(arg as SelectField)) return { kind: 'select', field: arg as SelectField };
  if (kind === 'open' && MODALS.includes(arg as ModalName)) return { kind: 'open', modal: arg as ModalName };
  if (kind === 'modal' && MODALS.includes(arg as ModalName)) return { kind: 'modal', modal: arg as ModalName };
  return { kind: 'unknown' };
}
