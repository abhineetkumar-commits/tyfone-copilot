import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  serverExternalPackages: ['googleapis', '@anthropic-ai/sdk', 'exceljs', 'pdf-parse'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }],
  },
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
};
export default nextConfig;