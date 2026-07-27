export interface AuditResult {
  rule: string;
  passed: boolean;
  errors: string[];
}

/** G1: 词书引用的词条在词典切片中存在（无悬空引用） */
export function auditG1(bookWords: string[], dictWords: Set<string>): AuditResult {
  const errors: string[] = [];
  for (const word of bookWords) {
    if (!dictWords.has(word)) {
      errors.push(`G1: word '${word}' not found in dictionary`);
    }
  }
  return { rule: "G1", passed: errors.length === 0, errors };
}

/** G2: 释义完整性（核心释义非空、音标非空） */
export function auditG2(
  entries: { word: string; phonetic?: string; translation?: string }[]
): AuditResult {
  const errors: string[] = [];
  for (const entry of entries) {
    if (!entry.phonetic) {
      errors.push(`G2: '${entry.word}' missing phonetic`);
    }
    if (!entry.translation) {
      errors.push(`G2: '${entry.word}' missing translation`);
    }
  }
  return { rule: "G2", passed: errors.length === 0, errors };
}

/** G3: 词频标签与 COCA 数据一致 */
export function auditG3(
  bookWords: { word: string; frequency?: number }[],
  coca: Map<string, number>
): AuditResult {
  const errors: string[] = [];
  for (const { word, frequency } of bookWords) {
    if (frequency !== undefined) {
      const cocaFreq = coca.get(word);
      if (cocaFreq !== undefined && cocaFreq !== frequency) {
        errors.push(
          `G3: '${word}' frequency mismatch (book: ${frequency}, COCA: ${cocaFreq})`
        );
      }
    }
  }
  return { rule: "G3", passed: errors.length === 0, errors };
}

/** G4: 同近义词反向链接闭环（A 的同义词列表含 B → B 的列表含 A） */
export function auditG4(synonyms: Map<string, Set<string>>): AuditResult {
  const errors: string[] = [];
  for (const [word, syns] of synonyms) {
    for (const syn of syns) {
      const reverse = synonyms.get(syn);
      if (!reverse || !reverse.has(word)) {
        errors.push(`G4: '${word}' -> '${syn}' reverse link missing`);
      }
    }
  }
  return { rule: "G4", passed: errors.length === 0, errors };
}

/** G5: 词书无重复词条 */
export function auditG5(words: string[]): AuditResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    if (seen.has(word)) {
      errors.push(`G5: duplicate word '${word}'`);
    }
    seen.add(word);
  }
  return { rule: "G5", passed: errors.length === 0, errors };
}

/** G6: 自定义词书导入匹配率 ≥ 阈值（默认 80%） */
export function auditG6(
  bookWords: string[],
  dictWords: Set<string>,
  threshold = 0.8
): AuditResult {
  const errors: string[] = [];
  if (bookWords.length === 0) {
    return { rule: "G6", passed: false, errors: ["G6: empty book"] };
  }
  const matched = bookWords.filter((w) => dictWords.has(w)).length;
  const rate = matched / bookWords.length;
  if (rate < threshold) {
    errors.push(
      `G6: match rate ${(rate * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(1)}%`
    );
  }
  return { rule: "G6", passed: errors.length === 0, errors };
}

/** G7: 语义反查向量索引覆盖率（高频 2 万词 100% 覆盖） */
export function auditG7(topWords: string[], indexedWords: Set<string>): AuditResult {
  const errors: string[] = [];
  for (const word of topWords) {
    if (!indexedWords.has(word)) {
      errors.push(`G7: top word '${word}' not in semantic index`);
    }
  }
  return { rule: "G7", passed: errors.length === 0, errors };
}
