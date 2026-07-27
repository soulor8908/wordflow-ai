import { describe, test, expect } from "vitest";
import {
  promptFingerprint,
  getPrompt,
  PROMPTS,
  CONTENT_QUALITY_CHARTER,
  buildSystemPrompt,
  PROMPT_VERSION_HASHES,
} from "@/lib/ai/prompts";

describe("promptFingerprint", () => {
  test("returns id:version:hash format", () => {
    const fp = promptFingerprint("word_sentence", "v1");
    expect(fp).toMatch(/^word_sentence:v1:[a-f0-9]{8}$/);
  });

  test("same id+version produces same fingerprint (deterministic)", () => {
    const a = promptFingerprint("word_sentence", "v1");
    const b = promptFingerprint("word_sentence", "v1");
    expect(a).toBe(b);
  });

  test("different versions produce different fingerprints", () => {
    const v1 = promptFingerprint("word_sentence", "v1");
    const v2 = promptFingerprint("word_sentence", "v2");
    expect(v1).not.toBe(v2);
  });

  test("different ids produce different fingerprints", () => {
    const a = promptFingerprint("word_sentence", "v1");
    const b = promptFingerprint("word_root_mnemonic", "v1");
    expect(a).not.toBe(b);
  });
});

describe("CONTENT_QUALITY_CHARTER", () => {
  test("contains 语境真实 constraint", () => {
    expect(CONTENT_QUALITY_CHARTER).toContain("语境真实");
  });

  test("contains 词频适配 constraint", () => {
    expect(CONTENT_QUALITY_CHARTER).toContain("词频适配");
  });

  test("contains 不含敏感词 constraint", () => {
    expect(CONTENT_QUALITY_CHARTER).toContain("不含敏感词");
  });
});

describe("PROMPTS registry", () => {
  test("word_sentence prompt has id, version, system, changelog", () => {
    const p = PROMPTS.word_sentence;
    expect(p.id).toBe("word_sentence");
    expect(p.version).toMatch(/^v\d+$/);
    expect(p.system).toBeTruthy();
    expect(p.changelog).toBeTruthy();
  });

  test("word_root_mnemonic prompt exists", () => {
    expect(PROMPTS.word_root_mnemonic).toBeDefined();
    expect(PROMPTS.word_root_mnemonic.id).toBe("word_root_mnemonic");
  });

  test("sentence_correction (V4 造句批改) prompt exists", () => {
    expect(PROMPTS.sentence_correction).toBeDefined();
    expect(PROMPTS.sentence_correction.id).toBe("sentence_correction");
  });
});

describe("getPrompt", () => {
  test("returns prompt by id", () => {
    const p = getPrompt("word_sentence");
    expect(p).toBeDefined();
    expect(p?.id).toBe("word_sentence");
  });

  test("returns undefined for unknown id", () => {
    const p = getPrompt("nonexistent");
    expect(p).toBeUndefined();
  });
});

describe("buildSystemPrompt", () => {
  test("injects Content Quality Charter into answer-producing prompts", () => {
    const system = buildSystemPrompt("word_sentence");
    expect(system).toContain(CONTENT_QUALITY_CHARTER);
  });

  test("includes the prompt's own system text", () => {
    const system = buildSystemPrompt("word_sentence");
    expect(system).toContain(PROMPTS.word_sentence.system);
  });
});

describe("PROMPT_VERSION_HASHES (snapshot test for forced version bump)", () => {
  test("every prompt has a frozen version:hash entry", () => {
    for (const [id, prompt] of Object.entries(PROMPTS)) {
      expect(PROMPT_VERSION_HASHES[id as keyof typeof PROMPT_VERSION_HASHES]).toBe(
        `${prompt.version}:${hashOf(prompt.system)}`
      );
    }
  });

  test("changing prompt content without bumping version would break this snapshot", () => {
    // This test enforces: if you edit prompt.system, you MUST bump version
    // and update PROMPT_VERSION_HASHES. Snapshot regression guard.
    for (const [id, prompt] of Object.entries(PROMPTS)) {
      const key = id as keyof typeof PROMPT_VERSION_HASHES;
      const expected = `${prompt.version}:${hashOf(prompt.system)}`;
      expect(PROMPT_VERSION_HASHES[key]).toBe(expected);
    }
  });
});

// Helper: replicate the hash function used in PROMPT_VERSION_HASHES
function hashOf(content: string): string {
  // Simple FNV-1a 32-bit → 8 hex chars (must match implementation)
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
