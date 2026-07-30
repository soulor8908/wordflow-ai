"use client";

/**
 * 徽章勋章图标 —— 产品视觉签名（设计文档 §4.2 特性 3）
 *
 * 设计语言：「切面宝石勋章 Faceted Gemstone Medals」
 *
 * 取舍（乔布斯式 + 卡帕西式）：
 * - 每枚徽章是一枚切面宝石 + 中心类别线形 glyph，整体一致、克制、有工艺感
 * - 稀有度通过形状、切面数、装饰元素、材质渐变四维编码，而非仅靠颜色：
 *   · 铜级：六边形 + 6 切面 + 哑光暖铜 → 朴素基石
 *   · 银级：六边形 + 12 切面（内环） + 抛光高光 → 精炼进阶
 *   · 金级：六边形 + 12 切面 + 放射星芒 + 光晕 → 辉煌成就
 *   · 钻级：八边形 + 16 切面 + 皇冠 + 棱镜折射 → 至尊收藏
 * - 类别通过中心 glyph 编码
 * - 未解锁：去色灰阶 + 降透明度，保留剪影让用户识别"那里有一枚徽章"
 * - 隐藏徽章解锁前：钥匙孔 glyph + ???，不解密内容只给神秘感
 * - 全 SVG，stroke=currentColor，继承父级颜色；尺寸由 className 控制（默认 h-12 w-12）
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

/** 稀有度 → 完整视觉规格（配色 + 切面 + 装饰） */
interface RaritySpec {
  /** 主体渐变亮色端 */
  light: string;
  /** 主体渐变暗色端 */
  dark: string;
  /** 描边色 */
  ring: string;
  /** 高光色（抛光/折射用） */
  highlight: string;
  /** 内部切面线色 */
  facet: string;
  /** 顶点坐标（形状轮廓） */
  shape: "hexagon" | "octagon";
  /** 是否绘制内环（银级+） */
  innerRing: boolean;
  /** 是否绘制放射星芒（金级+） */
  starRays: boolean;
  /** 是否绘制光晕（金级+） */
  glow: boolean;
  /** 是否绘制皇冠（钻级） */
  crown: boolean;
  /** 是否绘制棱镜闪光点（钻级） */
  sparkles: boolean;
}

const RARITY_SPECS: Record<BadgeRarity, RaritySpec> = {
  bronze: {
    light: "#e0b27a",
    dark: "#8a5a2b",
    ring: "#5e3d1c",
    highlight: "#f0d4a0",
    facet: "#c8965a",
    shape: "hexagon",
    innerRing: false,
    starRays: false,
    glow: false,
    crown: false,
    sparkles: false,
  },
  silver: {
    light: "#e8edf2",
    dark: "#9aa3ad",
    ring: "#6b7280",
    highlight: "#ffffff",
    facet: "#c0c8d0",
    shape: "hexagon",
    innerRing: true,
    starRays: false,
    glow: false,
    crown: false,
    sparkles: false,
  },
  gold: {
    light: "#ffe79a",
    dark: "#c9941f",
    ring: "#8a6212",
    highlight: "#fff8d6",
    facet: "#e8b840",
    shape: "hexagon",
    innerRing: true,
    starRays: true,
    glow: true,
    crown: false,
    sparkles: false,
  },
  diamond: {
    light: "#a9ecff",
    dark: "#4aa3c7",
    ring: "#2a7a9a",
    highlight: "#e0f7ff",
    facet: "#7ac8e0",
    shape: "octagon",
    innerRing: true,
    starRays: true,
    glow: true,
    crown: true,
    sparkles: true,
  },
};

/** 六边形顶点（尖顶，48×48 viewBox） */
const HEXAGON_POINTS = "24,2 43,13 43,35 24,46 5,35 5,13";

/** 八边形顶点（48×48 viewBox，更接近圆形 = 更多折射面） */
const OCTAGON_POINTS = "24,2 38,7 43,16 43,32 38,41 24,46 10,41 5,32 5,16 10,7";

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
 * 绘制切面线：从中心到各顶点。
 * 六边形 = 6 条线；八边形 = 8 条线 + 对角线 = 更多折射面。
 */
function FacetLines({ spec }: { spec: RaritySpec }) {
  const isOct = spec.shape === "octagon";
  const vertices = isOct
    ? [[24,2],[38,7],[43,16],[43,32],[38,41],[24,46],[10,41],[5,32],[5,16],[10,7]]
    : [[24,2],[43,13],[43,35],[24,46],[5,35],[5,13]];

  return (
    <g
      stroke={spec.facet}
      strokeWidth={0.7}
      strokeLinejoin="round"
      opacity={0.55}
    >
      {vertices.map(([x, y], i) => (
        <line key={i} x1="24" y1="24" x2={x} y2={y} />
      ))}
      {/* 八边形额外对角线切面，增强钻石折射感 */}
      {isOct && (
        <>
          <line x1="10" y1="7" x2="38" y2="41" />
          <line x1="38" y1="7" x2="10" y2="41" />
          <line x1="5" y1="16" x2="43" y2="32" />
          <line x1="43" y1="16" x2="5" y2="32" />
        </>
      )}
    </g>
  );
}

