import { useState, useEffect, useCallback, useRef } from 'react';
import { listNamespaces } from '../api/k8sApi';

export function useNamespaces() {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    listNamespaces()
      .then((ns) => {
        if (controller.signal.aborted) return;
        setNamespaces(ns);
        setLoading(false);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  return { namespaces, loading, error, refresh };
}
