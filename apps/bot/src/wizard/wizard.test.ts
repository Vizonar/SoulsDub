import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, MemoryRepository, type Dubber } from '@soul/shared';
import { parseCustomId } from './ids.js';
import {
  advance, applyPatch, applySelect, createSession, goBack, mergeTags, parseAvailabilityModal, parsePersonalModal,
  parseVocalModal, SessionStore, submitSession, validateStep, type Draft,
} from './wizard.js';

const U = '123456789012345678';
const RULES = { allowUpdates: true, updateCooldownHours: 0 };
const T0 = 1_000_000;
const complete: Draft = {
  displayName: 'Nick', selfLevel: 'iniciante', voiceTone: 'grave', voiceTypes: ['masculina'], intensity: 'alta', speechSpeed: 'rapida',
};

describe('validação por etapa', () => {
  it('etapa 1 exige nome e nível; idade só se a política exigir', () => {
    expect(validateStep({}, 'personal', DEFAULT_POLICY).errors).toEqual(expect.arrayContaining(['Informe seu nome ou nick.', 'Escolha o seu nível.']));
    expect(validateStep({ displayName: 'A', selfLevel: 'avancado' }, 'personal', DEFAULT_POLICY).ok).toBe(true);
    expect(validateStep({ displayName: 'A', selfLevel: 'avancado' }, 'personal', { requireAge: true }).ok).toBe(false);
  });
  it('etapa 2 exige tom, tipo(s), intensidade e velocidade', () => {
    const r = validateStep({}, 'vocal', DEFAULT_POLICY);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining(['Escolha o tom de voz.', 'Escolha ao menos um tipo de voz.', 'Escolha a intensidade.', 'Escolha a velocidade de fala.']));
  });
  it('etapa 3 é toda opcional', () => expect(validateStep({}, 'availability', DEFAULT_POLICY).ok).toBe(true));
});

describe('navegação e persistência das respostas', () => {
  it('não avança com dados inválidos e mostra os erros', () => {
    const s = advance(createSession(U, T0), DEFAULT_POLICY, T0);
    expect(s.step).toBe('personal');
    expect(s.errors.length).toBeGreaterThan(0);
  });

  it('avança e volta sem perder nenhuma resposta', () => {
    let s = createSession(U, T0);
    s = applyPatch(s, { displayName: 'Nick', selfLevel: 'profissional', experience: 'Muita' }, T0);
    s = advance(s, DEFAULT_POLICY, T0);
    expect(s.step).toBe('vocal');
    s = applySelect(s, 'voiceTone', ['agudo'], ['agudo'], T0);
    s = applySelect(s, 'voiceTypes', ['feminina', 'adolescente'], ['feminina', 'adolescente'], T0);
    s = goBack(s, T0);
    expect(s.step).toBe('personal');
    expect(s.data).toMatchObject({ displayName: 'Nick', experience: 'Muita', voiceTone: 'agudo', voiceTypes: ['feminina', 'adolescente'] });
    s = advance(s, DEFAULT_POLICY, T0);
    expect(s.data.voiceTone).toBe('agudo');
  });

  it('chega à revisão passando pelas 3 etapas e bloqueia Voltar na primeira', () => {
    let s = createSession(U, T0);
    s = applyPatch(s, complete, T0);
    for (let n = 0; n < 3; n++) s = advance(s, DEFAULT_POLICY, T0);
    expect(s.step).toBe('review');
    expect(goBack(goBack(goBack(goBack(s, T0), T0), T0), T0).step).toBe('personal');
  });

  it('campo opcional apagado no modal limpa o valor antigo', () => {
    let s = applyPatch(createSession(U, T0), { displayName: 'A', pronouns: 'ela/dela' }, T0);
    s = applyPatch(s, parsePersonalModal({ displayName: 'A', age: '', pronouns: '', experience: '' }).patch, T0);
    expect(s.data.pronouns).toBeUndefined();
  });

  it('ignora valores forjados em menus (fora da lista fechada)', () => {
    const s = applySelect(createSession(U, T0), 'voiceTypes', ['feminina', 'ELITE', '<script>'], ['feminina', 'masculina'], T0);
    expect(s.data.voiceTypes).toEqual(['feminina']);
  });
});

