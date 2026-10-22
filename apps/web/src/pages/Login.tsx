import { useEffect, useState, type FormEvent } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Actor } from '@soul/shared';
import { Btn, ErrorBox, Field, Loading, Logo, inputCls } from '../components/ui.js';
import { useAsync } from '../lib/useAsync.js';

export function useSession(supabase: SupabaseClient) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);
  return session;
}

/** Descobre o papel (admin/avaliador) em admin_users. Quem não está lá não tem acesso. */
export function useStaffActor(supabase: SupabaseClient, session: Session | null | undefined) {
  return useAsync<Actor | null>(async () => {
    if (!session) return null;
    const { data, error } = await supabase.from('admin_users').select('display_name, role').eq('user_id', session.user.id).maybeSingle();
    if (error) throw new Error('Não foi possível verificar suas permissões.');
    return data ? { id: session.user.id, name: data.display_name as string, role: data.role as Actor['role'] } : null;
  }, [session?.user.id]);
}

export function LoginScreen({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError('E-mail ou senha incorretos.');
    setBusy(false);
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center gap-3"><Logo className="h-9 w-9" /><h1 className="text-lg font-semibold tracking-tight">Painel Soul Dublers</h1></div>
        <Field label="E-mail"><input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Senha"><input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <ErrorBox message={error} />}
        <Btn type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Btn>
      </form>
    </div>
  );
}

export function NoAccess({ onSignOut, error }: { onSignOut: () => void; error?: string }) {
  return (
    <div className="grid min-h-full place-items-center p-4">
      <div className="max-w-md space-y-3 rounded-2xl border border-line bg-white p-6">
        <h1 className="text-lg font-semibold">Sem acesso ao painel</h1>
        <p className="text-sm text-ink-soft">{error ?? 'Sua conta não está cadastrada como administradora ou avaliadora. Peça a um administrador para liberar o acesso.'}</p>
        <Btn onClick={onSignOut}>Sair</Btn>
      </div>
    </div>
  );
}

export const AuthLoading = Loading;
