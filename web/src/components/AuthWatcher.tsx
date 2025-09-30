'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

type Me = {
  username: string | null;
  email: string | null;
  role: 'guest' | 'admin';
  authenticated: boolean;
  lan_guest: boolean;
};

export default function AuthWatcher() {
  const router = useRouter();
  const prevAuthedRef = useRef<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const softRefresh = () => {
    try {
      if (typeof (router as any)?.refresh === 'function') {
        (router as any).refresh();
      } else if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch {
      if (typeof window !== 'undefined') window.location.reload();
    }
  };

  /** Fetch /auth/me and return the new `authenticated` state */
  const fetchMe = async (): Promise<boolean> => {
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (r.ok) {
        const u: Me = await r.json();
        setMe(u);
        return !!u.authenticated;
      }
    } catch {
      // ignore, we'll treat as guest
    }
    const guest: Me = { username: null, email: null, role: 'guest', authenticated: false, lan_guest: true };
    setMe(guest);
    return false;
  };

  // Initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchMe();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for your custom event. After fetching, if the auth state actually changed, refresh immediately.
  useEffect(() => {
    const onAuthChanged = async () => {
      const was = prevAuthedRef.current;
      const now = await fetchMe();
      try { localStorage.setItem('auth:changed', String(Date.now())); } catch {}
      if (was !== null && was !== now) softRefresh();
      prevAuthedRef.current = now;
    };
    window.addEventListener('auth:changed', onAuthChanged);
    return () => window.removeEventListener('auth:changed', onAuthChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab / cross-page signal via localStorage
  useEffect(() => {
    const onStorage = async (e: StorageEvent) => {
      if (e.key === 'auth:changed') {
        const was = prevAuthedRef.current;
        const now = await fetchMe();
        if (was !== null && was !== now) softRefresh();
        prevAuthedRef.current = now;
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also re-check when the tab regains focus (helps after redirects/popups)
  useEffect(() => {
    const onFocus = async () => {
      const was = prevAuthedRef.current;
      const now = await fetchMe();
      if (was !== null && was !== now) softRefresh();
      prevAuthedRef.current = now;
    };
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Short polling while unauthenticated to catch just-completed logins
  useEffect(() => {
    let timer: number | null = null;
    (async () => {
      const now = me?.authenticated ?? false;
      prevAuthedRef.current = now;
      if (!now) {
        let tries = 0;
        const maxTries = 10; // ~30s (3s cadence)
        timer = window.setInterval(async () => {
          tries += 1;
          const next = await fetchMe();      // <-- use the returned, fresh value
          if (prevAuthedRef.current !== null && prevAuthedRef.current !== next) {
            softRefresh();                   // refresh immediately when we detect the flip
            if (timer) window.clearInterval(timer);
            timer = null;
          } else if (tries >= maxTries) {
            if (timer) window.clearInterval(timer);
            timer = null;
          }
          prevAuthedRef.current = next;
        }, 3000);
      }
    })();
    return () => { if (timer) window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.authenticated]);

  return null;
}
