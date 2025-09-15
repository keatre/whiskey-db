/** @type {import('next').NextConfig} */
const nextConfig = {
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
