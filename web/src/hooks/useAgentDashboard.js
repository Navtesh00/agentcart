import { useState, useEffect, useCallback } from 'react';

export function useAgentDashboard(token) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/agent/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Dashboard fetch failed: ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  return { data, loading, error, refetch: fetchDashboard };
}
