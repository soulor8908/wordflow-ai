/**
 * 守护测试：禁止原生表单元素（设计文档 §8.1 + §8.2）
 *
 * 扫描 components/ 和 app/ 下 .tsx（components/ui/ 除外），
 * 发现原生 <button>/<input>/<select>/<textarea> 即失败。
 *
 * 统一组件库 @/components/ui 包装原生元素，提供设计令牌 + 暗色配对。
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, sep } from "node:path";

const ROOTS = ["components", "app"];
const EXCLUDE_DIRS = ["components/ui", "node_modules", ".next"];
// 用 \b（词边界）而非 [\s>]：前者能命中行尾多行 JSX（如单独一行的 `<button`），
// 同时避免误匹配 `<buttons>` 这类自定义元素；消除"假绿"。
const NATIVE_PATTERNS = [
  /<button\b/,
  /<input\b/,
  /<select\b/,
  /<textarea\b/,
];

/** 将路径分隔符归一化为 `/`，使排除规则在 Windows（\\）与 POSIX（/）下行为一致 */
function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function collectTsxFiles(dir: string, base: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relPath = toPosix(join(base, entry));
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // 排除 ui 组件目录（包装原生元素的地方）。
      // 用 `=== ex || startsWith(ex + "/")` 精确匹配目录边界，
      // 避免 `components/ui-foo` 被误排除（假绿）。
      if (EXCLUDE_DIRS.some((ex) => relPath === ex || relPath.startsWith(ex + "/"))) continue;
      files.push(...collectTsxFiles(fullPath, relPath));
    } else if (extname(entry) === ".tsx") {
      files.push(fullPath);
    }
  }
  return files;
}

function findViolations(): { file: string; line: number; match: string }[] {
  const violations: { file: string; line: number; match: string }[] = [];
  for (const root of ROOTS) {
    const files = collectTsxFiles(root, root);
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        for (const pattern of NATIVE_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file,
              line: idx + 1,
              match: line.trim().slice(0, 80),
            });
          }
        }
      });
    }
  }
  return violations;
}

describe("no-native-form-elements guard（设计文档 §8.1）", () => {
  test("components/ 和 app/ 下 .tsx 不含原生 <button>/<input>/<select>/<textarea>（components/ui/ 除外）", () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  ✗ ${v.file}:${v.line} — ${v.match}`)
        .join("\n");
      throw new Error(
        `发现 ${violations.length} 处原生表单元素，请改用 @/components/ui 组件：\n${detail}`
      );
    }
    expect(violations).toHaveLength(0);
  });
});