describe('entradas dos modais', () => {
  it('idade: vazia ok, texto inválido gera erro, número vira inteiro', () => {
    expect(parsePersonalModal({ displayName: ' Ana ', age: '', pronouns: '', experience: '' }).patch).toMatchObject({ displayName: 'Ana', age: undefined });
    expect(parsePersonalModal({ displayName: 'Ana', age: 'vinte', pronouns: '', experience: '' }).errors).toEqual(['A idade deve ser um número inteiro.']);
    expect(parsePersonalModal({ displayName: 'Ana', age: '19', pronouns: 'ela/dela', experience: 'x' }).patch.age).toBe(19);
  });
  it('especialidades livres viram tags; novas categorias são aceitas', () => {
    expect(parseVocalModal({ diction: '', specialties: 'Vilões, dublagem de dragões\nComédia' }).patch.specialties).toEqual(['vilões', 'dublagem de dragões', 'comédia']);
  });
  it('disponibilidade: itens do menu e itens digitados coexistem', () => {
    expect(mergeTags(['noite', 'plantão'], ['manha', 'tarde', 'noite'], { presets: ['manha'] })).toEqual(['manha', 'plantão']);
    expect(mergeTags(['noite', 'plantão'], ['manha', 'tarde', 'noite'], { customs: ['madrugada'] })).toEqual(['noite', 'madrugada']);
    const p = parseAvailabilityModal({ wantedCharacters: 'Vilões', extraAvailability: 'madrugada', extraInterests: 'rpg de mesa' }, { availability: ['noite'] });
    expect(p.patch).toMatchObject({ availability: ['noite', 'madrugada'], interests: ['rpg de mesa'], wantedCharacters: 'Vilões' });
  });
});

describe('envio, duplicidade e atualização', () => {
  const full = (): Draft => ({ ...complete, specialties: ['vilões'] });

  it('grava, associa ao ID do Discord e devolve created; reenvio vira atualização (sem duplicar)', async () => {
    const repo = new MemoryRepository();
    const s = applyPatch(createSession(U, T0), full(), T0);
    const a = await submitSession(repo, s, RULES, DEFAULT_POLICY);
    expect(a.status).toBe('created');
    const b = await submitSession(repo, applyPatch(s, { displayName: 'Novo Nick' }, T0), RULES, DEFAULT_POLICY);
    expect(b.status).toBe('updated');
    const all = await repo.listAll({ id: 'a', name: 'A', role: 'admin' });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ discordId: U, displayName: 'Novo Nick', classification: 'novato' });
  });

  it('não envia ficha incompleta', async () => {
    const r = await submitSession(new MemoryRepository(), applyPatch(createSession(U, T0), { displayName: 'x' }, T0), RULES, DEFAULT_POLICY);
    expect(r.status).toBe('invalid');
  });

  it('atualização reabre a ficha existente pré-preenchida e respeita regras configuradas', async () => {
    const repo = new MemoryRepository();
    await submitSession(repo, applyPatch(createSession(U, T0), full(), T0), RULES, DEFAULT_POLICY);
    const existing = (await repo.findByDiscordId(U)) as Dubber;
    const s = createSession(U, T0, existing);
    expect(s.mode).toBe('update');
    expect(s.data).toMatchObject({ displayName: 'Nick', voiceTone: 'grave' });
    const blocked = await submitSession(repo, s, { allowUpdates: false, updateCooldownHours: 0 }, DEFAULT_POLICY);
    expect(blocked).toEqual({ status: 'blocked', reason: 'updates_disabled' });
  });
});

describe('sessões temporárias', () => {
  it('expiram após inatividade e têm um rascunho por usuário', () => {
    const store = new SessionStore(1000);
    store.set(createSession(U, 0));
    expect(store.get(U, 500)).toBeDefined();
    expect(store.get(U, 2000)).toBeUndefined();
    store.set(createSession('a', 0)); store.set(createSession('b', 0));
    store.sweep(5000);
    expect(store.size).toBe(0);
  });
});

describe('IDs de componentes', () => {
  it('reconhece IDs válidos e descarta desconhecidos/forjados', () => {
    expect(parseCustomId('sd:start')).toEqual({ kind: 'start' });
    expect(parseCustomId('sd:nav:submit')).toEqual({ kind: 'nav', action: 'submit' });
    expect(parseCustomId('sd:sel:voiceTone')).toEqual({ kind: 'select', field: 'voiceTone' });
    expect(parseCustomId('sd:sel:classification').kind).toBe('unknown'); // classificação nunca é um campo do formulário
    expect(parseCustomId('outro:start').kind).toBe('unknown');
  });
});
