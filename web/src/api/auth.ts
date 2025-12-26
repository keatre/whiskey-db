// web/src/api/auth.ts
export type MeResponse = {
  username: string | null;
  email: string | null;
  role: string;
  authenticated: boolean;
  lan_guest: boolean;
  lan_guest_reason?: string | null;
};

export type PasskeyOptionsResponse = {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: string;
  allowCredentials?: Array<{
    id: string;
    type: string;
    transports?: string[];
  }>;
};

export type PasskeyRegisterOptionsResponse = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams?: Array<{ type: string; alg: number }>;
  timeout?: number;
  excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
  authenticatorSelection?: {
    userVerification?: string;
    residentKey?: string;
    authenticatorAttachment?: string;
  };
  attestation?: string;
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
      lan_guest: false,
      lan_guest_reason: null,
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
    let message = "Sign-in failed. Please try again.";
    try {
      const body = await res.text();
      if (body) {
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed?.detail === "string") {
            message = parsed.detail;
          } else if (typeof parsed?.message === "string") {
            message = parsed.message;
          } else {
            message = body;
          }
        } catch {
          message = body;
        }
      }
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      message = "Incorrect username or password.";
    }
    throw new Error(message || `Login failed (${res.status})`);
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

export async function passkeyOptions(username: string): Promise<PasskeyOptionsResponse> {
  const res = await fetch(`${BROWSER_BASE}/auth/passkey/options`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || `Passkey options failed (${res.status})`;
    throw new Error(text);
  }
  return res.json() as Promise<PasskeyOptionsResponse>;
}

export async function passkeyVerify(
  username: string,
  credential: Record<string, unknown>
): Promise<MeResponse> {
  const res = await fetch(`${BROWSER_BASE}/auth/passkey/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ username, credential }),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || `Passkey verify failed (${res.status})`;
    throw new Error(text);
  }
  return res.json() as Promise<MeResponse>;
}

export async function passkeyRegisterOptions(): Promise<PasskeyRegisterOptionsResponse> {
  const res = await fetch(`${BROWSER_BASE}/auth/passkey/register/options`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || `Passkey register options failed (${res.status})`;
    throw new Error(text);
  }
  return res.json() as Promise<PasskeyRegisterOptionsResponse>;
}

export async function passkeyRegisterVerify(credential: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BROWSER_BASE}/auth/passkey/register/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || `Passkey register failed (${res.status})`;
    throw new Error(text);
  }
}

export const AuthApi = { me, login, logout, passkeyOptions, passkeyVerify, passkeyRegisterOptions, passkeyRegisterVerify };
