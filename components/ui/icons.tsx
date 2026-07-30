/**
 * SVG 图标集（设计文档 §8.1：统一组件库 @/components/ui）
 *
 * 规范：禁止使用 emoji 表情包图标，UI 图标统一用 SVG（Lucide 风格 stroke icon）。
 *
 * - 所有图标 stroke="currentColor" fill="none"，继承父级 text 颜色
 * - 默认 viewBox 0 0 24 24，stroke-width 2，圆角线帽
 * - 通过 className 控制尺寸（如 h-5 w-5）和颜色（如 text-blue-500）
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Base({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** 查词（放大镜） */
export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Base>
  );
}

/** 词库（翻开的书） */
export function BookIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" />
      <path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
    </Base>
  );
}

/** 复习（一摞书） */
export function BooksIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 4h4v16H4z" />
      <path d="M10 4h4v16h-4z" />
      <path d="M16 6l4-1 2 14-4 1z" />
    </Base>
  );
}

/** 我的（用户） */
export function UserIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </Base>
  );
}

/** AI 助手（聊天气泡） */
export function ChatIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M21 15a3 3 0 0 1-3 3H8l-5 4V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="13" y2="14" />
    </Base>
  );
}

/** 关闭（X） */
export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Base>
  );
}

/** 菜单（三横线，用于展开会话列表） */
export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Base>
  );
}

/** API Key（钥匙） */
export function KeyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="7" cy="15" r="4" />
      <path d="M10 12l10-10" />
      <path d="M16 6l2 2" />
      <path d="M19 3l2 2" />
    </Base>
  );
}

/** 发音（喇叭） */
export function VolumeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M11 5L6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Base>
  );
}

/** AI 配置（机器人） */
export function RobotIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 4v4" />
      <circle cx="12" cy="4" r="1" />
      <line x1="9" y1="14" x2="9" y2="14" />
      <line x1="15" y1="14" x2="15" y2="14" />
    </Base>
  );
}

/** 加号（收藏入队） */
export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Base>
  );
}

/** 奖杯（完成庆祝） */
export function TrophyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4h8v6a4 4 0 0 1-8 0z" />
      <path d="M8 4H4v2a4 4 0 0 0 4 4" />
      <path d="M16 4h4v2a4 4 0 0 1-4 4" />
      <path d="M12 14v4" />
      <path d="M8 20h8" />
      <path d="M9 20v-2h6v2" />
    </Base>
  );
}

/** 云朵（云端同步） */
export function CloudIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9c-.27 0-.54.02-.8.07A6 6 0 0 0 5 13v.5A4.5 4.5 0 0 0 6.5 22h11" />
      <path d="M12 12v6" />
      <path d="M9 15l3 3 3-3" />
    </Base>
  );
}

/** 刷新（同步状态） */
export function RefreshIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </Base>
  );
}

/** 闪电（快捷输入） */
export function BoltIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
    </Base>
  );
}

/** 编辑（铅笔） */
export function EditIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Base>
  );
}

/** 删除（垃圾桶） */
export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Base>
  );
}

/** 向左箭头（返回/上一个） */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <polyline points="15 18 9 12 15 6" />
    </Base>
  );
}

/** 向右箭头（前进/下一个） */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <polyline points="9 18 15 12 9 6" />
    </Base>
  );
}

/** 复制（两个重叠矩形） */
export function CopyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Base>
  );
}

/** 检查（成功标记） */
export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <polyline points="20 6 9 17 4 12" />
    </Base>
  );
}

/** 火焰（连胜） */
export function FlameIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2c0 4-6 5-6 11a6 6 0 0 0 12 0c0-3-2-5-3-7 0 2-1 3-2 3 0-3 0-5-1-7z" />
      <path d="M12 18a2 2 0 0 1-2-2c0-1 1-2 2-3 1 1 2 2 2 3a2 2 0 0 1-2 2z" />
    </Base>
  );
}

/** 盾牌（连胜保护券） */
export function ShieldIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z" />
      <polyline points="9 12 11 14 15 10" />
    </Base>
  );
}

/** 靶心（精度 / 任务） */
export function TargetIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </Base>
  );
}

/** 指南针（探索） */
export function CompassIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="15 9 13 13 9 15 11 11" />
    </Base>
  );
}

/** 日出（早起鸟） */
export function SunriseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 18h18" />
      <path d="M7 14a5 5 0 0 1 10 0" />
      <line x1="12" y1="3" x2="12" y2="6" />
      <line x1="5" y1="9" x2="6.5" y2="10.5" />
      <line x1="19" y1="9" x2="17.5" y2="10.5" />
      <line x1="2" y1="22" x2="22" y2="22" />
    </Base>
  );
}

/** 月牙（夜猫子） */
export function MoonIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />
    </Base>
  );
}

/** 钻石（稀有度） */
export function DiamondIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2l8 7-8 13L4 9z" />
      <path d="M4 9h16" />
      <path d="M12 2v20" />
      <path d="M8 9l4-7 4 7" />
    </Base>
  );
}

/** 钥匙孔（隐藏徽章） */
export function KeyholeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="9" r="3" />
      <path d="M12 12v7" />
      <path d="M10 19h4" />
    </Base>
  );
}

/** 已勾选方框（任务完成） */
export function CheckSquareIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <polyline points="8 12 11 15 16 9" />
    </Base>
  );
}

/** 空方框（任务未完成） */
export function SquareIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </Base>
  );
}

/** 挥手（回归挽留） */
export function WaveIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 12a3 3 0 0 1 3-3 3 3 0 0 1 3 3v3" />
      <path d="M10 12a3 3 0 0 1 3-3 3 3 0 0 1 3 3v2" />
      <path d="M16 13a3 3 0 0 1 3-3 3 3 0 0 1 1 2v2a6 6 0 0 1-6 6h-3a8 8 0 0 1-8-8" />
    </Base>
  );
}

/** 问号圆圈（问 AI 查询） */
export function HelpCircleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </Base>
  );
}
