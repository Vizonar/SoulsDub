import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, tokenStore, type SessionUser } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  // Sem token salvo não há o que validar: já começamos "carregados".
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    let alive = true;
    api
      .me()
      .then((r) => {
        if (alive) setUser(r.user);
      })
      .catch((e: unknown) => {
        // Sem sessão válida, nunca mantenha a aplicação presa no estado de carregamento.
        tokenStore.clear();
        if (!(e instanceof ApiError && e.status === 401)) {
          console.error('Não foi possível validar a sessão:', e);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.login(username, password);
    tokenStore.set(r.token);
    setUser({ id: r.user.id, name: r.user.name, role: r.user.role });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* mesmo se a API falhar, a sessão local é encerrada */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}