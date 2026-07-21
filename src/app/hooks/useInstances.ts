import { useState, useEffect, useCallback, useRef } from 'react';
import { HermesInstance } from '../types';

const POLL_INTERVAL = 10000;

export function useInstances() {
  const [instances, setInstances] = useState<HermesInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setError(null);
    fetch('/hermes-agent-deployer/api/instances', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((data: { instances: HermesInstance[]; errors: unknown[] }) => {
        setInstances(data.instances);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, [refresh]);

  return { instances, loading, error, refresh };
}
