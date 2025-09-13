/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Forward browser /api/* -> FastAPI container
    const dest = process.env.API_BASE ?? 'http://api:8000';
    return [
      { source: '/api/:path*', destination: `${dest}/:path*` },
      // If your FastAPI mounts under /api, use the next line instead:
      // { source: '/api/:path*', destination: `${dest}/api/:path*` },
    ];
  },
};

export default nextConfig;
