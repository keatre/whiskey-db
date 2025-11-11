'use client';

import { useId, useMemo } from 'react';

type FieldInfo = {
  id: string;
  name: string;
};

/**
 * Returns a stable helper for generating matching `id`/`name` pairs so
 * labels can reference inputs without manually tracking unique IDs.
 */
export function useFormFieldIds(prefix?: string) {
  const reactId = useId();
  return useMemo(() => {
    const cache = new Map<string, FieldInfo>();
    return (name: string): FieldInfo => {
      if (!cache.has(name)) {
        const safe = name.replace(/\s+/g, '-').toLowerCase();
        cache.set(name, {
          id: `${prefix ?? 'field'}-${reactId}-${safe}`,
          name,
        });
      }
      return cache.get(name)!;
    };
  }, [prefix, reactId]);
}
