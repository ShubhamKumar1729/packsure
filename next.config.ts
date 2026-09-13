import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The sandbox preview is proxied from this origin in development.
  allowedDevOrigins: ['**.e2b.app', '**.arena.site'],
}

export default nextConfig
