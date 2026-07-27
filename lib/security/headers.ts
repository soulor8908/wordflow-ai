/**
 * 安全头四件套（对齐设计文档 §4.7 + devpath-ai next.config.js headers()）
 * 守护测试：__tests__/security-headers.test.ts
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.deepseek.com https://open.bigmodel.cn https://api.xiaomimimo.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
};

/** 转换为 Next.js headers() 配置格式 */
export function getSecurityHeaders(): { key: string; value: string }[] {
  return Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }));
}
