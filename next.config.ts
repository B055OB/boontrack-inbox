import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const coreBackendUrl = (
      process.env.CORE_BACKEND_URL ||
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "https://boontrack-core-production.up.railway.app"
    ).replace(/\/$/, "");

    return [
      {
        source: "/api/v1/:path*",
        destination: `${coreBackendUrl}/api/v1/:path*`,
      },
      {
        source: "/api/orders",
        destination: `${coreBackendUrl}/api/v1/orders`,
      },
    ];
  },
};

export default nextConfig;