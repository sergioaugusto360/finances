import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

type Params = Record<string, string | number | boolean | null | undefined>;

/** Busca dados da API e expõe { data, loading, error, reload }. Refaz a busca quando params mudam. */
export function useFetch<T>(path: string | null, params?: Params) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params ?? {});

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path, params));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
