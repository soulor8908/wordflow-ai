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
