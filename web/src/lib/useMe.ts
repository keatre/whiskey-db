'use client';

import { useEffect, useState } from 'react';
import { me as apiMe, type MeResponse } from './auth';

export type Me = {
  username: string | null;
  email: string | null;
  role: 'guest' | 'admin' | string;
  authenticated: boolean;
  lan_guest: boolean;
};

const GUEST: Me = {
  username: null,
  email: null,
  role: 'guest',
  authenticated: false,
  lan_guest: false,
};

function normalize(resp: MeResponse | null | undefined): Me {
  if (!resp) return GUEST;
  return {
    username: resp.username ?? null,
    email: resp.email ?? null,
    role: (resp.role ?? 'guest') as Me['role'],
    authenticated: !!resp.authenticated,
    lan_guest: !!resp.lan_guest,
  };
}

export function useMe() {
  const [me, setMe] = useState<Me>(GUEST);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = await apiMe();
        if (mounted) setMe(normalize(u));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { me, setMe, loading, isAdmin: me.role === 'admin' };
}
