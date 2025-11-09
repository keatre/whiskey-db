// web/src/lib/auth.ts

// Use the Next public env; default to '/api' so the Next rewrite proxies to FastAPI.
const API = process.env.NEXT_PUBLIC_API_BASE || '/api';

export type MeResponse = {
  username?: string | null;
  email?: string | null;
  role: 'guest' | 'admin' | string;
  authenticated: boolean;
  lan_guest: boolean;
  lan_guest_reason?: string | null;
};

async function parseJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<MeResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',      // <- required so cookies are set
    cache: 'no-store',
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const text = (await res.text().catch(() => '')) || `Login failed (${res.status})`;
    throw new Error(text);
  }

  // API returns MeResponse on success
  const data = (await parseJsonSafe(res)) as MeResponse | null;
  return (
    data ?? {
      username: null,
      email: null,
      role: 'admin',
      authenticated: true,
      lan_guest: false,
      lan_guest_reason: null,
    }
  );
}

export async function me(): Promise<MeResponse> {
  const res = await fetch(`${API}/auth/me`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    return { username: null, email: null, role: 'guest', authenticated: false, lan_guest: false, lan_guest_reason: null };
  }
  const data = (await parseJsonSafe(res)) as MeResponse | null;
  return (
    data ?? { username: null, email: null, role: 'guest', authenticated: false, lan_guest: false, lan_guest_reason: null }
  );
}

export async function refresh(): Promise<MeResponse> {
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    return { username: null, email: null, role: 'guest', authenticated: false, lan_guest: false, lan_guest_reason: null };
  }
  const data = (await parseJsonSafe(res)) as MeResponse | null;
  return (
    data ?? { username: null, email: null, role: 'guest', authenticated: false, lan_guest: false, lan_guest_reason: null }
  );
}

export async function logout(): Promise<void> {
  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });
}
