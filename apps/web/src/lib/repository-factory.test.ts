import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_ADMIN } from '@soul/shared';
import { isPrivilegedKey, parseEnv } from './env.js';
import { createBackend } from './repository-factory.js';

const fakeJwt = (role: string) => `x.${btoa(JSON.stringify({ role }))}.y`;
const spy = () => vi.fn(() => ({}) as unknown as SupabaseClient);

describe('modo DEMO', () => {
  it('é o padrão, não cria cliente Supabase e entrega ≥20 fichas fictícias', async () => {
    const createSupabase = spy();
    const b = createBackend(parseEnv({}), { createSupabase });
    expect(b.kind).toBe('demo');
    expect(createSupabase).not.toHaveBeenCalled();
    if (b.kind === 'demo') expect((await b.repo.listAll(DEMO_ADMIN)).length).toBeGreaterThanOrEqual(20);
  });

  it('ignora credenciais Supabase mesmo se estiverem no .env (nunca mistura demo com produção)', () => {
    const createSupabase = spy();
    const b = createBackend(parseEnv({ VITE_APP_MODE: 'demo', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: fakeJwt('anon') }), { createSupabase });
    expect(b.kind).toBe('demo');
    expect(createSupabase).not.toHaveBeenCalled();
  });

  it('alterações feitas numa sessão demo não vazam para outra', async () => {
    const a = createBackend(parseEnv({}));
    const b = createBackend(parseEnv({}));
    if (a.kind !== 'demo' || b.kind !== 'demo') throw new Error('esperado demo');
    const target = (await a.repo.listAll(DEMO_ADMIN)).find((d) => d.classification === 'novato')!;
    await a.repo.changeClassification(DEMO_ADMIN, target.id, 'elite', 'apenas teste');
    expect((await b.repo.getDetails(DEMO_ADMIN, target.id)).dubber.classification).toBe('novato');
  });
});

describe('modo produção', () => {
  it('sem credenciais não cai para o demo: reporta o problema', () => {
    const b = createBackend(parseEnv({ VITE_APP_MODE: 'production' }), { createSupabase: spy() });
    expect(b.kind).toBe('misconfigured');
    if (b.kind === 'misconfigured') expect(b.problems.join(' ')).toMatch(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/);
  });

  it('cria o cliente com a chave anon', () => {
    const createSupabase = spy();
    const b = createBackend(parseEnv({ VITE_APP_MODE: 'production', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: fakeJwt('anon') }), { createSupabase });
    expect(b.kind).toBe('production');
    expect(createSupabase).toHaveBeenCalledWith('https://x.supabase.co', fakeJwt('anon'));
  });

  it('recusa chave privilegiada (service role / sb_secret) no navegador', () => {
    expect(isPrivilegedKey(fakeJwt('service_role'))).toBe(true);
    expect(isPrivilegedKey('sb_secret_abc')).toBe(true);
    expect(isPrivilegedKey(fakeJwt('anon'))).toBe(false);
    expect(isPrivilegedKey('sb_publishable_abc')).toBe(false);
    const createSupabase = spy();
    const b = createBackend(parseEnv({ VITE_APP_MODE: 'production', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: fakeJwt('service_role') }), { createSupabase });
    expect(b.kind).toBe('misconfigured');
    expect(createSupabase).not.toHaveBeenCalled();
  });

  it('modo inválido é erro, não demo silencioso', () => {
    expect(createBackend(parseEnv({ VITE_APP_MODE: 'prod' }), { createSupabase: spy() }).kind).toBe('misconfigured');
  });
});
