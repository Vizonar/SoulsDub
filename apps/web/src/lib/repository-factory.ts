import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoRepository, SupabaseRepository, type DubberRepository } from '@soul/shared';
import type { AppEnv } from './env.js';

export type AppBackend =
  | { kind: 'demo'; repo: DubberRepository }
  | { kind: 'production'; repo: DubberRepository; supabase: SupabaseClient }
  | { kind: 'misconfigured'; problems: string[] };

export interface FactoryDeps {
  createSupabase: (url: string, key: string) => SupabaseClient;
}

const defaultDeps: FactoryDeps = {
  createSupabase: (url, key) => createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }),
};

/**
 * Escolhe o backend. O modo DEMO NUNCA cria cliente Supabase nem usa rede:
 * os dados são fictícios, vivem em memória e somem ao recarregar. Modo de produção mal configurado
 * não "cai" para o demo em silêncio — mostra o erro.
 */
export function createBackend(env: AppEnv, deps: FactoryDeps = defaultDeps): AppBackend {
  if (env.problems.length > 0) return { kind: 'misconfigured', problems: env.problems };
  if (env.mode === 'demo') return { kind: 'demo', repo: createDemoRepository() };
  const supabase = deps.createSupabase(env.supabaseUrl as string, env.supabaseAnonKey as string);
  return { kind: 'production', repo: new SupabaseRepository(supabase), supabase };
}
