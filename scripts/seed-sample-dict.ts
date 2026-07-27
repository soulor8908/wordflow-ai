#!/usr/bin/env tsx
/**
 * 小样本词典 seed 脚本（无 ECDICT.csv 时的本地开发兜底）
 *
 * 产出 public/dict/{a-z}/{prefix}.json 小样本切片，覆盖查词 UI 开发所需的高频词。
 * 真实数据由 scripts/compile-dict.ts 从 ECDICT 编译产出，会覆盖这些样本。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildSliceFiles,
} from "@/scripts/compile-dict-core";
import type { DictEntry } from "@/lib/dict/dict-loader";

const SAMPLE_ENTRIES: DictEntry[] = [
  {
    word: "abandon",
    phonetic: "/əˈbændən/",
    pos: "v.",
    translation: "vt. 放弃；抛弃；离弃",
    definition: "to leave completely and finally",
    frequency: 5000,
    tags: ["kaoyan", "cet4", "cet6"],
    root: "ab-（离开）+ -bandon（控制）→ 失去控制而离开",
    examples: [
      { en: "The crew abandoned the sinking ship.", zh: "船员们弃下沉没的船。" },
      { en: "He abandoned his plan to travel.", zh: "他放弃了旅行计划。" },
    ],
    synonyms: ["desert", "forsake", "give up"],
  },
  {
    word: "ability",
    phonetic: "/əˈbɪləti/",
    pos: "n.",
    translation: "n. 能力；才能；本领",
    definition: "the power or skill to do something",
    frequency: 4800,
    tags: ["cet4", "cet6"],
    examples: [
      { en: "She has the ability to learn quickly.", zh: "她有快速学习的能力。" },
    ],
    synonyms: ["capability", "skill", "competence"],
  },
  {
    word: "abound",
    phonetic: "/əˈbaʊnd/",
    pos: "v.",
    translation: "vi. 充满；大量存在",
    frequency: 800,
    tags: ["toefl"],
    examples: [
      { en: "Wild animals abound in this forest.", zh: "这片森林里野生动物很多。" },
    ],
  },
  {
    word: "about",
    phonetic: "/əˈbaʊt/",
    pos: "prep.",
    translation: "prep. 关于；大约  adv. 大约；周围",
    definition: "on the subject of; approximately",
    frequency: 9000,
    tags: ["cet4"],
  },
  {
    word: "abroad",
    phonetic: "/əˈbrɔːd/",
    pos: "adv.",
    translation: "adv. 到国外；在国外",
    frequency: 1200,
    tags: ["cet4", "cet6"],
    synonyms: ["overseas", "overseas"],
  },
  {
    word: "accept",
    phonetic: "/əkˈsept/",
    pos: "v.",
    translation: "vt. 接受；同意；认可",
    definition: "to take something that someone offers",
    frequency: 7000,
    tags: ["cet4", "cet6"],
    examples: [
      { en: "I accept your apology.", zh: "我接受你的道歉。" },
    ],
    synonyms: ["receive", "take"],
  },
  {
    word: "access",
    phonetic: "/ˈækses/",
    pos: "n.",
    translation: "n. 接近；入口；访问权限  vt. 访问",
    definition: "the right or opportunity to use or look at something",
    frequency: 6500,
    tags: ["cet4", "cet6", "kaoyan"],
    examples: [
      { en: "Students have access to the library.", zh: "学生可以使用图书馆。" },
    ],
    synonyms: ["entry", "admission"],
  },
  {
    word: "adapt",
    phonetic: "/əˈdæpt/",
    pos: "v.",
    translation: "vt. 使适应；改编  vi. 适应",
    definition: "to change something to fit a new situation",
    frequency: 1500,
    tags: ["cet4", "cet6", "toefl"],
    root: "ad-（向）+ -apt（适合）→ 使适合",
    examples: [
      { en: "She adapted to the new climate.", zh: "她适应了新气候。" },
    ],
    synonyms: ["adjust", "accommodate"],
  },
  {
    word: "book",
    phonetic: "/bʊk/",
    pos: "n.",
    translation: "n. 书；书籍  vt. 预订",
    frequency: 8000,
    tags: ["cet4"],
    examples: [
      { en: "I'm reading a good book.", zh: "我在读一本好书。" },
    ],
  },
  {
    word: "build",
    phonetic: "/bɪld/",
    pos: "v.",
    translation: "vt. 建造；建立  vi. 增长",
    frequency: 7500,
    tags: ["cet4"],
  },
];

const outDir = resolve(process.argv[2] ?? "public");
const files = buildSliceFiles(SAMPLE_ENTRIES);
for (const file of files) {
  const absPath = join(outDir, file.path);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, file.content, "utf8");
}

// 额外产出扁平 search-index.json（{word, frequency}[]），供查词页构建前缀索引
const searchIndex = SAMPLE_ENTRIES.map((e) => ({
  word: e.word,
  frequency: e.frequency ?? 0,
}));
writeFileSync(join(outDir, "search-index.json"), JSON.stringify(searchIndex), "utf8");

console.log(`[seed-sample-dict] 写入 ${files.length} 个样本切片到 ${outDir}/dict/`);
console.log(`[seed-sample-dict] 写入 search-index.json（${searchIndex.length} 词）`);
console.log(
  `[seed-sample-dict] 词条：${SAMPLE_ENTRIES.map((e) => e.word).join(", ")}`
);
