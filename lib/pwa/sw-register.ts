/**
 * Service Worker 注册 + Periodic Sync 注册 + Web Push 订阅（设计文档 §4.5）
 *
 * 渐进增强：periodicsync 需 Chrome 81+ / Edge 81+，不支持时静默降级。
 * Web Push 订阅需通知权限 + PushManager，不支持时静默跳过。
 */
const SW_PATH = "/sw.js";
const BACKGROUND_TAG = "wordflow-background-check";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, {
      scope: "/",
    });
    return reg;
  } catch (err) {
    console.warn("[pwa] SW 注册失败:", err);
    return null;
  }
}

/** 注册 Periodic Background Sync（不支持时返回 false，静默降级） */
export async function registerPeriodicSync(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const periodicSync = (reg as ServiceWorkerRegistration & {
      periodicSync?: {
        register: (tag: string, options?: { minInterval?: number }) => Promise<void>;
      };
    }).periodicSync;
    if (!periodicSync) return false;
    await periodicSync.register(BACKGROUND_TAG, {
      minInterval: 12 * 60 * 60 * 1000, // 12 小时
    });
    return true;
  } catch (err) {
    console.warn("[pwa] periodicSync 注册失败:", err);
    return false;
  }
}

/** 请求通知权限（granted/denied/prompt），返回最终状态 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}

/** 订阅 Web Push（返回订阅 endpoint 或 null） */
export async function subscribePush(
  reg: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  if (!("PushManager" in window)) return null;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    // MVP 阶段无 VAPID 应用服务器密钥（需后端配置），仅做客户端订阅占位；
    // M2 接入推送服务端时补充 applicationServerKey。
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
    });
    return sub;
  } catch (err) {
    console.warn("[pwa] Push 订阅失败:", err);
    return null;
  }
}
