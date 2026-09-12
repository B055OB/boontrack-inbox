import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.CORE_BACKEND_URL || "https://boontrack-core-production.up.railway.app"}/api/v1/:path*`,
      },
      {
        source: "/api/orders",
        destination: `${process.env.CORE_BACKEND_URL || "https://boontrack-core-production.up.railway.app"}/api/v1/orders`,
      },
    ];
  },
};

export default nextConfig;
