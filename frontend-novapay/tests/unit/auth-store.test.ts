import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';

describe('auth-store', () => {
  it('login sets isLoggedIn to true', () => {
    useAuthStore.getState().logout();
    useAuthStore.getState().login();
    expect(useAuthStore.getState().isLoggedIn).toBe(true);
  });

  it('logout sets isLoggedIn to false', () => {
    useAuthStore.getState().login();
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isLoggedIn).toBe(false);
  });
});
