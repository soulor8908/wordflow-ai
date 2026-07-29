import { describe, test, expect } from "vitest";
import { SECURITY_HEADERS, getSecurityHeaders } from "@/lib/security/headers";

describe("SECURITY_HEADERS", () => {
  test("includes HSTS with 2-year max-age, includeSubDomains and preload", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"];
    expect(hsts).toContain("max-age=63072000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  test("includes CSP with default-src 'self'", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
  });

  test("CSP connect-src is 'self' only (AI calls go through server-side routes)", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("connect-src 'self'");
    // 不应包含外部 AI 域名（AI 请求走服务端，不直接从浏览器发起）
    expect(csp).not.toContain("api.deepseek.com");
    expect(csp).not.toContain("open.bigmodel.cn");
  });

  test("CSP includes object-src 'none' (blocks Flash/plugins)", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("object-src 'none'");
  });

  test("includes X-Frame-Options DENY", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  test("includes X-Content-Type-Options nosniff", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  test("includes Referrer-Policy strict-origin-when-cross-origin", () => {
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  test("includes Permissions-Policy disabling camera/mic/geo", () => {
    const pp = SECURITY_HEADERS["Permissions-Policy"];
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("interest-cohort=()");
    expect(pp).toContain("browsing-topics=()");
  });

  test("has exactly 6 security headers (六件套)", () => {
    expect(Object.keys(SECURITY_HEADERS)).toHaveLength(6);
  });
});

describe("getSecurityHeaders", () => {
  test("returns array of {key, value} for Next.js headers() config", () => {
    const headers = getSecurityHeaders();
    expect(headers).toHaveLength(6);
    expect(headers[0]).toHaveProperty("key");
    expect(headers[0]).toHaveProperty("value");
  });
});
