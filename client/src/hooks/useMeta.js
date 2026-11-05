import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Fixed lists from GET /api/meta (divisions, roles, units ...).
// They never change while the app runs, so we fetch them once and share the promise.
let metaPromise = null;

export function useMeta() {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    if (!metaPromise) metaPromise = api.get('/meta');
    metaPromise.then(setMeta).catch(() => {
      metaPromise = null; // allow a retry next time a component asks
    });
  }, []);

  return meta;
}
