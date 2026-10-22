import { CLASSIFICATION_LABELS, labelOf, SELF_LEVEL_LABELS } from './constants.js';
import type { Dubber } from './types.js';

/** Evita "CSV injection" no Excel: células que começam com = + - @ viram texto. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS: [string, (d: Dubber) => unknown][] = [
  ['Nome / Nick', (d) => d.displayName],
  ['ID do Discord', (d) => d.discordId],
  ['Idade', (d) => d.age],
  ['Pronomes', (d) => d.pronouns],
  ['Nível autodeclarado', (d) => SELF_LEVEL_LABELS[d.selfLevel]],
  ['Tom de voz', (d) => labelOf(d.voiceTone)],
  ['Tipo de voz', (d) => d.voiceTypes.map(labelOf).join(' | ')],
  ['Intensidade', (d) => labelOf(d.intensity)],
  ['Velocidade de fala', (d) => labelOf(d.speechSpeed)],
  ['Especialidades', (d) => d.specialties.map(labelOf).join(' | ')],
  ['Disponibilidade', (d) => d.availability.map(labelOf).join(' | ')],
  ['Projetos de interesse', (d) => d.interests.map(labelOf).join(' | ')],
  ['Classificação oficial', (d) => CLASSIFICATION_LABELS[d.classification]],
  ['Ativo', (d) => (d.isActive ? 'sim' : 'não')],
  ['Atualizado em', (d) => d.updatedAt],
];

/**
 * CSV com BOM e CRLF (abre corretamente no Excel do Windows).
 * Nunca inclui observações internas.
 */
export function dubbersToCsv(dubbers: Dubber[]): string {
  const rows = [COLUMNS.map(([h]) => csvCell(h)).join(';')];
  for (const d of dubbers) rows.push(COLUMNS.map(([, get]) => csvCell(get(d))).join(';'));
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
