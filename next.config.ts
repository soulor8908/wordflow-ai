import type { NextConfig } from "next";
import { getSecurityHeaders } from "@/lib/security/headers";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/:path*",
      headers: getSecurityHeaders(),
    },
  ],
};

export default nextConfig;
