"use client";

/**
 * Input 组件（设计文档 §8.1：统一组件库 @/components/ui，禁止原生 <input>）
 * 包装原生 input，提供统一 API + 设计令牌 + 暗色配对。
 */
import { forwardRef, type InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = "", type = "text", ...props }, ref) {
    // checkbox/radio 不套文本框样式，仅给统一设计令牌；尺寸由消费方控制
    const isCheckable = type === "checkbox" || type === "radio";
    const base = isCheckable
      ? "rounded border-neutral-300 text-blue-600 focus:ring-2 focus:ring-blue-200 dark:border-neutral-600"
      : "w-full rounded-lg border border-neutral-300 px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:ring-blue-900";
    return (
      <input
        ref={ref}
        type={type}
        className={`${base} ${className}`}
        {...props}
      />
    );
  }
);
