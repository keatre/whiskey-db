'use client';

import Link from 'next/link';
import { useMe } from '../lib/useMe';

export default function NavLinks() {
  const { isAdmin } = useMe();

  return (
    <>
      <Link href="/">Home</Link>
      <Link href="/bottles">Bottles</Link>
      {isAdmin && <Link href="/retailers">Retailers</Link>}
    </>
  );
}
