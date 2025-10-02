'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import { refresh as refreshSession, logout as apiLogout } from '../lib/auth';
import { GUEST, ME_KEY, useMe } from '../lib/useMe';
import { useSWRConfig } from 'swr';

const parseEnvNumber = (value: string | undefined, fallback: number): number => {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const IDLE_MINUTES = parseEnvNumber(
  process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES,
  parseEnvNumber(process.env.ACCESS_TOKEN_EXPIRE_MINUTES, 20),
);
const IDLE_TIMEOUT_MS = Math.max(IDLE_MINUTES, 1) * 60_000;

const REFRESH_BUFFER_MS = (() => {
  const rawSeconds = parseEnvNumber(process.env.NEXT_PUBLIC_SESSION_REFRESH_BUFFER_SECONDS, 60);
  const desired = rawSeconds * 1000;
  const cap = Math.max(IDLE_TIMEOUT_MS / 2, 30_000);
  return Math.max(15_000, Math.min(desired, cap));
})();

const REFRESH_INTERVAL_MS = Math.max(
  Math.min(IDLE_TIMEOUT_MS - REFRESH_BUFFER_MS, Math.floor(IDLE_TIMEOUT_MS / 2)),
  5_000,
);

const CHECK_INTERVAL_MS = Math.max(
  1_000,
  Math.min(
    parseEnvNumber(process.env.NEXT_PUBLIC_SESSION_CHECK_INTERVAL_SECONDS, 1) * 1000,
    1_000,
  ),
);

const WARNING_MS = Math.max(
  5_000,
  Math.min(
    parseEnvNumber(process.env.NEXT_PUBLIC_SESSION_WARNING_SECONDS, 60) * 1000,
    Math.max(5_000, Math.floor(IDLE_TIMEOUT_MS * 0.6)),
  ),
);

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
];

const ACCESS_COOKIE_NAME =
  process.env.NEXT_PUBLIC_JWT_COOKIE_NAME?.trim() || 'access_token';
const REFRESH_COOKIE_NAME =
  process.env.NEXT_PUBLIC_JWT_REFRESH_COOKIE_NAME?.trim() || 'refresh_token';
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
const COOKIE_SECURE = process.env.NEXT_PUBLIC_COOKIE_SECURE?.trim().toLowerCase();
const COOKIE_SAMESITE = process.env.NEXT_PUBLIC_COOKIE_SAMESITE?.trim();

const bannerStyle: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  maxWidth: 320,
  background: 'rgba(24, 24, 24, 0.9)',
  color: '#fff',
  padding: '16px 20px',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  zIndex: 10_000,
};

const buttonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: '#f97316',
  color: '#000',
  border: 'none',
  borderRadius: 999,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
};

const expireCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  let cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  if (COOKIE_DOMAIN) cookie += `; domain=${COOKIE_DOMAIN}`;
  if (COOKIE_SECURE && COOKIE_SECURE !== 'false' && COOKIE_SECURE !== '0') cookie += '; Secure';
  if (COOKIE_SAMESITE) cookie += `; SameSite=${COOKIE_SAMESITE}`;
  document.cookie = cookie;
};

