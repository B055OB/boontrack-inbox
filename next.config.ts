import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: '/api/railway/:path*',
        destination: 'https://boontrack-core-production.up.railway.app/api/:path*',
      },
    ];
  },
};

export default nextConfig;