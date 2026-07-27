/**
 * WordFlow Service Worker
 * 设计文档 §4.5：stale-while-revalidate 缓存 + Web Push + Periodic Background Sync
 *
 * SW 环境限制：无法 import 项目 TS 模块，doBackgroundCheck 内联原生 IndexedDB API
 * + 通知文案逻辑（与 lib/pwa/notification-message.ts 对齐，单一真相源在纯函数守护测试）。
 */
const CACHE_NAME = "wordflow-v2";
const PRECACHE_URLS = ["/", "/review", "/stats", "/manifest.json"];
const BACKGROUND_TAG = "wordflow-background-check";
const DB_NAME = "wordflow-db";
const STORE = "kv";

// ===== install：预缓存静态资源 + skipWaiting =====
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

// ===== activate：清理旧缓存 + clients.claim =====
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ===== fetch：stale-while-revalidate =====
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // /api/ 不缓存（离线时 AI 不可用但本地数据可读写）
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          // 仅缓存同源成功响应
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // 离线 fallback：导航请求回退到首页
          if (req.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("离线且无缓存", { status: 503 });
        });
      // 缓存命中 → 立即返回 + 后台更新；未命中 → 等 fetch
      return cached || fetchPromise;
    })
  );
});

// ===== push：弹"该复习了"提醒 =====
self.addEventListener("push", (event) => {
  let payload = { title: "该复习了", body: "点击开始复习", url: "/review" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // 非 JSON，用默认文案
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: "wordflow-review",
      icon: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

// ===== notificationclick：聚焦/打开应用 + 导航到 /review =====
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/review";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ===== periodicsync：后台检查 due 卡片 + 推送召回通知 =====
self.addEventListener("periodicsync", (event) => {
  if (event.tag !== BACKGROUND_TAG) return;
  event.waitUntil(doBackgroundCheck());
});

/**
 * 后台检查（设计文档 §4.5.3）：
 * 1. 用原生 IndexedDB API 查 card: 前缀卡片，统计 dueCount
 * 2. 查 log: 前缀记录，找最后学习日期
 * 3. 构造通知文案（3/7/14 天分级）
 * 4. 查 settings:notification-muted，未静默则推送
 */
async function doBackgroundCheck() {
  try {
    const { dueCount, daysSinceLastStudy, muted } = await queryDueAndLastStudy();
    if (muted) return; // 静默开关：不打扰

    const payload = buildNotificationMessage(dueCount, daysSinceLastStudy);
    if (!payload) return; // 无需打扰

    await self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: "wordflow-review",
      icon: "/icons/icon-192.png",
      data: { url: payload.url },
    });
  } catch (err) {
    // 后台检查失败不影响 SW 生命周期
    console.warn("[sw] doBackgroundCheck failed:", err);
  }
}

/** 用原生 IndexedDB API 查询 due 卡片数 + 最后学习日 + 静默开关 */
function queryDueAndLastStudy() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        resolve({ dueCount: 0, daysSinceLastStudy: 0, muted: false });
        return;
      }
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const records = getAll.result || [];
        const now = Date.now();
        let dueCount = 0;
        let lastStudyDate = null;
        let muted = false;

        for (const r of records) {
          const key = r.key;
          const value = r.value;
          if (typeof key !== "string") continue;
          // card: 前缀，due <= now
          if (key.startsWith("card:") && value && typeof value === "object") {
            const due = value.due;
            const dueMs = due instanceof Date ? due.getTime() : new Date(due).getTime();
            if (!isNaN(dueMs) && dueMs <= now) dueCount++;
          }
          // log: 前缀，记录最后学习日
          if (key.startsWith("log:") && value && typeof value === "object") {
            const date = value.date;
            if (typeof date === "string" && (!lastStudyDate || date > lastStudyDate)) {
              lastStudyDate = date;
            }
          }
          // settings:notification-muted
          if (key === "settings:notification-muted" && value === true) {
            muted = true;
          }
        }

        const daysSinceLastStudy = lastStudyDate
          ? Math.floor((now - new Date(lastStudyDate + "T00:00:00Z").getTime()) / (24 * 60 * 60 * 1000))
          : 365; // 从未学习视为很久
        resolve({ dueCount, daysSinceLastStudy, muted });
      };
      getAll.onerror = () => reject(getAll.error);
    };
  });
}

/**
 * 通知文案分级（对齐 lib/pwa/notification-message.ts）：
 * - daysSinceLastStudy >= 14 → "很久没背词了，词书在等你"
 * - >= 7 → "回来背词吧，复习队列在等你"
 * - >= 3 且有 due → "回来背词吧"
 * - < 3 且 dueCount > 0 → "今日有 N 词待复习"
 * - 否则 → null（不打扰）
 */
function buildNotificationMessage(dueCount, daysSinceLastStudy) {
  const URL = "/review";
  if (daysSinceLastStudy >= 14) {
    return {
      title: "很久没背词了，词书在等你",
      body: dueCount > 0 ? `还有 ${dueCount} 词待复习，别让它们沉睡` : "回来继续背词吧",
      url: URL,
    };
  }
  if (daysSinceLastStudy >= 7) {
    return {
      title: "回来背词吧，复习队列在等你",
      body: dueCount > 0 ? `今日有 ${dueCount} 词待复习` : "保持节奏，坚持就是胜利",
      url: URL,
    };
  }
  if (dueCount > 0) {
    return {
      title: `📚 今日有 ${dueCount} 词待复习`,
      body: `共 ${dueCount} 词待复习，点击开始`,
      url: URL,
    };
  }
  return null;
}
