import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TenantState {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  clear: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      apiKey: null,
      setApiKey: (apiKey) => set({ apiKey }),
      clear: () => set({ apiKey: null }),
    }),
    { name: 'aria-tenant' },
  ),
);

/** Stable accessor for use outside React components (e.g., in api/client.ts). */
export const getApiKey = (): string | null => useTenantStore.getState().apiKey;
