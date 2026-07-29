"use client";

/**
 * Button 组件（设计文档 §8.1：统一组件库 @/components/ui，禁止原生 <button>）
 * 包装原生 button，提供统一 API + 设计令牌 + 暗色配对。
 */
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "link" | "plain";
type Size = "sm" | "md" | "lg" | "icon" | "iconSm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 border border-blue-600",
  secondary:
    "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800",
  ghost:
    "bg-transparent text-blue-600 hover:bg-blue-50 border border-transparent dark:hover:bg-blue-950",
  danger:
    "bg-red-600 text-white hover:bg-red-700 border border-red-600",
  success:
    "bg-green-600 text-white hover:bg-green-700 border border-green-600",
  link:
    "bg-transparent text-blue-600 hover:text-blue-700 hover:underline border border-transparent px-0 py-0",
  plain:
    "bg-transparent text-inherit hover:bg-neutral-100 border border-transparent px-0 py-0 dark:hover:bg-neutral-800",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-2.5 text-base",
  icon: "h-10 w-10 p-0",
  iconSm: "h-8 w-8 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className = "", ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      />
    );
  }
);
