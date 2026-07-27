"use client";

/**
 * 词条页（设计文档 §3.2 A：右上角"+收藏"按钮 + 信息层级）
 *
 * 信息层级：音标+发音 → 核心释义 → 词频/考纲标签 → 词根词缀 → 例句 → 同近义词
 * 收藏按钮：点击创建 FSRS 卡片入队，文案切换为"已在队列，明天复习"
 */
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { findEntry, type DictEntry } from "@/lib/dict/dict-loader";
import {
  favoriteWord,
  isFavorited,
  unfavoriteWord,
} from "@/lib/review/favorite";
import { Button } from "@/components/ui/button";

export default function WordPage({
  params,
}: {
  params: Promise<{ word: string }>;
}) {
  const { word: rawWord } = use(params);
  const word = decodeURIComponent(rawWord);

  const [entry, setEntry] = useState<DictEntry | null | undefined>(undefined);
  const [favorited, setFavorited] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    findEntry(word)
      .then((e) => {
        if (!cancelled) setEntry(e ?? null);
      })
      .catch(() => {
        if (!cancelled) setEntry(null);
      });
    isFavorited(word).then((f) => {
      if (!cancelled) setFavorited(f);
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  async function handleToggleFavorite() {
    if (toggling) return;
    setToggling(true);
    try {
      if (favorited) {
        await unfavoriteWord(word);
        setFavorited(false);
      } else {
        await favoriteWord(word);
        setFavorited(true);
      }
    } finally {
      setToggling(false);
    }
  }

  if (entry === undefined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4">
        <p className="text-sm text-neutral-400">加载中…</p>
      </main>
    );
  }

  if (entry === null) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 返回查词
        </Link>
        <p className="text-neutral-500">
          未找到单词 <span className="font-mono">{word}</span>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 返回查词
        </Link>
        <Button
          type="button"
          onClick={handleToggleFavorite}
          disabled={toggling}
          aria-pressed={favorited}
          variant={favorited ? "secondary" : "primary"}
          size="md"
          className={
            favorited
              ? "border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
              : ""
          }
        >
          {favorited ? "✓ 已在队列，明天复习" : "＋ 收藏入队"}
        </Button>
      </div>

      {/* 单词 + 音标 + 发音 */}
      <section className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">{entry.word}</h1>
        {entry.phonetic && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg text-neutral-500">
              {entry.phonetic}
            </span>
            {typeof window !== "undefined" && "speechSynthesis" in window && (
              <Button
                type="button"
                onClick={() => {
                  const u = new SpeechSynthesisUtterance(entry.word);
                  u.lang = "en-US";
                  window.speechSynthesis.speak(u);
                }}
                variant="secondary"
                size="sm"
                aria-label={`发音 ${entry.word}`}
              >
                🔊 发音
              </Button>
            )}
          </div>
        )}
      </section>

      {/* 核心释义 */}
      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase text-neutral-400">
          释义
        </h2>
        <p className="whitespace-pre-line text-base leading-relaxed">
          {entry.translation}
        </p>
        {entry.definition && (
          <p className="mt-2 text-sm italic text-neutral-500">
            {entry.definition}
          </p>
        )}
      </section>

      {/* 词频/考纲标签 */}
      {(entry.frequency || entry.tags?.length) && (
        <section className="flex flex-wrap items-center gap-2">
          {entry.frequency && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              词频 {entry.frequency}
            </span>
          )}
          {entry.tags?.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {tag}
            </span>
          ))}
        </section>
      )}

      {/* 词根词缀助记 */}
      {entry.root && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase text-neutral-400">
            词根助记
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {entry.root}
          </p>
        </section>
      )}

      {/* 例句 */}
      {entry.examples && entry.examples.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-400">
            例句
          </h2>
          <ul className="flex flex-col gap-3">
            {entry.examples.map((ex, i) => (
              <li key={i} className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
                <p className="text-sm">{ex.en}</p>
                <p className="mt-1 text-xs text-neutral-500">{ex.zh}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 同近义词 */}
      {entry.synonyms && entry.synonyms.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-400">
            同近义词
          </h2>
          <div className="flex flex-wrap gap-2">
            {entry.synonyms.map((syn) => (
              <Link
                key={syn}
                href={`/word/${encodeURIComponent(syn)}`}
                className="rounded border border-neutral-300 px-2 py-1 text-sm font-mono hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                {syn}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
