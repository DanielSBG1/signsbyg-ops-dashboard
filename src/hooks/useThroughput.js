import { useState, useEffect } from 'react';

export function useThroughput() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/production-throughput')
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error ?? 'API error');
        setData(json.data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
