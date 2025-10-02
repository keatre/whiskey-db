// web/src/api/adminUsers.ts
// Client helpers for the admin user management endpoints.

export type AdminUser = {
  id: number;
  username: string;
  email: string | null;
  role: 'admin' | 'user' | string;
  is_active: boolean;
  created_at: string | null;
};

const BROWSER_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || '/api';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const message = (await res.text().catch(() => '')) || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${BROWSER_BASE}/admin/users`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return handle<AdminUser[]>(res);
}

export async function createUser(input: {
  username: string;
  email?: string;
  password: string;
  role: 'admin' | 'user';
  is_active?: boolean;
}): Promise<AdminUser> {
  const res = await fetch(`${BROWSER_BASE}/admin/users`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handle<AdminUser>(res);
}

export async function updateUser(
  id: number,
  patch: Partial<{
    email: string | null;
    role: 'admin' | 'user';
    is_active: boolean;
  }>
): Promise<AdminUser> {
  const res = await fetch(`${BROWSER_BASE}/admin/users/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handle<AdminUser>(res);
}

export async function resetPassword(id: number, password: string): Promise<void> {
  const res = await fetch(`${BROWSER_BASE}/admin/users/${id}/password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  await handle<Record<string, unknown>>(res);
}

export const AdminUsersApi = {
  fetchUsers,
  createUser,
  updateUser,
  resetPassword,
};
