import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Actor, DubberRepository } from '@soul/shared';

export interface AppState {
  mode: 'demo' | 'production';
  repo: DubberRepository;
  supabase?: any;
  actor: Actor;
  /** Incrementa a cada alteração, para as telas recarregarem. */
  version: number;
  refresh: () => void;
  signOut?: () => void;
  setDemoRole?: (role: Actor['role']) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider(props: Omit<AppState, 'version' | 'refresh'> & { children: ReactNode }) {
  const { children, ...rest } = props;
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo<AppState>(() => ({ ...rest, version, refresh }), [rest.mode, rest.repo, rest.actor, rest.signOut, rest.setDemoRole, version, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppProvider');
  return v;
}
