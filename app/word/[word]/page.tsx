"use client";

/**
 * 词条页（设计文档 §3.2 A：右上角"+收藏"按钮 + 信息层级）
 *
 * 信息层级：音标+发音 → 核心释义 → 词频/考纲标签 → 词根词缀 → 例句 → 联想记忆
 *
 * 联想记忆区（设计文档 §3.2 联想学习）：
 * - 静态部分（词典数据，零延迟、离线可用）：同近义词 / 反义词 / 常见搭配 / 词族派生
 * - 动态部分（AI 生成，覆盖长尾）：点击"问 AI 深入联想"按钮 → 全局 AI 助手预填 prompt
 *   通过 window.dispatchEvent 触发，避免在词条页重复实现 AI 调用逻辑。
 *
 * 收藏按钮：点击创建 FSRS 卡片入队，文案切换为"已在队列，明天复习"
 */
import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { DictEntry } from "@/lib/dict/dict-loader";
import { findEntryWithUserLib } from "@/lib/dict/user-words";
import {
  favoriteWord,
  isFavorited,
  unfavoriteWord,
} from "@/lib/review/favorite";
import { onFavoriteAdded } from "@/lib/gamification/hooks";
import { countByPrefix } from "@/lib/storage/db";
import { loadSearchHistory } from "@/lib/search/search-history";
import { useGamification } from "@/components/gamification/gamification-provider";
import { Button } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  VolumeIcon,
} from "@/components/ui/icons";
import { usePronunciation } from "@/lib/audio/use-pronunciation";

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
  // 新手引导：仅在用户从未收藏过任何词时显示"点右上角收藏"横幅
  const [hasAnyFavorited, setHasAnyFavorited] = useState<boolean | null>(null);
  const { speak, speaking } = usePronunciation();
  const gamification = useGamification();

  useEffect(() => {
    let cancelled = false;
    findEntryWithUserLib(word)
      .then((e) => {
        if (!cancelled) setEntry(e ?? null);
      })
      .catch(() => {
        if (!cancelled) setEntry(null);
      });
    isFavorited(word).then((f) => {
      if (!cancelled) setFavorited(f);
    });
    // 检查用户是否已收藏过任意词（决定是否展示新手引导横幅）
    countByPrefix("card:")
      .then((n) => {
        if (!cancelled) setHasAnyFavorited(n > 0);
      })
      .catch(() => {
        if (!cancelled) setHasAnyFavorited(false);
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
        // 首次收藏后立即隐藏新手引导横幅
        setHasAnyFavorited(true);
        // 游戏化副作用：+2 XP + "查词并收藏"任务 + 积累/探索类徽章
        // 失败静默，不影响收藏主流程
        const uniqueSearchCount = new Set(
          loadSearchHistory().map((w) => w.toLowerCase())
        ).size;
        onFavoriteAdded({ uniqueSearchCount })
          .then((g) =>
            gamification.notifyFavorite({
              xpGained: g.xpGained,
              questBonusXp: g.questBonusXp,
              newBadges: g.newBadges,
            })
          )
          .catch(() => {});
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
          <ChevronLeftIcon className="h-4 w-4 inline" /> 返回查词
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
          <ChevronLeftIcon className="h-4 w-4 inline" /> 返回查词
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
          {favorited ? (
            <span>✓ 已在队列，明天复习</span>
          ) : (
            <>
              <PlusIcon title="收藏" className="h-4 w-4" />
              <span>收藏入队</span>
            </>
          )}
        </Button>
      </div>

      {/* 新手引导横幅：仅在用户从未收藏过任何词时显示，首次收藏后立即消失 */}
      {hasAnyFavorited === false && !favorited && (
        <div
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
        >
          <span aria-hidden className="mr-1">👆</span>
          点右上角「收藏入队」，明天开始复习这个单词
        </div>
      )}

      {/* 单词 + 音标 + 发音 */}
      <section className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">{entry.word}</h1>
        {entry.phonetic && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg text-neutral-500">
              {entry.phonetic}
            </span>
            <Button
              type="button"
              onClick={() => speak(entry.word)}
              variant={speaking ? "primary" : "secondary"}
              size="sm"
              aria-label={`发音 ${entry.word}`}
            >
              <VolumeIcon title="发音" className={`h-4 w-4 ${speaking ? "animate-pulse text-blue-500" : ""}`} />
              <span>发音</span>
            </Button>
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

      {/* 联想记忆区：同近义词 / 反义词 / 常见搭配 / 词族 */}
      {((entry.synonyms?.length ?? 0) > 0 ||
        (entry.antonyms?.length ?? 0) > 0 ||
        (entry.collocations?.length ?? 0) > 0 ||
        (entry.wordFamily?.length ?? 0) > 0) && (
        <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <h2 className="mb-3 text-xs font-semibold uppercase text-neutral-400">
            联想记忆
          </h2>
          <div className="flex flex-col gap-4">
            {/* 同近义词 */}
            {entry.synonyms && entry.synonyms.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-neutral-500">同近义词</p>
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
              </div>
            )}
            {/* 反义词：对比记忆 */}
            {entry.antonyms && entry.antonyms.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-neutral-500">反义词</p>
                <div className="flex flex-wrap gap-2">
                  {entry.antonyms.map((ant) => (
                    <Link
                      key={ant}
                      href={`/word/${encodeURIComponent(ant)}`}
                      className="rounded border border-red-200 px-2 py-1 text-sm font-mono text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      {ant}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* 常见搭配 */}
            {entry.collocations && entry.collocations.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-neutral-500">常见搭配</p>
                <ul className="flex flex-col gap-1.5">
                  {entry.collocations.map((col, i) => (
                    <li
                      key={i}
                      className="rounded bg-neutral-50 px-3 py-1.5 text-sm dark:bg-neutral-900"
                    >
                      <span className="font-mono">{col.en}</span>
                      {col.zh && (
                        <span className="ml-2 text-xs text-neutral-500">
                          {col.zh}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* 词族派生 */}
            {entry.wordFamily && entry.wordFamily.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-neutral-500">词族派生</p>
                <div className="flex flex-wrap gap-2">
                  {entry.wordFamily.map((wf) => (
                    <Link
                      key={wf}
                      href={`/word/${encodeURIComponent(wf)}`}
                      className="rounded border border-blue-200 px-2 py-1 text-sm font-mono text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950"
                    >
                      {wf}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI 深入联想：交给 AI 聊天动态生成更深入的记忆线索 */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              const prompt = `请帮我深入联想记忆单词「${entry.word}」：\n1. 词根词缀拆解与同源词\n2. 同近义词辨析（语义/语境差异）\n3. 反义词对比\n4. 3 个高频搭配 + 例句\n5. 词族派生（名词/动词/形容词/副词）\n6. 一个生动的记忆故事或画面`;
              window.dispatchEvent(
                new CustomEvent("wordflow:ask-ai", { detail: { prompt } })
              );
            }}
          >
            问 AI 深入联想 <ChevronRightIcon className="h-4 w-4 inline" />
          </Button>
        </section>
      )}

      {/* 当词典无联想数据时，仍提供 AI 入口（避免数据缺失变成死路） */}
      {((entry.synonyms?.length ?? 0) === 0 &&
        (entry.antonyms?.length ?? 0) === 0 &&
        (entry.collocations?.length ?? 0) === 0 &&
        (entry.wordFamily?.length ?? 0) === 0 &&
        !entry.root) && (
        <section className="rounded-lg border border-dashed border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <p className="mb-2 text-sm text-neutral-500">
            词典暂无联想记忆数据
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              const prompt = `请帮我深入联想记忆单词「${entry.word}」：\n1. 词根词缀拆解与同源词\n2. 同近义词辨析（语义/语境差异）\n3. 反义词对比\n4. 3 个高频搭配 + 例句\n5. 词族派生（名词/动词/形容词/副词）\n6. 一个生动的记忆故事或画面`;
              window.dispatchEvent(
                new CustomEvent("wordflow:ask-ai", { detail: { prompt } })
              );
            }}
          >
            问 AI 生成联想记忆 <ChevronRightIcon className="h-4 w-4 inline" />
          </Button>
        </section>
      )}
    </main>
  );
}
