import { useState, useCallback } from 'react';
import { CreateInstanceRequest, HermesInstance } from '../types';
import { createInstance as apiCreate, deleteInstance as apiDelete } from '../api/instanceApi';

export function useInstanceMutation() {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createInstance = useCallback(async (req: CreateInstanceRequest): Promise<HermesInstance> => {
    setCreating(true);
    setError(null);
    try {
      const instance = await apiCreate(req);
      return instance;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create instance';
      setError(msg);
      throw e;
    } finally {
      setCreating(false);
    }
  }, []);

  const deleteInstance = useCallback(async (name: string, namespace: string): Promise<void> => {
    setDeleting(true);
    setError(null);
    try {
      await apiDelete(name, namespace);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete instance';
      setError(msg);
      throw e;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { createInstance, deleteInstance, creating, deleting, error };
}
