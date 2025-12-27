'use client';

import Link from 'next/link';
import { useMe } from '../lib/useMe';
import { useModules } from '../lib/useModules';

export default function NavLinks() {
  const { isAdmin, me } = useMe();
  const { modules } = useModules();

  return (
    <>
      <Link href="/">Home</Link>
      <Link href="/bottles">{modules.wine ? 'Whiskey' : 'Bottles'}</Link>
      {modules.wine && <Link href="/wine">Wine</Link>}
      {isAdmin && (
        <>
          <Link href="/admin">Admin</Link>
          <Link href="/security">Account</Link>
        </>
      )}
    </>
  );
}
