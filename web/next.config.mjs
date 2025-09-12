/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // no rewrites here — proxy is handled by the app routes above
};
export default nextConfig;
