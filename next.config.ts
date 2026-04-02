import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      // Pages only — prevent aggressive browser caching (Arc, etc.)
      // Exclude API routes and static assets
      source: "/:path((?!api|_next).*)",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
  ],
};

export default nextConfig;
