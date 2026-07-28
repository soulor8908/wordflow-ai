/**
 * 左右滑动手势 hook（设计文档 §3.2：移动端左右滑切换单词）
 *
 * 左滑（下一张）/ 右滑（上一张）。
 *
 * 关键点（修复移动端滑动不生效）：
 * 1. 暴露 `style.touchAction = "pan-y"`：让浏览器只处理垂直滚动，
 *    水平手势交由 JS 处理，避免被默认行为吞掉。
 * 2. 滑动触发后设置 `justSwipedRef = true`，用于抑制紧随其后的合成
 *    click 事件（否则卡片会同时翻面，看起来"滑动没反应"）。
 * 3. 阈值降到 40px，垂直守卫放宽到 2.0，更易触发。
 */
import { useRef, useCallback } from "react";

interface SwipeHandlers {
  onPrev: () => void;
  onNext: () => void;
}

interface TouchPoint {
  x: number;
  y: number;
}

const SWIPE_THRESHOLD = 40; // 水平位移阈值（px）
const VERTICAL_GUARD = 2.0; // 垂直位移 > 水平 * 2.0 时视为滚动，不触发
/** 滑动后多久内抑制 click（ms） */
const SUPPRESS_CLICK_MS = 400;

export function useSwipe({ onPrev, onNext }: SwipeHandlers) {
  const startRef = useRef<TouchPoint | null>(null);
  const suppressUntilRef = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchMove = useCallback(() => {
    // 占位：保持 touchmove 监听以覆盖某些浏览器的被动监听要求
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < SWIPE_THRESHOLD) return; // 位移不足，视为点击
      if (absDy > absDx * VERTICAL_GUARD) return; // 垂直滚动
      // 标记抑制接下来的合成 click
      suppressUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
      if (dx < 0) {
        onNext();
      } else {
        onPrev();
      }
    },
    [onPrev, onNext]
  );

  /** 判断刚发生的 click 是否应被抑制（滑动后 400ms 内的合成 click） */
  const shouldSuppressClick = useCallback(() => {
    return Date.now() < suppressUntilRef.current;
  }, []);

  /** 供卡片容器使用的样式：允许垂直滚动、水平交由 JS */
  const touchActionStyle = { touchAction: "pan-y" } as const;

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    shouldSuppressClick,
    touchActionStyle,
  };
}
