const API_BASE = process.env.API_BASE || "http://localhost:8000";

async function me() {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  if (!res.ok) {
    // Not authenticated (remote) or error → treat as guest
    return { username: null, email: null, role: "guest", authenticated: false, lan_guest: true };
  }
  return res.json();
}

async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Login failed");
  }
  return res.json();
}

async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
}

export const AuthApi = { me, login, logout };
