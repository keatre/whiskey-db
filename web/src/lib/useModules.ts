'use client';

import useSWR from 'swr';
import { fetchModules, type ModulesResponse } from '../api/modules';

export const MODULES_KEY = '/modules';

export function useModules() {
  const { data, isLoading, error, mutate } = useSWR<ModulesResponse>(MODULES_KEY, fetchModules, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  return {
    modules: data?.modules ?? {},
    loading: isLoading,
    error,
    refresh: () => mutate(),
  };
}
