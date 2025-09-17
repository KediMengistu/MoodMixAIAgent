import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["127.0.0.1"],
  eslint: {
    // ✅ don’t fail `next build` on ESLint errors
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
