import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Loads data from the API when a page opens, and tracks loading/error state.
//   const { data, loading, error, reload } = useFetch('/events');
// Pass null as the path to skip loading (e.g. until an id is known).
export function useFetch(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get(path));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
