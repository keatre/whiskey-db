'use client';

import { useEffect, useState } from 'react';

type VersionResponse = { version?: string };

export default function VersionDisplay() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/version', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: VersionResponse | null) => {
        if (!mounted) return;
        const display = data?.version?.trim();
        setVersion(display || null);
      })
      .catch(() => {
        if (mounted) setVersion(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!version) return null;
  return <span className="version-display">{version}</span>;
}
