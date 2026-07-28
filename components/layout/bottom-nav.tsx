"use client";

/**
 * 底部导航栏（设计文档 §3.1：全局导航）
 *
 * 4 个 tab：查词 / 复习 / 词库 / 我的
 * 移动端固定底部，桌面端也保持底部（统一交互）
 * 复习 tab 显示待复习数量徽标
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { countDueCards } from "@/lib/storage/db";
import { BookIcon, BooksIcon, SearchIcon, UserIcon } from "@/components/ui/icons";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  match: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "查词",
    icon: <SearchIcon className="h-5 w-5" />,
    match: (p) => p === "/" || p.startsWith("/word/"),
  },
  {
    href: "/review",
    label: "复习",
    icon: <BooksIcon className="h-5 w-5" />,
    match: (p) => p.startsWith("/review"),
  },
  {
    href: "/books",
    label: "词库",
    icon: <BookIcon className="h-5 w-5" />,
    match: (p) => p.startsWith("/books"),
  },
  {
    href: "/me",
    label: "我的",
    icon: <UserIcon className="h-5 w-5" />,
    match: (p) => p.startsWith("/me") || p.startsWith("/stats"),
  },
];

export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const update = () =>
      countDueCards(new Date().toISOString())
        .then((n) => {
          if (!cancelled) setDueCount(n);
        })
        .catch(() => {
          if (!cancelled) setDueCount(0);
        });
    update();
    // 每 60s 刷新一次（不监听 storage 事件，保持简单）
    const timer = setInterval(update, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
      aria-label="主导航"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-2 py-1">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
              >
                <span className="leading-none">{item.icon}</span>
                <span>{item.label}</span>
                {/* 复习 tab 待复习数量徽标 */}
                {item.href === "/review" && dueCount > 0 && (
                  <span
                    className="absolute right-1 top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
                    aria-label={`${dueCount} 词待复习`}
                  >
                    {dueCount > 99 ? "99+" : dueCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
