// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import {
  getNotificationMuted,
  setNotificationMuted,
} from "@/lib/pwa/notification-settings";
import { resetDbForTest, getItem } from "@/lib/storage/db";

beforeEach(async () => {
  await resetDbForTest();
});

describe("getNotificationMuted", () => {
  test("未设置时默认 false（不静默）", async () => {
    expect(await getNotificationMuted()).toBe(false);
  });

  test("设置为 true 后返回 true", async () => {
    await setNotificationMuted(true);
    expect(await getNotificationMuted()).toBe(true);
  });

  test("设置为 false 后返回 false", async () => {
    await setNotificationMuted(true);
    await setNotificationMuted(false);
    expect(await getNotificationMuted()).toBe(false);
  });
});

describe("setNotificationMuted", () => {
  test("写入 settings:notification-muted = true", async () => {
    await setNotificationMuted(true);
    const stored = await getItem<boolean>("settings:notification-muted");
    expect(stored).toBe(true);
  });

  test("写入 settings:notification-muted = false", async () => {
    await setNotificationMuted(false);
    const stored = await getItem<boolean>("settings:notification-muted");
    expect(stored).toBe(false);
  });

  test("覆盖写入：true → false", async () => {
    await setNotificationMuted(true);
    await setNotificationMuted(false);
    const stored = await getItem<boolean>("settings:notification-muted");
    expect(stored).toBe(false);
  });
});
