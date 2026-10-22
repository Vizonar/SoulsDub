import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY } from '@soul/shared';
import { IDS, type ModalName } from './ids.js';
import { renderModal, renderPanel, renderStartMessage } from './render.js';
import { STEP_ORDER, applyPatch, createSession, type Draft } from './wizard.js';

/** Limites reais da API do Discord. */
const LIMITS = { rows: 5, modalInputs: 5, selectOptions: 25, label: 45, title: 45, customId: 100, embedTotal: 6000, fieldValue: 1024, fields: 25 };
const long = 'x'.repeat(5000);
const worst: Draft = {
  displayName: 'n'.repeat(64), age: 99, pronouns: 'p'.repeat(40), selfLevel: 'profissional', experience: long.slice(0, 2000),
  voiceTone: 'grave', voiceTypes: ['masculina', 'feminina', 'neutra', 'infantil', 'adolescente', 'adulta'], intensity: 'alta',
  diction: long.slice(0, 500), speechSpeed: 'rapida', specialties: Array.from({ length: 20 }, (_, i) => `especialidade longa número ${i}`),
  availability: ['noite', 'manha', 'x'.repeat(40)], interests: ['jogos'], wantedCharacters: long.slice(0, 2000),
};

describe('painéis respeitam os limites da API do Discord', () => {
  for (const step of STEP_ORDER) {
    it(`etapa ${step}: ≤5 linhas, ≤25 opções por menu, IDs ≤100, embed ≤6000 e campos ≤1024`, () => {
      const s = { ...applyPatch(createSession('1', 0), worst, 0), step, errors: ['erro de exemplo'] };
      const panel = renderPanel(s, DEFAULT_POLICY);
      expect(panel.components.length).toBeLessThanOrEqual(LIMITS.rows);
      for (const row of panel.components) {
        const j = row.toJSON();
        expect(j.components.length).toBeLessThanOrEqual(5);
        for (const c of j.components) {
          expect('custom_id' in c ? (c.custom_id as string).length : 0).toBeLessThanOrEqual(LIMITS.customId);
          if (c.type === 3) expect(c.options.length).toBeLessThanOrEqual(LIMITS.selectOptions);
        }
      }
      const e = panel.embeds[0]!.toJSON();
      expect((e.fields ?? []).length).toBeLessThanOrEqual(LIMITS.fields);
      for (const f of e.fields ?? []) expect(f.value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
      const total = (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
      expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
    });
  }

  it('menus marcam como selecionado o que já foi respondido (não descartam respostas ao voltar)', () => {
    const s = { ...applyPatch(createSession('1', 0), { voiceTone: 'agudo', voiceTypes: ['neutra', 'infantil'] }, 0), step: 'vocal' as const };
    const rows = renderPanel(s, DEFAULT_POLICY).components.map((r) => r.toJSON());
    const tone = rows.flatMap((r) => r.components).find((c) => 'custom_id' in c && c.custom_id === IDS.select('voiceTone'));
    const types = rows.flatMap((r) => r.components).find((c) => 'custom_id' in c && c.custom_id === IDS.select('voiceTypes'));
    expect(tone && tone.type === 3 && tone.options.filter((o) => o.default).map((o) => o.value)).toEqual(['agudo']);
    expect(types && types.type === 3 && types.options.filter((o) => o.default).map((o) => o.value)).toEqual(['neutra', 'infantil']);
  });

  it('o formulário não oferece campo de classificação oficial em nenhuma etapa', () => {
    for (const step of STEP_ORDER) {
      const s = { ...createSession('1', 0), step };
      const ids = renderPanel(s, DEFAULT_POLICY).components.flatMap((r) => r.toJSON().components).map((c) => ('custom_id' in c ? c.custom_id : ''));
      expect(ids.join(' ').toLowerCase()).not.toContain('classif');
    }
  });
});

describe('modais respeitam os limites', () => {
  for (const name of ['personal', 'vocal', 'availability'] as ModalName[]) {
    it(`modal ${name}: ≤5 campos, rótulos ≤45, título ≤45, valores pré-preenchidos dentro do máximo`, () => {
      const j = renderModal(name, worst, DEFAULT_POLICY).toJSON();
      expect(j.components.length).toBeGreaterThanOrEqual(1);
      expect(j.components.length).toBeLessThanOrEqual(LIMITS.modalInputs);
      expect(j.title.length).toBeLessThanOrEqual(LIMITS.title);
      type Input = { label: string; value?: string; max_length?: number; custom_id: string };
      for (const row of j.components as unknown as { components: Input[] }[]) {
        for (const c of row.components) {
          expect(c.label.length).toBeLessThanOrEqual(LIMITS.label);
          if (c.value && c.max_length) expect(c.value.length).toBeLessThanOrEqual(c.max_length);
          expect(c.custom_id.length).toBeLessThanOrEqual(LIMITS.customId);
        }
      }
    });
  }

  it('todas as etapas do fluxo de cadastro cabem nos limites (3 modais, selects nas mensagens)', () => {
    expect(['personal', 'vocal', 'availability'].map((m) => renderModal(m as ModalName, {}, DEFAULT_POLICY).toJSON().components.length)).toEqual([4, 2, 3]);
  });
});

describe('mensagem pública', () => {
  it('traz só o botão de início e nenhum dado pessoal', () => {
    const m = renderStartMessage();
    expect(m.components).toHaveLength(1);
    expect(m.components[0]!.toJSON().components[0]).toMatchObject({ custom_id: IDS.start });
  });
});
