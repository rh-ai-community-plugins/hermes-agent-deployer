import { useState, useEffect } from 'react';
import { getInstanceDefaults, InstanceDefaults } from '../api/config';

export function useInstanceDefaults() {
  const [defaults, setDefaults] = useState<InstanceDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInstanceDefaults()
      .then((d) => {
        setDefaults(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return { defaults, loading, error };
}
