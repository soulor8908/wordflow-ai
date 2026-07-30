"use client";

/**
 * 徽章勋章图标 —— 产品视觉签名（设计文档 §4.2 特性 3）
 *
 * 设计语言：「切面宝石勋章 Faceted Gemstone Medals」
 *
 * 取舍（乔布斯式 + 卡帕西式）：
 * - 每枚徽章是一枚切面六边形宝石 + 中心类别线形 glyph，整体一致、克制、有工艺感
 * - 稀有度通过金属/宝石质感渐变编码（铜=暖铜 / 银=冷银 / 金=抛光金 / 钻=冰蓝晶）
 *   —— 不靠 emoji，不靠花哨贴纸，靠材质本身说话
 * - 类别通过中心 glyph 编码（火焰/书堆/靶心/指南针/闪电/日出/月牙/翻开的书/奖杯/钻石/钥匙孔）
 * - 未解锁：去色灰阶 + 降透明度，保留剪影让用户识别"那里有一枚徽章"
 * - 隐藏徽章解锁前：钥匙孔 glyph + ???，不解密内容只给神秘感
 * - 全 SVG，stroke=currentColor，继承父级颜色；尺寸由 className 控制（默认 h-12 w-12）
 *
 * 这是产品特色：所有徽章共用一套勋章语言，而非各画各的 emoji。
 */
import { useId } from "react";
import type { BadgeRarity } from "@/lib/gamification/badges";

/** 徽章 icon key（替代 emoji，由 badges.ts 的 rule.icon 提供） */
export type BadgeIconKey =
  | "flame"
  | "books"
  | "diamond"
  | "target"
  | "compass"
  | "bolt"
  | "sunrise"
  | "moon"
  | "book-open"
  | "trophy"
  | "keyhole";

/** 稀有度 → 渐变配色（亮色端 / 暗色端 / 描边） */
const RARITY_PALETTE: Record<
  BadgeRarity,
  { light: string; dark: string; ring: string }
> = {
  bronze: { light: "#e0b27a", dark: "#8a5a2b", ring: "#5e3d1c" },
  silver: { light: "#e8edf2", dark: "#9aa3ad", ring: "#6b7280" },
  gold: { light: "#ffe79a", dark: "#c9941f", ring: "#8a6212" },
  diamond: { light: "#a9ecff", dark: "#4aa3c7", ring: "#2a7a9a" },
};

/** 类别 glyph（24×24 坐标，stroke=currentColor） */
function Glyph({ iconKey }: { iconKey: BadgeIconKey }) {
  switch (iconKey) {
    case "flame":
      return (
        <>
          <path d="M12 2c0 4-6 5-6 11a6 6 0 0 0 12 0c0-3-2-5-3-7 0 2-1 3-2 3 0-3 0-5-1-7z" />
          <path d="M12 18a2 2 0 0 1-2-2c0-1 1-2 2-3 1 1 2 2 2 3a2 2 0 0 1-2 2z" />
        </>
      );
    case "books":
      return (
        <>
          <rect x="4" y="4" width="16" height="3.5" rx="0.6" />
          <rect x="4" y="9.5" width="16" height="3.5" rx="0.6" />
          <rect x="4" y="15" width="16" height="3.5" rx="0.6" />
        </>
      );
    case "diamond":
      return (
        <>
          <path d="M12 2l8 7-8 13L4 9z" />
          <path d="M4 9h16" />
          <path d="M12 2v20" />
        </>
      );
    case "target":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.2" />
        </>
      );
    case "compass":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <polygon points="15 9 13 13 9 15 11 11" />
        </>
      );
    case "bolt":
      return <path d="M13 2L4 14h7l-1 8 10-12h-7z" />;
    case "sunrise":
      return (
        <>
          <path d="M3 18h18" />
          <path d="M7 14a5 5 0 0 1 10 0" />
          <line x1="12" y1="3" x2="12" y2="6" />
          <line x1="5" y1="9" x2="6.5" y2="10.5" />
          <line x1="19" y1="9" x2="17.5" y2="10.5" />
        </>
      );
    case "moon":
      return <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />;
    case "book-open":
      return (
        <>
          <path d="M12 6C8 4 4 4 2 5v14c2-1 6-1 10 1 4-2 8-2 10-1V5c-2-1-6-1-10 1z" />
          <line x1="12" y1="6" x2="12" y2="20" />
        </>
      );
    case "trophy":
      return (
        <>
          <path d="M8 4h8v6a4 4 0 0 1-8 0z" />
          <path d="M8 4H4v2a4 4 0 0 0 4 4" />
          <path d="M16 4h4v2a4 4 0 0 1-4 4" />
          <path d="M12 14v4" />
          <path d="M8 20h8" />
        </>
      );
    case "keyhole":
      return (
        <>
          <circle cx="12" cy="9" r="3" />
          <path d="M12 12v7" />
        </>
      );
  }
}

/**
 * 渲染一枚切面宝石勋章。
 *
 * @param iconKey  类别 glyph（由 rule.icon 提供）
 * @param rarity   稀有度，决定宝石材质配色
 * @param unlocked 是否已解锁（未解锁 → 灰阶剪影）
 * @param masked   隐藏徽章解锁前（→ 钥匙孔 glyph）
 * @param className 尺寸/布局（默认 h-12 w-12）
 */
export function BadgeIcon({
  iconKey,
  rarity,
  unlocked,
  masked = false,
  className = "h-12 w-12",
}: {
  iconKey: string;
  rarity: BadgeRarity;
  unlocked: boolean;
  masked?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const fillId = `bf-${uid}`;
  const rimId = `br-${uid}`;
  const palette = RARITY_PALETTE[rarity];
  const shownKey: BadgeIconKey = masked ? "keyhole" : (iconKey as BadgeIconKey);

  // 未解锁：去色（统一中性灰，保留剪影）
  const fillRef = unlocked ? `url(#${fillId})` : "#3f3f46";
  const rimColor = unlocked ? palette.ring : "#27272a";

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={masked ? "隐藏徽章" : `${rarity} 徽章`}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.light} />
          <stop offset="100%" stopColor={palette.dark} />
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.light} />
          <stop offset="55%" stopColor={palette.dark} />
          <stop offset="100%" stopColor={palette.light} />
        </linearGradient>
      </defs>

      {/* 切面六边形宝石外框（尖顶） */}
      <polygon
        points="24,2 43,13 43,35 24,46 5,35 5,13"
        fill={fillRef}
        stroke={unlocked ? `url(#${rimId})` : rimColor}
        strokeWidth={unlocked ? 2.4 : 2}
        strokeLinejoin="round"
      />

      {/* 内部切面线：从中心到各顶点，营造宝石折射感 */}
      <g
        stroke={unlocked ? palette.light : "#52525b"}
        strokeWidth={0.7}
        strokeLinejoin="round"
        opacity={unlocked ? 0.55 : 0.35}
      >
        <line x1="24" y1="24" x2="24" y2="2" />
        <line x1="24" y1="24" x2="43" y2="13" />
        <line x1="24" y1="24" x2="43" y2="35" />
        <line x1="24" y1="24" x2="24" y2="46" />
        <line x1="24" y1="24" x2="5" y2="35" />
        <line x1="24" y1="24" x2="5" y2="13" />
      </g>

      {/* 中心类别 glyph（16×16，居中） */}
      <g
        transform="translate(16 16)"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Glyph iconKey={shownKey} />
      </g>
    </svg>
  );
}
