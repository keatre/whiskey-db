/** @type {import('next').NextConfig} */
const minutes =
  process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES ||
  process.env.ACCESS_TOKEN_EXPIRE_MINUTES ||
  '20';

const appName =
  process.env.NEXT_PUBLIC_APP_NAME || process.env.APP_NAME || 'Whiskey DB';

const nextConfig = {
  env: {
    NEXT_PUBLIC_SESSION_IDLE_MINUTES: minutes,
    NEXT_PUBLIC_APP_NAME: appName,
    ACCESS_TOKEN_EXPIRE_MINUTES: process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '20',
    NEXT_PUBLIC_JWT_COOKIE_NAME: process.env.JWT_COOKIE_NAME || 'access_token',
    NEXT_PUBLIC_JWT_REFRESH_COOKIE_NAME:
      process.env.JWT_REFRESH_COOKIE_NAME || 'refresh_token',
    NEXT_PUBLIC_COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
    NEXT_PUBLIC_COOKIE_SECURE: process.env.COOKIE_SECURE || '',
    NEXT_PUBLIC_COOKIE_SAMESITE: process.env.COOKIE_SAMESITE || '',
  },
  async rewrites() {
    // Backend origin reachable from the web container or browser:
    // e.g. NEXT_BACKEND_ORIGIN=http://api:8000  (Docker)
    const origin = process.env.NEXT_BACKEND_ORIGIN || 'http://api:8000';

    // Normalize to avoid double slashes
    const stripTrailing = (s) => s.replace(/\/+$/, '');
    const normalizedOrigin = stripTrailing(origin);

    // Browser hits /api/*  ->  backend receives /*  (backend lives at root)
    return [
      {
        source: '/api/:path*',
        destination: `${normalizedOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
