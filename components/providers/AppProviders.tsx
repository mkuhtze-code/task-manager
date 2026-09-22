'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/AuthContext';

/** Client-side providers mounted from the root layout. */
export default function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
