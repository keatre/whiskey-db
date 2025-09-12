'use client';
import React from 'react';
import { useMe } from '../lib/useMe';

export default function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useMe();
  if (loading) return null;
  if (!isAdmin) return null;
  return <>{children}</>;
}