'use client';

import { createContext, useContext } from 'react';

type AdminContextValue = {
  session: any;
};

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdminSession() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdminSession must be used within the admin layout');
  return ctx;
}
