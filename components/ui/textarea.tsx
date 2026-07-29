"use client";

/**
 * Textarea 组件（设计文档 §8.1：统一组件库 @/components/ui，禁止原生 <textarea>）
 * 包装原生 textarea，提供统一 API + 设计令牌 + 暗色配对。
 */
import { forwardRef, type TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className = "", ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:ring-blue-900 ${className}`}
        {...props}
      />
    );
  }
);
