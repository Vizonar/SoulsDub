export type AppMode = 'demo' | 'production';

export interface AppEnv {
  mode: AppMode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** Problemas de configuração que impedem o modo de produção. */
  problems: string[];
}

/** Decodifica o papel de uma chave JWT do Supabase (sem validar assinatura) para barrar chaves privilegiadas. */
function jwtRole(key: string): string | undefined {
  const part = key.split('.')[1];
  if (!part) return undefined;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

export function isPrivilegedKey(key: string): boolean {
  return key.startsWith('sb_secret_') || jwtRole(key) === 'service_role';
}

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const mode = (raw.VITE_APP_MODE?.trim() || 'demo').toLowerCase();
  const url = raw.VITE_SUPABASE_URL?.trim() || undefined;
  const key = raw.VITE_SUPABASE_ANON_KEY?.trim() || undefined;
  const problems: string[] = [];
  if (mode !== 'demo' && mode !== 'production') problems.push(`VITE_APP_MODE inválido: "${mode}". Use "demo" ou "production".`);
  if (mode === 'production') {
    if (!url) problems.push('VITE_SUPABASE_URL não definido.');
    if (!key) problems.push('VITE_SUPABASE_ANON_KEY não definido.');
    if (key && isPrivilegedKey(key)) problems.push('A chave informada em VITE_SUPABASE_ANON_KEY é privilegiada (service role/secret). Use SOMENTE a chave anon/publishable no navegador.');
  }
  return { mode: mode === 'production' ? 'production' : 'demo', supabaseUrl: url, supabaseAnonKey: key, problems };
}
