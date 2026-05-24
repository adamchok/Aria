import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserResponse } from '@/types/api';

interface AuthState {
  accessToken: string | null;
  user: UserResponse | null;
  setAuth: (token: string, user: UserResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      clear: () => set({ accessToken: null, user: null }),
    }),
    { name: 'aria-auth-mgmt' },
  ),
);

export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
