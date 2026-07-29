"use client";

/**
 * 发音 React Hook（设计文档 §3.3）
 *
 * 提供 speaking 状态用于 UI 反馈（按钮高亮）。
 * 用计数器追踪并发调用，避免防抖导致的 premature 状态重置。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  speak as speakPronunciation,
  cancelSpeech,
  isPronunciationSupported,
  warmUpAudioChannel,
  type PronunciationOptions,
} from "@/lib/audio/pronunciation";

export interface UsePronunciationResult {
  speak: (word: string, options?: PronunciationOptions) => Promise<void>;
  cancel: () => void;
  speaking: boolean;
  supported: boolean;
}

export function usePronunciation(): UsePronunciationResult {
  const [speaking, setSpeaking] = useState(false);
  // SSR 阶段为 false，客户端 mount 后再检测，避免 hydration mismatch
  const [supported, setSupported] = useState(false);
  const [, startTransition] = useTransition();
  const activeCountRef = useRef(0);

  // 客户端 mount 后检测支持性（用 startTransition 避免同步 setState 触发级联渲染）
  useEffect(() => {
    startTransition(() => {
      setSupported(isPronunciationSupported());
    });
    // 预热 audio 通道（iOS Safari 必需：首次交互播静音解锁）
    warmUpAudioChannel();
  }, [startTransition]);

  // 卸载时清理：取消发音
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  const speak = useCallback(
    async (word: string, options?: PronunciationOptions) => {
      if (!word) return;

      activeCountRef.current += 1;
      if (activeCountRef.current === 1) {
        setSpeaking(true);
      }

      try {
        await speakPronunciation(word, options);
      } finally {
        activeCountRef.current -= 1;
        if (activeCountRef.current <= 0) {
          activeCountRef.current = 0;
          setSpeaking(false);
        }
      }
    },
    []
  );

  const cancel = useCallback(() => {
    cancelSpeech();
    activeCountRef.current = 0;
    setSpeaking(false);
  }, []);

  return { speak, cancel, speaking, supported };
}
