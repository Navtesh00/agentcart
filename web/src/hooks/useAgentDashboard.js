import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';

export function useAgentDashboard(token) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const json = await apiFetch('/api/agent/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
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
