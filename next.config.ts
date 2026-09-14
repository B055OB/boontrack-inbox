import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.boontrack.com",
      },
      {
        protocol: "https",
        hostname: "asset.boontrack.com",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      {
        protocol: "https",
        hostname: "mpluzajlzpregmjwpjqr.supabase.co",
      },
      {
        protocol: "https",
        hostname: "quickchart.io",
      },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/orders",
          destination: `${process.env.CORE_BACKEND_URL || "https://boontrack-core-production.up.railway.app"}/api/v1/orders`,
        },
        {
          source: "/api/v1/:path*",
          destination: `${process.env.CORE_BACKEND_URL || "https://boontrack-core-production.up.railway.app"}/api/v1/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
