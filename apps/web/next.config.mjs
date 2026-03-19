/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  experimental: {
    externalDir: true,
  },
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  reactStrictMode: true,
}

export default nextConfig
