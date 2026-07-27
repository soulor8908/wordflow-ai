import type { NextConfig } from "next";
import { getSecurityHeaders } from "@/lib/security/headers";

// OpenNext Cloudflare adapter dev hook（设计文档 §8.4）
// 仅在 dev 模式下初始化 Cloudflare bindings，构建时为 no-op
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/:path*",
      headers: getSecurityHeaders(),
    },
  ],
};

export default nextConfig;
