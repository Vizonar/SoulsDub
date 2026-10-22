import {
  classificationRank,
  selfLevelRank,
  type ClassificationKey,
  type Intensity,
  type SelfLevel,
  type SpeechSpeed,
  type VoiceTone,
  type VoiceType,
} from './constants.js';
import { fold, normalizeTag } from './text.js';
import type { Dubber, Page } from './types.js';

export interface DubberFilters {
  search?: string;
  classification?: ClassificationKey;
  selfLevel?: SelfLevel;
  voiceTone?: VoiceTone;
  voiceType?: VoiceType;
  intensity?: Intensity;
  speechSpeed?: SpeechSpeed;
  specialty?: string;
  availability?: string;
  interest?: string;
  status?: 'active' | 'inactive' | 'all';
  needsReview?: boolean;
}

export type SortKey = 'displayName' | 'classification' | 'selfLevel' | 'updatedAt' | 'createdAt';
export interface SortSpec {
  key: SortKey;
  dir: 'asc' | 'desc';
}
export interface QueryParams {
  filters: DubberFilters;
  sort: SortSpec;
  page: number;
  pageSize: number;
}

export const DEFAULT_SORT: SortSpec = { key: 'updatedAt', dir: 'desc' };
export const DEFAULT_PAGE_SIZE = 10;

/** Todos os filtros combinam com E lógico. Filtros vazios são ignorados. */
export function filterDubbers(list: Dubber[], f: DubberFilters): Dubber[] {
  const q = f.search ? fold(f.search.trim()) : '';
  const specialty = f.specialty ? normalizeTag(f.specialty) : '';
  const availability = f.availability ? normalizeTag(f.availability) : '';
  const interest = f.interest ? normalizeTag(f.interest) : '';
  return list.filter((d) => {
    if (q && !fold(d.displayName).includes(q) && !d.discordId.includes(q)) return false;
    if (f.classification && d.classification !== f.classification) return false;
    if (f.selfLevel && d.selfLevel !== f.selfLevel) return false;
    if (f.voiceTone && d.voiceTone !== f.voiceTone) return false;
    if (f.voiceType && !d.voiceTypes.includes(f.voiceType)) return false;
    if (f.intensity && d.intensity !== f.intensity) return false;
    if (f.speechSpeed && d.speechSpeed !== f.speechSpeed) return false;
    if (specialty && !d.specialties.includes(specialty)) return false;
    if (availability && !d.availability.includes(availability)) return false;
    if (interest && !d.interests.includes(interest)) return false;
    if (f.status === 'active' && !d.isActive) return false;
    if (f.status === 'inactive' && d.isActive) return false;
    if (f.needsReview !== undefined && d.needsReview !== f.needsReview) return false;
    return true;
  });
}

export function sortDubbers(list: Dubber[], sort: SortSpec): Dubber[] {
  const mult = sort.dir === 'asc' ? 1 : -1;
  const value = (d: Dubber): number | string => {
    switch (sort.key) {
      case 'displayName': return d.displayName;
      case 'classification': return classificationRank(d.classification);
      case 'selfLevel': return selfLevelRank(d.selfLevel);
      case 'createdAt': return d.createdAt;
      default: return d.updatedAt;
    }
  };
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp =
      typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return cmp !== 0 ? cmp * mult : a.displayName.localeCompare(b.displayName, 'pt-BR');
  });
}

export function paginate<T>(list: T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  return { items: list.slice((current - 1) * size, current * size), total: list.length, page: current, pageSize: size };
}

export function runQuery(all: Dubber[], p: QueryParams): Page<Dubber> {
  return paginate(sortDubbers(filterDubbers(all, p.filters), p.sort), p.page, p.pageSize);
}

/** Valores distintos de um campo de lista (para montar menus de filtro). */
export function distinctValues(list: Dubber[], field: 'specialties' | 'availability' | 'interests'): string[] {
  return [...new Set(list.flatMap((d) => d[field]))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
