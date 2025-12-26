'use client';

import Link from 'next/link';
import { useMe } from '../lib/useMe';

export default function NavLinks() {
  const { isAdmin, me } = useMe();

  return (
    <>
      <Link href="/">Home</Link>
      <Link href="/bottles">Bottles</Link>
      {me.authenticated && <Link href="/security">Security</Link>}
      {isAdmin && (
        <>
          <Link href="/retailers">Retailers</Link>
          <Link href="/admin">Admin</Link>
        </>
      )}
    </>
  );
}
