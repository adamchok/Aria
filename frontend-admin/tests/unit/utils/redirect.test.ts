import { describe, expect, it } from 'vitest';
import { sanitizeRedirectPath } from '@/utils/redirect';

describe('sanitizeRedirectPath', () => {
  it('allows internal paths', () => {
    expect(sanitizeRedirectPath('/jobs/abc/results', '/')).toBe('/jobs/abc/results');
  });

  it('rejects protocol-relative and external paths', () => {
    expect(sanitizeRedirectPath('//evil.com', '/tenants')).toBe('/tenants');
    expect(sanitizeRedirectPath('https://evil.com', '/tenants')).toBe('/tenants');
  });

  it('falls back when path is empty', () => {
    expect(sanitizeRedirectPath(undefined, '/dashboard')).toBe('/dashboard');
  });
});
