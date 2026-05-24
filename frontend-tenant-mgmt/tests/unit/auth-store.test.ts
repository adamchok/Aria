import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';

describe('auth-store', () => {
  it('setAuth and clear', () => {
    useAuthStore.getState().setAuth('token-123', {
      id: 'u1',
      email: 'u@test.com',
      role: 'tenant_user',
      tenant_id: 't1',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(useAuthStore.getState().accessToken).toBe('token-123');
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
