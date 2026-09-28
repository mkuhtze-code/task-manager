'use client';

import type { ReactNode } from 'react';

import ErrorBoundary from '@/components/ErrorBoundary';
import { AuthProvider } from '@/lib/auth/AuthContext';

/**
 * Client-side providers mounted from the root layout.
 *
 * ErrorBoundary sits outside AuthProvider so a provider-level
 * rendering failure still receives the recovery surface.
 */
export default function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ErrorBoundary>
  );
}
