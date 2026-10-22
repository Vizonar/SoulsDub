import { useEffect, useMemo, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
}

/**
 * Carrega dados assíncronos sempre que `deps` mudar. Respostas de requisições antigas são descartadas
 * e os dados anteriores continuam visíveis enquanto a nova carga termina (sem "piscar").
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  // Um novo "token" identifica cada rodada de carregamento; o estado "loading" é derivado dele.
  // As dependências vêm do chamador (lista dinâmica de propósito).
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const token = useMemo(() => ({}), deps);
  const [res, setRes] = useState<{ token: object; data?: T; error?: string }>();

  useEffect(() => {
    let current = true;
    fn().then(
      (data) => current && setRes({ token, data }),
      (e: unknown) => current && setRes({ token, error: e instanceof Error ? e.message : 'Erro inesperado.' }),
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const settled = res?.token === token ? res : undefined;
  return { data: settled ? settled.data : res?.data, error: settled?.error, loading: !settled };
}
