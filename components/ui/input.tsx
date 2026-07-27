"use client";

/**
 * Input 组件（设计文档 §8.1：统一组件库 @/components/ui，禁止原生 <input>）
 * 包装原生 input，提供统一 API + 设计令牌 + 暗色配对。
 */
import { forwardRef, type InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-neutral-300 px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:ring-blue-900 ${className}`}
        {...props}
      />
    );
  }
);
