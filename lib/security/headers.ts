/**
 * 安全头（对齐设计文档 §4.7 + OWASP 最佳实践）
 * 守护测试：__tests__/security-headers.test.ts
 *
 * 六件套：
 * 1. HSTS — 强制 HTTPS（2 年 + includeSubDomains）
 * 2. CSP — 限制资源加载来源（default-src 'self'，禁止内嵌 frame）
 * 3. X-Frame-Options — 禁止被 iframe 嵌套（防点击劫持）
 * 4. X-Content-Type-Options — 禁止 MIME 类型嗅探（防 XSSI）
 * 5. Referrer-Policy — 控制 Referrer 泄漏（仅同源发送完整 URL）
 * 6. Permissions-Policy — 禁用不必要的浏览器 API（摄像头/麦克风/地理位置等）
 *
 * CSP connect-src 说明：
 * AI 请求全部走服务端 API 路由（/api/ai/chat），不直接从浏览器调外部 API，
 * 所以 connect-src 只需 'self'。外部 AI 服务的 fetch 发生在服务端，不受 CSP 限制。
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
};

/** 转换为 Next.js headers() 配置格式 */
export function getSecurityHeaders(): { key: string; value: string }[] {
  return Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }));
}