/**
 * 渲染一枚切面宝石勋章。
 *
 * @param iconKey  类别 glyph（由 rule.icon 提供）
 * @param rarity   稀有度，决定宝石形状、切面、装饰、配色
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
  const glowId = `bg-${uid}`;
  const spec = RARITY_SPECS[rarity];
  const shownKey: BadgeIconKey = masked ? "keyhole" : (iconKey as BadgeIconKey);
  const points = spec.shape === "octagon" ? OCTAGON_POINTS : HEXAGON_POINTS;

  // 未解锁：去色（统一中性灰，保留剪影）
  const fillRef = unlocked ? `url(#${fillId})` : "#3f3f46";
  const rimColor = unlocked ? `url(#${rimId})` : "#27272a";

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={masked ? "隐藏徽章" : `${rarity} 徽章`}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={unlocked ? spec.light : "#52525b"} />
          <stop offset="100%" stopColor={unlocked ? spec.dark : "#3f3f46"} />
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={unlocked ? spec.light : "#52525b"} />
          <stop offset="55%" stopColor={unlocked ? spec.dark : "#3f3f46"} />
          <stop offset="100%" stopColor={unlocked ? spec.light : "#52525b"} />
        </linearGradient>
        {/* 金/钻级光晕径向渐变 */}
        {unlocked && spec.glow && (
          <radialGradient id={glowId} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={spec.highlight} stopOpacity="0.45" />
            <stop offset="60%" stopColor={spec.light} stopOpacity="0.15" />
            <stop offset="100%" stopColor={spec.light} stopOpacity="0" />
          </radialGradient>
        )}
      </defs>

      {/* 光晕（金级+）：宝石背后的柔和辉光 */}
      {unlocked && spec.glow && (
        <circle cx="24" cy="24" r="26" fill={`url(#${glowId})`} />
      )}

      {/* 放射星芒（金级+）：从宝石向外辐射的光线 */}
      {unlocked && spec.starRays && (
        <g
          stroke={spec.highlight}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.5"
        >
          <line x1="24" y1="0" x2="24" y2="-2" />
          <line x1="24" y1="48" x2="24" y2="50" />
          <line x1="0" y1="24" x2="-2" y2="24" />
          <line x1="48" y1="24" x2="50" y2="24" />
          <line x1="7" y1="7" x2="5" y2="5" />
          <line x1="41" y1="7" x2="43" y2="5" />
          <line x1="7" y1="41" x2="5" y2="43" />
          <line x1="41" y1="41" x2="43" y2="43" />
        </g>
      )}

      {/* 宝石主体 */}
      <polygon
        points={points}
        fill={fillRef}
        stroke={rimColor}
        strokeWidth={unlocked ? 2.4 : 2}
        strokeLinejoin="round"
      />

      {/* 内部切面线 */}
      {unlocked && <FacetLines spec={spec} />}

      {/* 内环（银级+）：双重边界，增强精致感 */}
      {unlocked && spec.innerRing && (
        <polygon
          points={spec.shape === "octagon"
            ? "24,6 35,10 39,17 39,31 35,38 24,42 13,38 9,31 9,17 13,10"
            : "24,6 39,14 39,34 24,42 9,34 9,14"
          }
          fill="none"
          stroke={spec.highlight}
          strokeWidth="0.8"
          opacity="0.5"
        />
      )}

      {/* 棱镜闪光点（钻级）：宝石表面的十字星折射 */}
      {unlocked && spec.sparkles && (
        <g fill={spec.highlight} opacity="0.8">
          {/* 左上折射 */}
          <path d="M14 14 L15 12 L16 14 L15 16 Z" />
          {/* 右下折射 */}
          <path d="M33 33 L34 31 L35 33 L34 35 Z" />
          {/* 中心微闪 */}
          <circle cx="20" cy="28" r="0.8" />
          <circle cx="30" cy="20" r="0.6" />
        </g>
      )}

      {/* 皇冠（钻级）：宝石顶部的小皇冠装饰 */}
      {unlocked && spec.crown && (
        <g
          fill={spec.highlight}
          stroke={spec.ring}
          strokeWidth="0.5"
          strokeLinejoin="round"
        >
          <path d="M20 3 L22 1 L24 3 L26 1 L28 3 L28 5 L20 5 Z" opacity="0.9" />
        </g>
      )}

      {/* 抛光高光（银级+）：左上角的弧形反光 */}
      {unlocked && spec.innerRing && (
        <path
          d="M 12 12 Q 18 8 24 8"
          fill="none"
          stroke={spec.highlight}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />
      )}

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
