import { describe, expect, it } from 'vitest';
import { createDemoSeed } from './demo-data.js';
import { distinctValues, filterDubbers, paginate, runQuery, sortDubbers } from './query.js';
import { computeStats } from './stats.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const all = createDemoSeed(NOW).dubbers;

describe('busca, filtros, ordenação e paginação', () => {
  it('busca por nome sem diferenciar acentos/caixa e por ID do Discord', () => {
    expect(filterDubbers(all, { search: 'theo' }).map((d) => d.displayName)).toEqual(['Théo Grave']);
    expect(filterDubbers(all, { search: 'AURORA' })).toHaveLength(1);
    expect(filterDubbers(all, { search: '990000000000000005' })[0]?.displayName).toBe('Luma Faísca');
  });

  it('cada filtro isolado devolve apenas registros que o satisfazem', () => {
    for (const d of filterDubbers(all, { classification: 'elite' })) expect(d.classification).toBe('elite');
    for (const d of filterDubbers(all, { voiceType: 'adolescente' })) expect(d.voiceTypes).toContain('adolescente');
    for (const d of filterDubbers(all, { availability: 'noite' })) expect(d.availability).toContain('noite');
    for (const d of filterDubbers(all, { interest: 'jogos' })) expect(d.interests).toContain('jogos');
    for (const d of filterDubbers(all, { status: 'inactive' })) expect(d.isActive).toBe(false);
  });

  it('combina vários filtros simultaneamente (E lógico)', () => {
    const f = { voiceTone: 'medio', intensity: 'media', availability: 'noite' } as const;
    const r = filterDubbers(all, f);
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(filterDubbers(all, { voiceTone: 'medio' }).length);
    for (const d of r) {
      expect(d.voiceTone).toBe('medio');
      expect(d.intensity).toBe('media');
      expect(d.availability).toContain('noite');
    }
    expect(filterDubbers(all, { classification: 'elite', voiceTone: 'medio', speechSpeed: 'rapida', intensity: 'baixa', selfLevel: 'iniciante' })).toHaveLength(0);
  });

  it('filtra por especialidade criada livremente', () => {
    const d = all[0]!;
    const custom = [{ ...d, id: 'x', discordId: '1'.repeat(18), specialties: ['voz de dragão'] }, ...all];
    expect(filterDubbers(custom, { specialty: 'Voz de Dragão' })).toHaveLength(1);
    expect(distinctValues(custom, 'specialties')).toContain('voz de dragão');
  });

  it('ordena por classificação respeitando a hierarquia (não alfabética)', () => {
    const asc = sortDubbers(all, { key: 'classification', dir: 'asc' }).map((d) => d.classification);
    const order = ['novato', 'aprendiz', 'intermediario', 'avancado', 'elite'];
    const idx = asc.map((c) => order.indexOf(c));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    const byName = sortDubbers(all, { key: 'displayName', dir: 'asc' }).map((d) => d.displayName);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('pagina, limita a página ao intervalo válido e não perde itens', () => {
    expect(all.length).toBeGreaterThanOrEqual(20);
    const p1 = paginate(all, 1, 10);
    const p3 = paginate(all, 3, 10);
    expect(p1.items).toHaveLength(10);
    expect(p3.items).toHaveLength(all.length - 20);
    expect(paginate(all, 99, 10).page).toBe(3);
    expect(paginate(all, 0, 10).page).toBe(1);
    expect(paginate([], 1, 10)).toMatchObject({ total: 0, page: 1, items: [] });
    const seen = new Set([1, 2, 3].flatMap((n) => paginate(all, n, 10).items.map((d) => d.id)));
    expect(seen.size).toBe(all.length);
  });

  it('runQuery encadeia filtro, ordenação e paginação', () => {
    const r = runQuery(all, { filters: { status: 'active' }, sort: { key: 'displayName', dir: 'asc' }, page: 1, pageSize: 5 });
    expect(r.items).toHaveLength(5);
    expect(r.total).toBe(all.filter((d) => d.isActive).length);
  });
});

describe('estatísticas do dashboard', () => {
  it('são derivadas dos dados (e mudam quando os dados mudam)', () => {
    const s = computeStats(all);
    expect(s.total).toBe(all.length);
    expect(Object.values(s.byClassification).reduce((a, b) => a + b, 0)).toBe(all.length);
    expect(Object.values(s.bySelfLevel).reduce((a, b) => a + b, 0)).toBe(all.length);
    expect(Object.values(s.byTone).reduce((a, b) => a + b, 0)).toBe(all.length);
    expect(s.availableForProjects).toBe(all.filter((d) => d.isActive && d.availability.length > 0).length);
    expect(s.needsReview.every((d) => d.needsReview && d.isActive)).toBe(true);
    expect(s.recent).toHaveLength(5);
    const s2 = computeStats(all.slice(0, 3));
    expect(s2.total).toBe(3);
    expect(computeStats([]).total).toBe(0);
  });
});
