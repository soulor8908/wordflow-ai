#!/usr/bin/env python3
"""
从 /tmp/stardict.db (ECDICT 1.0.28, 340万词条) 生成 WordFlow 全量基础词库。

筛选标准（权威+全量，适合背单词App）：
- 有中文翻译 (translation 非空)
- 纯单词（无空格/连字符/点/斜杠，纯字母）
- 长度 2-20
- 有 COCA 词频 (frq > 0) —— 黄金集合 ~42000 词

产出：
- public/dict-data/{letter}/{prefix}.json  —— 按 前2字符切片，每片 <50KB（超出则细分到3字符）
- public/search-index.json           —— 扁平 [{word, frequency}]，按词频降序

字段映射 (ECDICT -> DictEntry)：
  word        -> word
  phonetic    -> phonetic
  translation -> translation
  definition  -> definition (英文释义)
  pos         -> pos
  tag         -> tags (空格分隔转数组；标准化为 zk/gk/cet4/cet6/kaoyan/toefl/ielts/gre)
  frq         -> frequency (COCA 词频；越小越常用，这里反转：frequency = max - frq，让常用词数值大)

注意：ECDICT 的 frq 是排名（1=最常用 the），为了和 WordFlow 现有约定一致
（frequency 越大越常用，用于星级展示），需要反转：frequency = max - frq。
"""
import json
import os
import sqlite3
import sys

DB_PATH = "/tmp/stardict.db"
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "/workspace/public"

SLICE_BUDGET = 50 * 1024  # 50KB

TAG_NORMALIZE = {
    "zk": "zk", "gk": "gk",
    "cet4": "cet4", "cet6": "cet6",
    "ky": "kaoyan", "kaoyan": "kaoyan",
    "toefl": "toefl", "ielts": "ielts", "gre": "gre",
}

FREQ_FLOOR = 50000


def normalize_tags(raw):
    if not raw:
        return None
    out = []
    for t in raw.split():
        n = TAG_NORMALIZE.get(t, t)
        if n not in out:
            out.append(n)
    return out if out else None


def build_entry(row):
    word, phonetic, definition, translation, pos, tag, frq, collins, oxford, exchange = row
    entry = {"word": word, "translation": translation}
    if phonetic:
        entry["phonetic"] = "/" + phonetic + "/" if not phonetic.startswith("/") else phonetic
    if pos:
        main = pos.split("/")[0].split(":")[0]
        if main:
            entry["pos"] = main + "."
    if definition:
        entry["definition"] = definition
    if frq and frq > 0:
        entry["frequency"] = FREQ_FLOOR - min(frq, FREQ_FLOOR)
    tags = normalize_tags(tag)
    if tags:
        entry["tags"] = tags
    return entry


def slice_key(word, granularity=2):
    w = word.lower()
    return w[:granularity] if len(w) >= granularity else w


def main():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: {DB_PATH} 不存在，请先下载 ECDICT", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT word, phonetic, definition, translation, pos, tag, frq, collins, oxford, exchange
        FROM stardict
        WHERE translation IS NOT NULL AND translation != ''
          AND word GLOB '[A-Za-z]*'
          AND word NOT LIKE '% %' AND word NOT LIKE '%-%'
          AND word NOT LIKE '%.%' AND word NOT LIKE '%/%'
          AND length(word) BETWEEN 2 AND 20
          AND frq IS NOT NULL AND frq > 0
        ORDER BY frq ASC
    """)
    rows = cur.fetchall()
    print(f"[gen-full-dict] 筛选出 {len(rows)} 条候选词")

    seen = set()
    entries = []
    for r in rows:
        word = r[0]
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        entries.append(build_entry(r))
    print(f"[gen-full-dict] 去重后 {len(entries)} 条")

    groups = {}
    for e in entries:
        k = slice_key(e["word"], 2)
        groups.setdefault(k, []).append(e)

    for k in groups:
        groups[k].sort(key=lambda x: x.get("frequency", 0), reverse=True)

    dict_root = os.path.join(OUT_DIR, "dict-data")
    import glob
    for old in glob.glob(os.path.join(dict_root, "*", "*.json")):
        os.remove(old)

    def write_bucket(key, bucket):
        """写切片。
        dict-loader 按 word 前 2 字符定位切片，所以所有同前缀词必须在同一文件。
        超 50KB 仅 warning（不阻塞构建；gzip 后实际传输小很多）。"""
        nonlocal slice_count
        c = json.dumps(bucket, ensure_ascii=False, separators=(",", ":"))
        letter = key[0]
        out_dir = os.path.join(dict_root, letter)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, f"{key}.json"), "w", encoding="utf-8") as f:
            f.write(c)
        slice_count += 1
        if len(c.encode("utf-8")) > SLICE_BUDGET:
            print(f"  warn: {key}.json {len(c.encode('utf-8'))/1024:.1f}KB ({len(bucket)} 词，gzip 后可接受)")

    slice_count = 0
    for k, bucket in groups.items():
        bucket.sort(key=lambda x: x.get("frequency", 0), reverse=True)
        write_bucket(k, bucket)
    print(f"[gen-full-dict] 写入 {slice_count} 个切片到 {dict_root}/")

    search_index = [
        {"word": e["word"], "frequency": e.get("frequency", 0)}
        for e in sorted(entries, key=lambda x: x.get("frequency", 0), reverse=True)
    ]
    idx_path = os.path.join(OUT_DIR, "search-index.json")
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(search_index, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(idx_path) / 1024
    print(f"[gen-full-dict] 写入 search-index.json（{len(search_index)} 词，{size_kb:.1f} KB）")

    conn.close()
    print("[gen-full-dict] 完成")


if __name__ == "__main__":
    main()
