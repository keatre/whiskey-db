'use client';

import Link from 'next/link';
import AdminOnly from '../../components/AdminOnly';

export default function AdminHome() {
  return (
    <AdminOnly>
      <main>
        <h1>Admin</h1>
        <p>Centralized tools for managing your Whiskey DB deployment.</p>
        <ul>
          <li>
            <Link href="/admin/users">User management</Link>
          </li>
          <li>
            <Link href="/admin/prices">Market prices</Link>
          </li>
        </ul>
      </main>
    </AdminOnly>
  );
}
