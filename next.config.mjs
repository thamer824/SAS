/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundler.
  serverExternalPackages: ['better-sqlite3', 'nodemailer', 'web-push'],
  experimental: {
    // Server Actions receive filter payloads that can get chunky.
    serverActions: { bodySizeLimit: '2mb' },
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
}

export default nextConfig
