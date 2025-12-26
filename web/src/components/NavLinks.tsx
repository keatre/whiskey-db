'use client';

import Link from 'next/link';
import { useMe } from '../lib/useMe';

export default function NavLinks() {
  const { isAdmin, me } = useMe();

  return (
    <>
      <Link href="/">Home</Link>
      <Link href="/bottles">Bottles</Link>
      {isAdmin && (
        <>
          <Link href="/admin">Admin</Link>
          <Link href="/security">Account</Link>
        </>
      )}
    </>
  );
}
