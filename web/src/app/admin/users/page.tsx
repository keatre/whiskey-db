'use client';

import type { FormEvent } from 'react';
import { useCallback, useState } from 'react';
import useSWR from 'swr';

import AdminOnly from '../../../components/AdminOnly';
import type { AdminUser } from '../../../api/adminUsers';
import { AdminUsersApi } from '../../../api/adminUsers';
import { formatDateTime } from '../../../lib/formatDate';

const USERS_KEY = '/admin/users';

export default function AdminUsersPage() {
  return (
    <AdminOnly>
      <UsersManager />
    </AdminOnly>
  );
}

function UsersManager() {
  const { data, error, isLoading, mutate } = useSWR<AdminUser[]>(USERS_KEY, AdminUsersApi.fetchUsers, {
    revalidateOnFocus: true,
  });

  const users = data ?? [];

  return (
    <main>
      <h1>User management</h1>
      <p>Create, disable, or reset passwords for application users.</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem' }}>Invite a new user</h2>
        <CreateUserForm onCreated={() => mutate()} />
      </section>

      <section>
        <h2 style={{ fontSize: '1.2rem' }}>Existing users</h2>
        {isLoading && <p>Loading users…</p>}
        {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>Failed to load users: {String(error)}</p>}
        {!isLoading && !error && users.length === 0 && <p>No users yet.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {users.map(user => (
            <UserRow key={user.id} user={user} refresh={() => mutate()} />
          ))}
        </div>
      </section>
    </main>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => Promise<unknown> | void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('user');
    setIsActive(true);
  }, []);

  const handleSubmit = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await AdminUsersApi.createUser({
        username,
        email: email.trim() ? email.trim() : undefined,
        password,
        role,
        is_active: isActive,
      });
      setSuccess(`User ${username.trim()} created`);
      resetForm();
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 480, padding: 16 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Username</span>
          <input
            type="text"
            name="admin-create-username"
            required
            minLength={3}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="jdoe"
          />
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Email (optional)</span>
          <input
            type="email"
            name="admin-create-email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Temporary password</span>
          <input
            type="password"
            name="admin-create-password"
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Role</span>
          <select
            name="admin-create-role"
            value={role}
            onChange={e => setRole(e.target.value as 'admin' | 'user')}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            name="admin-create-active"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
          />
          <span>Active immediately</span>
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create user'}
        </button>

        {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p>}
        {success && <p style={{ color: 'var(--success, #15803d)' }}>{success}</p>}
      </div>
    </form>
  );
}

function UserRow({ user, refresh }: { user: AdminUser; refresh: () => Promise<unknown> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const createdLabel = formatDateTime(user.created_at);

  const update = async (patch: Parameters<typeof AdminUsersApi.updateUser>[1]) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await AdminUsersApi.updateUser(user.id, patch);
      await refresh();
      setMessage('Saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = (nextRole: 'admin' | 'user') => {
    if (nextRole === user.role) return;
    update({ role: nextRole });
  };

  const handleActiveToggle = () => {
    update({ is_active: !user.is_active });
  };

  const handlePasswordReset = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setResetting(true);
    setError(null);
    setMessage(null);
    try {
      await AdminUsersApi.resetPassword(user.id, password);
      setPassword('');
      setMessage('Password updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>{user.username}</strong>
          {!user.is_active && <span style={{ marginLeft: 8, color: '#b91c1c' }}>• Disabled</span>}
          <div style={{ fontSize: '0.875rem', color: 'var(--muted, #666)' }}>Created {createdLabel}</div>
          {user.email && <div style={{ fontSize: '0.875rem', color: 'var(--muted, #666)' }}>{user.email}</div>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Role</span>
            <select
              name={`user-${user.id}-role`}
              value={user.role}
              onChange={e => handleRoleChange(e.target.value as 'admin' | 'user')}
              disabled={saving}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              name={`user-${user.id}-active`}
              checked={user.is_active}
              onChange={handleActiveToggle}
              disabled={saving}
            />
            <span>Active</span>
          </label>
        </div>
      </header>

      <form onSubmit={handlePasswordReset} style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          name={`user-${user.id}-password`}
          type="password"
          placeholder="New password"
          value={password}
          minLength={8}
          onChange={e => setPassword(e.target.value)}
        />
        <button type="submit" disabled={resetting}>
          {resetting ? 'Updating…' : 'Update password'}
        </button>
      </form>

      {message && <p style={{ color: 'var(--success, #15803d)', marginTop: 8 }}>{message}</p>}
      {error && <p style={{ color: 'var(--danger, #b91c1c)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
