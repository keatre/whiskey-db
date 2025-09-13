// web/src/api/auth.ts
export type MeResponse = {
  username: string | null;
  email: string | null;
  role: string;
  authenticated: boolean;
  lan_guest: boolean;
};

const BROWSER_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) || "/api";

export async function me(): Promise<MeResponse> {
  const res = await fetch(`${BROWSER_BASE}/auth/me`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    // treat as guest when remote/not authed
    return {
      username: null,
      email: null,
      role: "guest",
      authenticated: false,
      lan_guest: true,
    };
  }
  return res.json() as Promise<MeResponse>;
}

export async function login(
  username: string,
  password: string
): Promise<MeResponse> {
  const res = await fetch(`${BROWSER_BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ username, password }),
    redirect: "follow",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Login failed (${res.status})`);
  }
  return res.json() as Promise<MeResponse>;
}

export async function logout(): Promise<void> {
  await fetch(`${BROWSER_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
}

export const AuthApi = { me, login, logout };
