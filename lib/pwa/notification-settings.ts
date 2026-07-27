/**
 * 通知静默开关（设计文档 §3.4 + §4.5.3）
 *
 * settings:notification-muted：true=静默（SW doBackgroundCheck 读此值，静默时不弹通知）
 * 默认 false（不静默，允许推送召回）。
 *
 * 注：此 key 属 settings 前缀，按设计 §4.3 同步安全红线，settings 敏感项仅本地不同步；
 *     notification-muted 非敏感（无 apiKey），但为简化同步过滤逻辑统一归 settings 前缀不参与同步。
 */
import { getItem, setItem } from "@/lib/storage/db";

const KEY = "settings:notification-muted";

export async function getNotificationMuted(): Promise<boolean> {
  const v = await getItem<boolean>(KEY);
  return v === true;
}

export async function setNotificationMuted(muted: boolean): Promise<void> {
  await setItem(KEY, muted);
}
