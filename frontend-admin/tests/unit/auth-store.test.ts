import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture } from '@/test/fixtures';

describe('auth-store', () => {
  it('setAuth and clear', () => {
    useAuthStore.getState().setAuth('token-123', adminUserFixture);
    expect(useAuthStore.getState().accessToken).toBe('token-123');
    expect(useAuthStore.getState().user?.role).toBe('admin');
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
