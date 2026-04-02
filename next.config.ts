import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      // Apply to all routes — prevent aggressive browser caching (Arc, etc.)
      source: "/(.*)",
      headers: [
        { key: "Cache-Control", value: "no-store, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      // API routes can still cache briefly on CDN
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=300, s-maxage=300" },
      ],
    },
  ],
};

export default nextConfig;
