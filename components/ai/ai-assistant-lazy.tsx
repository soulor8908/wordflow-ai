"use client";

import dynamic from "next/dynamic";

/**
 * AiAssistant 懒加载包装（移出首屏包）
 *
 * Next.js 16：Server Component 动态导入 Client Component 不支持代码分割，
 * 且 ssr:false 仅在 Client Component 中生效。故用本包装组件 + ssr:false，
 * 使 AiAssistant（~1100 行 + nanoid/markdown 依赖）独立分块，
 * 仅在客户端 hydration 后加载，不阻塞首屏 LCP。
 */
const AiAssistant = dynamic(() => import("./ai-assistant"), {
  ssr: false,
  loading: () => null,
});

export default function AiAssistantLazy() {
  return <AiAssistant />;
}
