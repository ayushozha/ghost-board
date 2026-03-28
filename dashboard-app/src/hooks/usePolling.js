import { useState, useEffect } from 'react';

export function usePolling(fetchFn, interval = 3000, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await fetchFn();
        if (!cancelled) { setData(result); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e); setLoading(false); }
      }
    };
    poll();
    const timer = setInterval(poll, interval);
    return () => { cancelled = true; clearInterval(timer); };
  }, deps);

  return { data, loading, error };
}
