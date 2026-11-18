type VercelHeader = { key: string; value: string };

const configuredApiOrigin = process.env.CARELENS_API_ORIGIN;
if (!configuredApiOrigin) {
  throw new Error(
    'Set CARELENS_API_ORIGIN to the HTTPS CareLens API origin in the Vercel deployment environment.',
  );
}

const apiUrl = new URL(configuredApiOrigin);
if (
  apiUrl.protocol !== 'https:' ||
  apiUrl.username ||
  apiUrl.password ||
  apiUrl.pathname !== '/' ||
  apiUrl.search ||
  apiUrl.hash
) {
  throw new Error('CARELENS_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment.');
}

const apiOrigin = apiUrl.origin;
const securityHeaders: VercelHeader[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
];
const frontendCsp: VercelHeader = {
  key: 'Content-Security-Policy',
  value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
};

export const config = {
  buildCommand: 'npm run fe:build',
  installCommand: 'npm ci',
  outputDirectory: 'frontend/dist',
  rewrites: [
    { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ],
  headers: [
    { source: '/(.*)', headers: securityHeaders },
    { source: '/', headers: [frontendCsp] },
    // The API callback emits a nonce-based CSP for its popup completion page.
    // Keep the frontend policy off API responses so it does not block that nonce.
    { source: '/:path((?!api/).*)', headers: [frontendCsp] },
    { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    { source: '/config.js', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ],
};