export default function SessionKeepAlive() {
  const { me } = useMe();
  const { mutate } = useSWRConfig();
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const router = useRouter();

  const lastActivityRef = useRef<number>(Date.now());
  const lastRefreshRef = useRef<number>(Date.now());
  const intervalRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const runRefresh = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const exec = (async () => {
      lastRefreshRef.current = Date.now();
      try {
        const result = await refreshSession();
        if (result?.authenticated) {
          setWarningSeconds(null);
          await mutate(ME_KEY);
        } else {
          await mutate(ME_KEY, GUEST, { revalidate: false });
          await mutate(ME_KEY);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('auth:changed'));
            try {
              localStorage.setItem('auth:changed', String(Date.now()));
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        // Revalidate to pick up any auth change that may have happened server-side.
        await mutate(ME_KEY);
      } finally {
        lastRefreshRef.current = Date.now();
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = exec;
    return exec;
  }, [mutate]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!me.authenticated) {
      setWarningSeconds(null);
      setExpired(false);
      return undefined;
    }

    lastActivityRef.current = Date.now();
    lastRefreshRef.current = Date.now();

    const markActive = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      setWarningSeconds(null);
      setExpired(false);

      const sinceRefresh = now - lastRefreshRef.current;
      if (!document.hidden && sinceRefresh >= REFRESH_INTERVAL_MS) {
        void runRefresh();
      }
    };

    const onVisibility = () => {
      if (!document.hidden) {
        markActive();
      }
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, markActive, { passive: true }),
    );
    document.addEventListener('visibilitychange', onVisibility);

    const tick = () => {
      const now = Date.now();
      const idleFor = now - lastActivityRef.current;
      const remaining = IDLE_TIMEOUT_MS - idleFor;

      if (remaining <= 0 && !expired) {
        setWarningSeconds(0);
        handleSessionExpired();
        return;
      }

      if (remaining <= WARNING_MS) {
        const seconds = Math.max(0, Math.ceil(remaining / 1000));
        setWarningSeconds((prev) => (prev === seconds ? prev : seconds));
      } else {
        setWarningSeconds((prev) => (prev === null ? prev : null));
      }

      const shouldRefresh =
        !document.hidden &&
        idleFor <= Math.max(IDLE_TIMEOUT_MS - REFRESH_BUFFER_MS, IDLE_TIMEOUT_MS * 0.25) &&
        now - lastRefreshRef.current >= REFRESH_INTERVAL_MS;

      if (shouldRefresh) {
        void runRefresh();
      }
    };

    tick();
    intervalRef.current = window.setInterval(tick, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, markActive),
      );
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [me.authenticated, runRefresh]);

  useEffect(() => {
    if (!me.authenticated) {
      setWarningSeconds(null);
      setExpired(false);
    }
  }, [me.authenticated]);

  const handleSessionExpired = useCallback(() => {
    if (expired) return;

    setExpired(true);
    setWarningSeconds(0);
    lastActivityRef.current = Date.now();
    lastRefreshRef.current = Date.now();

    expireCookie(ACCESS_COOKIE_NAME);
    expireCookie(REFRESH_COOKIE_NAME);
    void apiLogout();

    void mutate(ME_KEY, GUEST, { revalidate: false });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:changed'));
      try {
        localStorage.setItem('auth:changed', String(Date.now()));
      } catch {
        /* ignore */
      }
    }

    // Navigate back to landing page so user can sign in again easily.
    try {
      router.replace('/');
    } catch {
      /* ignore navigation failures */
    }

    setTimeout(() => {
      try {
        window.location.replace('/');
      } catch {
        /* ignore */
      }
    }, 500);
  }, [expired, mutate, router]);

  const handleStaySignedIn = useCallback(() => {
    if (typeof window === 'undefined') return;
    lastActivityRef.current = Date.now();
    setWarningSeconds(null);
    setExpired(false);
    void runRefresh();
  }, [runRefresh]);

  useEffect(() => {
    if (expired) return;
    if (warningSeconds === 0) {
      handleSessionExpired();
    }
  }, [expired, handleSessionExpired, warningSeconds]);

  if (warningSeconds === null) return null;

  const message =
    warningSeconds > 0
      ? `You will be logged out in ${warningSeconds} second${
          warningSeconds === 1 ? '' : 's'
        } due to inactivity.`
      : 'Your admin session has expired due to inactivity. Redirecting…';

  return (
    <div style={bannerStyle} role="status" aria-live="assertive">
      <span>{message}</span>
      {warningSeconds > 0 && (
        <button type="button" style={buttonStyle} onClick={handleStaySignedIn}>
          Stay signed in
        </button>
      )}
    </div>
  );
}
