import { describe, expect, it } from 'vitest';
import { createDemoRepository, DEMO_ADMIN, DEMO_REVIEWER } from './demo-data.js';
import { MemoryRepository, parseForm, ValidationError } from './repository.js';
import { PermissionError } from './permissions.js';
import { validForm } from './fixtures.test-util.js';
import { DEFAULT_SORT } from './query.js';
import type { Actor } from './types.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const D1 = '123456789012345678';
const fresh = () => new MemoryRepository({}, () => NOW);

describe('cadastro, duplicidade e atualização', () => {
  it('cria ficha nova como NOVATO, ativa e pendente de revisão, associada ao ID do Discord', async () => {
    const repo = fresh();
    const r = await repo.upsertFromForm(D1, parseForm(validForm()));
    expect(r.status).toBe('created');
    if (r.status !== 'created') return;
    expect(r.dubber).toMatchObject({ discordId: D1, classification: 'novato', isActive: true, needsReview: true });
    expect(r.dubber.createdAt).toBe(NOW.toISOString());
    expect(r.dubber.updatedAt).toBe(NOW.toISOString());
  });

  it('impede duplicação: o mesmo ID do Discord nunca gera dois registros', async () => {
    const repo = fresh();
    await repo.upsertFromForm(D1, parseForm(validForm()));
    const second = await repo.upsertFromForm(D1, parseForm(validForm({ displayName: 'Outro Nick' })));
    expect(second.status).toBe('updated');
    expect(await repo.listAll(DEMO_ADMIN)).toHaveLength(1);
    expect((await repo.findByDiscordId(D1))?.displayName).toBe('Outro Nick');
  });

  it('atualização pelo candidato NÃO altera classificação oficial nem status', async () => {
    const repo = fresh();
    const created = await repo.upsertFromForm(D1, parseForm(validForm()));
    if (created.status !== 'created') throw new Error('esperado created');
    await repo.changeClassification(DEMO_ADMIN, created.dubber.id, 'avancado', 'Avaliação inicial');
    await repo.setActive(DEMO_ADMIN, created.dubber.id, false);
    const forged = parseForm({ ...validForm({ displayName: 'Hacker' }), classification: 'elite', isActive: true });
    await repo.upsertFromForm(D1, forged);
    const after = await repo.findByDiscordId(D1);
    expect(after).toMatchObject({ displayName: 'Hacker', classification: 'avancado', isActive: false, needsReview: true });
  });

  it('respeita a regra "atualizações desativadas"', async () => {
    const repo = fresh();
    await repo.upsertFromForm(D1, parseForm(validForm()));
    const r = await repo.upsertFromForm(D1, parseForm(validForm({ displayName: 'Novo' })), { allowUpdates: false, updateCooldownHours: 0 });
    expect(r).toEqual({ status: 'blocked', reason: 'updates_disabled' });
    expect((await repo.findByDiscordId(D1))?.displayName).toBe('Teste Voz');
  });

  it('respeita o intervalo mínimo entre atualizações', async () => {
    let now = NOW;
    const repo = new MemoryRepository({}, () => now);
    await repo.upsertFromForm(D1, parseForm(validForm()));
    const rules = { allowUpdates: true, updateCooldownHours: 24 };
    const early = await repo.upsertFromForm(D1, parseForm(validForm({ displayName: 'Cedo' })), rules);
    expect(early.status).toBe('blocked');
    if (early.status === 'blocked') expect(early.reason).toBe('cooldown');
    now = new Date(NOW.getTime() + 25 * 3600_000);
    expect((await repo.upsertFromForm(D1, parseForm(validForm({ displayName: 'Tarde' })), rules)).status).toBe('updated');
  });

  it('rejeita ID do Discord inválido', async () => {
    await expect(fresh().upsertFromForm('abc', parseForm(validForm()))).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('classificação, histórico e avaliações', () => {
  it('altera a classificação e registra histórico sem sobrescrever os anteriores', async () => {
    const repo = createDemoRepository(NOW);
    const target = (await repo.listAll(DEMO_ADMIN)).find((d) => d.classification === 'novato')!;
    const before = (await repo.getDetails(DEMO_ADMIN, target.id)).history.length;
    await repo.changeClassification(DEMO_ADMIN, target.id, 'aprendiz', 'Bom desempenho');
    await repo.changeClassification(DEMO_ADMIN, target.id, 'intermediario', 'Evolução contínua');
    const d = await repo.getDetails(DEMO_ADMIN, target.id);
    expect(d.dubber.classification).toBe('intermediario');
    expect(d.history).toHaveLength(before + 2);
    const latest = d.history.filter((h) => h.reason === 'Bom desempenho' || h.reason === 'Evolução contínua');
    expect(latest.map((h) => [h.previousClassification, h.newClassification]).sort()).toEqual([
      ['aprendiz', 'intermediario'],
      ['novato', 'aprendiz'],
    ]);
    expect(latest.every((h) => h.changedByName === DEMO_ADMIN.name)).toBe(true);
    expect(d.audit.some((a) => a.action === 'classification.changed')).toBe(true);
  });

  it('exige motivo e uma classificação diferente da atual', async () => {
    const repo = createDemoRepository(NOW);
    const d = (await repo.listAll(DEMO_ADMIN))[0]!;
    await expect(repo.changeClassification(DEMO_ADMIN, d.id, 'elite', '')).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.changeClassification(DEMO_ADMIN, d.id, d.classification, 'mesma classificação')).rejects.toBeInstanceOf(ValidationError);
  });

  it('avaliação com mudança registra avaliação + histórico e limpa a pendência de revisão', async () => {
    const repo = createDemoRepository(NOW);
    const d = (await repo.listAll(DEMO_ADMIN)).find((x) => x.needsReview && x.classification === 'novato')!;
    const review = await repo.addReview(DEMO_ADMIN, {
      dubberId: d.id, newClassification: 'aprendiz', reason: 'Passou na avaliação', criteria: [{ label: 'Interpretação' }],
    });
    expect(review).toMatchObject({ previousClassification: 'novato', newClassification: 'aprendiz', reviewerName: DEMO_ADMIN.name });
    const det = await repo.getDetails(DEMO_ADMIN, d.id);
    expect(det.dubber).toMatchObject({ classification: 'aprendiz', needsReview: false });
    expect(det.history.some((h) => h.reviewId === review.id)).toBe(true);
  });

  it('avaliação sem mudança mantém a classificação; mudança exige motivo', async () => {
    const repo = createDemoRepository(NOW);
    const d = (await repo.listAll(DEMO_ADMIN))[0]!;
    const r = await repo.addReview(DEMO_ADMIN, { dubberId: d.id, comments: 'Segue bem.' });
    expect(r.newClassification).toBe(d.classification);
    await expect(repo.addReview(DEMO_ADMIN, { dubberId: d.id, newClassification: 'elite' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('permissões administrativas', () => {
  const stranger = { id: 'x', name: 'Sem papel', role: undefined } as unknown as Actor;

  it('avaliador registra avaliação e nota, mas não altera classificação, edita, desativa nem exporta', async () => {
    const repo = createDemoRepository(NOW);
    const d = (await repo.listAll(DEMO_REVIEWER))[0]!;
    await expect(repo.addReview(DEMO_REVIEWER, { dubberId: d.id, comments: 'ok' })).resolves.toBeTruthy();
    await expect(repo.addNote(DEMO_REVIEWER, d.id, 'nota')).resolves.toBeTruthy();
    await expect(repo.changeClassification(DEMO_REVIEWER, d.id, 'elite', 'tentando')).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.addReview(DEMO_REVIEWER, { dubberId: d.id, newClassification: 'elite', reason: 'x y z' })).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.updateDubber(DEMO_REVIEWER, d.id, { displayName: 'X' })).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.setActive(DEMO_REVIEWER, d.id, false)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.listAudit(DEMO_REVIEWER)).rejects.toBeInstanceOf(PermissionError);
    expect((await repo.getDetails(DEMO_REVIEWER, d.id)).audit).toEqual([]);
  });

  it('quem não tem papel não lê nada', async () => {
    const repo = createDemoRepository(NOW);
    await expect(repo.listAll(stranger)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.query(stranger, { filters: {}, sort: DEFAULT_SORT, page: 1, pageSize: 10 })).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.getDetails(stranger, 'demo-001')).rejects.toBeInstanceOf(PermissionError);
  });

  it('admin edita ficha com validação e registra auditoria sem tocar na classificação', async () => {
    const repo = createDemoRepository(NOW);
    const d = (await repo.listAll(DEMO_ADMIN)).find((x) => x.classification === 'avancado')!;
    const updated = await repo.updateDubber(DEMO_ADMIN, d.id, { displayName: 'Nome Corrigido', specialties: ['Dublagem Épica'] });
    expect(updated).toMatchObject({ displayName: 'Nome Corrigido', specialties: ['dublagem épica'], classification: 'avancado' });
    await expect(repo.updateDubber(DEMO_ADMIN, d.id, { displayName: '' })).rejects.toBeInstanceOf(ValidationError);
    const audit = await repo.listAudit(DEMO_ADMIN);
    expect(audit.find((a) => a.action === 'dubber.updated')?.details).toMatchObject({ changed: expect.arrayContaining(['displayName']) });
  });

  it('ativar/desativar fica no histórico de auditoria', async () => {
    const repo = createDemoRepository(NOW);
    const d = (await repo.listAll(DEMO_ADMIN))[0]!;
    const r = await repo.setActive(DEMO_ADMIN, d.id, !d.isActive);
    expect(r.isActive).toBe(!d.isActive);
    expect((await repo.listAudit(DEMO_ADMIN))[0]?.action).toBe('dubber.active_changed');
  });
});

describe('isolamento do modo DEMO', () => {
  it('cada repositório demo é independente e não altera o seed', async () => {
    const a = createDemoRepository(NOW);
    const b = createDemoRepository(NOW);
    const d = (await a.listAll(DEMO_ADMIN)).find((x) => x.classification === 'novato')!;
    await a.changeClassification(DEMO_ADMIN, d.id, 'elite', 'só no A');
    expect((await b.getDetails(DEMO_ADMIN, d.id)).dubber.classification).toBe('novato');
    const c = createDemoRepository(NOW);
    expect((await c.getDetails(DEMO_ADMIN, d.id)).dubber.classification).toBe('novato');
  });

  it('o objeto devolvido é cópia: mutá-lo não altera o repositório', async () => {
    const repo = createDemoRepository(NOW);
    const [d] = await repo.listAll(DEMO_ADMIN);
    d!.displayName = 'MUTADO';
    expect((await repo.listAll(DEMO_ADMIN))[0]!.displayName).not.toBe('MUTADO');
  });

  it('dados demo: 20+ perfis fictícios, com variedade e IDs fictícios', () => {
    const seed = createDemoRepository(NOW);
    return seed.listAll(DEMO_ADMIN).then((all) => {
      expect(all.length).toBeGreaterThanOrEqual(20);
      expect(new Set(all.map((d) => d.discordId)).size).toBe(all.length);
      const distinct = (f: (d: (typeof all)[number]) => string | string[]) => new Set(all.flatMap((d) => [f(d)].flat())).size;
      expect(distinct((d) => d.classification)).toBe(5);
      expect(distinct((d) => d.selfLevel)).toBe(4);
      expect(distinct((d) => d.voiceTone)).toBe(4);
      expect(distinct((d) => d.voiceTypes)).toBeGreaterThanOrEqual(5);
      expect(distinct((d) => d.intensity)).toBe(3);
      expect(distinct((d) => d.speechSpeed)).toBe(3);
      expect(distinct((d) => d.specialties)).toBeGreaterThanOrEqual(6);
      expect(distinct((d) => d.availability)).toBeGreaterThanOrEqual(4);
      expect(distinct((d) => d.interests)).toBeGreaterThanOrEqual(5);
      expect(all.every((d) => d.discordId.startsWith('99000000'))).toBe(true);
    });
  });
});
