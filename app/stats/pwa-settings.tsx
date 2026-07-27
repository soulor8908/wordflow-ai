"use client";

/**
 * PWA 设置卡片（设计文档 §3.4：通知权限 + 静默开关）
 *
 * - 注册 Service Worker + Periodic Sync
 * - 通知权限状态 + 申请按钮
 * - 通知静默开关（settings:notification-muted）
 */
import { useEffect, useState } from "react";
import {
  registerServiceWorker,
  registerPeriodicSync,
  requestNotificationPermission,
} from "@/lib/pwa/sw-register";
import {
  getNotificationMuted,
  setNotificationMuted,
} from "@/lib/pwa/notification-settings";
import { Button } from "@/components/ui/button";

export default function PwaSettings() {
  const [swReady, setSwReady] = useState(false);
  const [periodicSync, setPeriodicSync] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 检测通知权限支持
      if (typeof window !== "undefined" && "Notification" in window) {
        setPermission(Notification.permission);
      } else {
        setPermission("unsupported");
      }
      // 加载静默开关
      const m = await getNotificationMuted();
      if (!cancelled) setMuted(m);
      // 注册 SW
      const reg = await registerServiceWorker();
      if (cancelled || !reg) return;
      setSwReady(true);
      // 注册 periodic sync
      const ok = await registerPeriodicSync();
      if (!cancelled) setPeriodicSync(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRequestPermission() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleMute() {
    if (busy) return;
    setBusy(true);
    try {
      const next = !muted;
      await setNotificationMuted(next);
      setMuted(next);
    } finally {
      setBusy(false);
    }
  }

  const permissionLabel: Record<string, string> = {
    granted: "已开启",
    denied: "已拒绝",
    default: "未开启",
    unsupported: "不支持",
  };

  return (
    <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        通知与离线
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-neutral-500">离线可用</span>
          <span className={swReady ? "text-green-500" : "text-neutral-400"}>
            {swReady ? "✓ 已就绪" : "加载中…"}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-neutral-500">后台提醒</span>
          <span className={periodicSync ? "text-green-500" : "text-neutral-400"}>
            {periodicSync ? "✓ 已开启" : "不支持"}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-neutral-500">复习通知</span>
          <div className="flex items-center gap-2">
            <span
              className={
                permission === "granted"
                  ? "text-green-500"
                  : permission === "denied"
                    ? "text-red-500"
                    : "text-neutral-400"
              }
            >
              {permissionLabel[permission]}
            </span>
            {permission !== "granted" && permission !== "unsupported" && (
              <Button
                type="button"
                onClick={handleRequestPermission}
                disabled={busy || permission === "denied"}
                variant="ghost"
                size="sm"
              >
                开启
              </Button>
            )}
          </div>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-neutral-500">通知静默</span>
          <Button
            type="button"
            onClick={handleToggleMute}
            disabled={busy}
            aria-pressed={muted}
            variant={muted ? "secondary" : "ghost"}
            size="sm"
            className={
              muted
                ? "rounded-full bg-neutral-700 px-3 py-1 text-xs text-white"
                : "rounded-full bg-neutral-300 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
            }
          >
            {muted ? "已静默" : "开启中"}
          </Button>
        </li>
      </ul>
    </section>
  );
}
