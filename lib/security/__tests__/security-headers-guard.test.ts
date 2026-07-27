import { describe, test, expect } from "vitest";
import { getSecurityHeaders, SECURITY_HEADERS } from "@/lib/security/headers";
import nextConfig from "@/next.config";

describe("SECURITY_HEADERS 四件套完整性", () => {
  test("包含 HSTS", () => {
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain(
      "max-age=63072000"
    );
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain(
      "includeSubDomains"
    );
  });

  test("包含 CSP，default-src 'self'", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("X-Frame-Options = DENY（防点击劫持）", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  test("Permissions-Policy 收敛 camera/microphone/geolocation", () => {
    const pp = SECURITY_HEADERS["Permissions-Policy"];
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("interest-cohort=()");
  });
});

describe("getSecurityHeaders", () => {
  test("返回 {key, value} 数组，覆盖四件套", () => {
    const headers = getSecurityHeaders();
    const keys = headers.map((h) => h.key);
    expect(keys).toContain("Strict-Transport-Security");
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Permissions-Policy");
    expect(headers).toHaveLength(4);
  });
});

describe("next.config.ts 安全头接入", () => {
  test("headers() 配置存在且覆盖四件套（应用到所有路由）", async () => {
    const config = nextConfig as {
      headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
    };
    expect(typeof config.headers).toBe("function");
    const result = await config.headers!();
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("/:path*");
    const keys = result[0].headers.map((h) => h.key);
    expect(keys).toContain("Strict-Transport-Security");
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Permissions-Policy");
  });
});
