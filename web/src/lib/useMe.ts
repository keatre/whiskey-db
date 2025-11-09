'use client';

import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { me as apiMe, type MeResponse } from './auth';

export type Me = {
  username: string | null;
  email: string | null;
  role: 'guest' | 'admin' | string;
  authenticated: boolean;
  lan_guest: boolean;
  lan_guest_reason: string | null;
};

export const GUEST: Me = {
  username: null,
  email: null,
  role: 'guest',
  authenticated: false,
  lan_guest: false,
  lan_guest_reason: null,
};

// Single global SWR key for the current user
export const ME_KEY = '/auth/me';

function normalize(resp: MeResponse | null | undefined): Me {
  if (!resp) return GUEST;
  return {
    username: resp.username ?? null,
    email: resp.email ?? null,
    role: (resp.role ?? 'guest') as Me['role'],
    authenticated: !!resp.authenticated,
    lan_guest: !!resp.lan_guest,
    lan_guest_reason: resp.lan_guest_reason ?? null,
  };
}

async function fetcherMe(): Promise<Me> {
  try {
    const u = await apiMe(); // your existing helper hits /auth/me with credentials
    return normalize(u);
  } catch {
    return GUEST;
  }
}

/**
 * Shared auth hook powered by SWR.
 * - Components all read from the same cache (ME_KEY)
 * - Call `refresh()` or `mutate(ME_KEY)` after login/logout for instant updates
 */
export function useMe() {
  const { data, isLoading, error } = useSWR<Me>(ME_KEY, fetcherMe, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    // leave shouldRetryOnError to SWR default false-ish behavior for 4xx
  });

  const me = data ?? GUEST;
  const isAdmin = me.role === 'admin';

  // Manual refresh helpers
  const refresh = () => mutate(ME_KEY);
  // Backward-compat: allow optimistic set then revalidate (matches your old API)
  const setMe = (next: Me) => mutate(ME_KEY, next, { revalidate: false });

  // React to global auth signals (instant updates)
  useEffect(() => {
    const onAuthChanged = () => refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'auth:changed') refresh();
    };
    const onFocus = () => refresh();

    window.addEventListener('auth:changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { me, setMe, loading: isLoading, isAdmin, error, refresh };
}
