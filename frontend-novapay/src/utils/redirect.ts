/** Allow only same-origin in-app paths for post-login redirects. */
export function sanitizeRedirectPath(from: string | undefined, fallback: string): string {
  if (!from || !from.startsWith('/') || from.startsWith('//')) {
    return fallback;
  }
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(from)) {
    return fallback;
  }
  return from;
}
