export function createContentSecurityPolicy(
  nonce: string,
  development: boolean,
): string {
  const scriptSource = development
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const directives = [
    "default-src 'self'",
    scriptSource,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.workos.com",
    "frame-ancestors 'none'",
    "connect-src 'self' https://api.workos.com https://*.workos.com https://*.sentry.io",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}
