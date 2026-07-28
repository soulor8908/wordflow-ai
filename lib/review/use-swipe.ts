/**
 * 左右滑动手势 hook（设计文档 §3.2：移动端左右滑切换单词）
 *
 * 左滑（下一张）/ 右滑（上一张），阈值 50px，避免与垂直滚动冲突。
 * 返回 onTouchStart / onTouchMove / onTouchEnd，挂到卡片容器即可。
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

const SWIPE_THRESHOLD = 50; // 水平位移阈值（px）
const VERTICAL_GUARD = 1.5; // 垂直位移 > 水平 * 1.5 时视为滚动，不触发

export function useSwipe({ onPrev, onNext }: SwipeHandlers) {
  const startRef = useRef<TouchPoint | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchMove = useCallback(() => {
    // 占位：避免被动监听警告；实际判定在 touchend
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return; // 位移不足
      if (Math.abs(dy) > Math.abs(dx) * VERTICAL_GUARD) return; // 垂直滚动
      if (dx < 0) {
        onNext();
      } else {
        onPrev();
      }
    },
    [onPrev, onNext]
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
