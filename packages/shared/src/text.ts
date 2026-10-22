/** Normaliza tags livres (especialidades, disponibilidade, interesses). */
export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Converte "a, b; c\nd" em lista de tags únicas e normalizadas. */
export function parseListText(text: string | undefined | null): string[] {
  if (!text) return [];
  const parts = text
    .split(/[,;\n]+/)
    .map(normalizeTag)
    .filter((p) => p.length > 0);
  return [...new Set(parts)];
}

/** Minúsculas sem acentos, para buscas tolerantes. */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
