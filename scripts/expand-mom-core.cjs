#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 一次性：扩展「宝妈亲子英语」词书（mom-core）。
 *
 * 基于人教版 PEP 三年级起点 + 幼儿园英语启蒙 + 小学 1-6 年级 20 大主题词汇调研，
 * 整理出"宝妈教小孩幼儿园和小学英语必会单词"清单，插入到 mom-core 词书最上方
 * （chunk-000.json 数组开头），让宝妈优先学到这些核心词。
 *
 * 同时：
 * - 重新分块（chunkSize=100）
 * - 更新 mom-core/index.json 与 book-data/index.json 的 wordCount / chunkCount
 * - 同步追加新词到 dict-data/{letter}/{prefix}.json 切片（DictEntry 格式）
 * - 重建 search-index.json
 *
 * 与现有 207 词严格去重（小写比较）。运行后该脚本可删除。
 */
const fs = require("fs");
const path = require("path");

const publicDir = path.join(process.cwd(), "public");
const bookDir = path.join(publicDir, "book-data", "mom-core");
const dictRoot = path.join(publicDir, "dict-data");

// ───────────────────────── 新词清单（按主题，去重于现有 207 词）─────────────────────────
const NEW_WORDS = [
  // 1. 问候与礼貌
  { word: "hello", pos: "interj.", translation: "你好", phonetic: "həˈləʊ" },
  { word: "hi", pos: "interj.", translation: "嗨；你好", phonetic: "haɪ" },
  { word: "goodbye", pos: "interj.", translation: "再见", phonetic: "ˌɡʊdˈbaɪ" },
  { word: "bye", pos: "interj.", translation: "再见", phonetic: "baɪ" },
  { word: "please", pos: "int.", translation: "请", phonetic: "pliːz" },
  { word: "thank", pos: "v.", translation: "感谢", phonetic: "θæŋk" },
  { word: "thanks", pos: "n.", translation: "谢谢", phonetic: "θæŋks" },
  { word: "sorry", pos: "a.", translation: "对不起的", phonetic: "ˈsɒri" },
  { word: "welcome", pos: "interj.", translation: "欢迎", phonetic: "ˈwelkəm" },
  { word: "yes", pos: "ad.", translation: "是的", phonetic: "jes" },
  { word: "no", pos: "ad.", translation: "不", phonetic: "nəʊ" },
  { word: "OK", pos: "a.", translation: "好的", phonetic: "ˌəʊˈkeɪ" },
  { word: "morning", pos: "n.", translation: "早晨", phonetic: "ˈmɔːnɪŋ" },
  { word: "afternoon", pos: "n.", translation: "下午", phonetic: "ˌɑːftəˈnuːn" },
  { word: "night", pos: "n.", translation: "夜晚", phonetic: "naɪt" },

  // 2. 代词
  { word: "I", pos: "pron.", translation: "我", phonetic: "aɪ" },
  { word: "you", pos: "pron.", translation: "你；你们", phonetic: "juː" },
  { word: "he", pos: "pron.", translation: "他", phonetic: "hiː" },
  { word: "she", pos: "pron.", translation: "她", phonetic: "ʃiː" },
  { word: "it", pos: "pron.", translation: "它", phonetic: "ɪt" },
  { word: "we", pos: "pron.", translation: "我们", phonetic: "wiː" },
  { word: "they", pos: "pron.", translation: "他们", phonetic: "ðeɪ" },
  { word: "my", pos: "pron.", translation: "我的", phonetic: "maɪ" },
  { word: "your", pos: "pron.", translation: "你的；你们的", phonetic: "jɔːr" },
  { word: "his", pos: "pron.", translation: "他的", phonetic: "hɪz" },
  { word: "her", pos: "pron.", translation: "她的", phonetic: "hɜːr" },
  { word: "me", pos: "pron.", translation: "我（宾格）", phonetic: "miː" },
  { word: "this", pos: "pron.", translation: "这", phonetic: "ðɪs" },
  { word: "that", pos: "pron.", translation: "那", phonetic: "ðæt" },

  // 3. 疑问词
  { word: "what", pos: "pron.", translation: "什么", phonetic: "wɒt" },
  { word: "who", pos: "pron.", translation: "谁", phonetic: "huː" },
  { word: "where", pos: "ad.", translation: "哪里", phonetic: "weər" },
  { word: "when", pos: "ad.", translation: "何时", phonetic: "wen" },
  { word: "why", pos: "ad.", translation: "为什么", phonetic: "waɪ" },
  { word: "how", pos: "ad.", translation: "怎样", phonetic: "haʊ" },
  { word: "which", pos: "pron.", translation: "哪个", phonetic: "wɪtʃ" },

  // 4. 介词 / 方位
  { word: "in", pos: "prep.", translation: "在……里", phonetic: "ɪn" },
  { word: "on", pos: "prep.", translation: "在……上", phonetic: "ɒn" },
  { word: "under", pos: "prep.", translation: "在……下", phonetic: "ˈʌndər" },
  { word: "at", pos: "prep.", translation: "在", phonetic: "æt" },
  { word: "for", pos: "prep.", translation: "为了", phonetic: "fɔːr" },
  { word: "to", pos: "prep.", translation: "到", phonetic: "tuː" },
  { word: "from", pos: "prep.", translation: "从", phonetic: "frɒm" },
  { word: "with", pos: "prep.", translation: "和；用", phonetic: "wɪð" },
  { word: "here", pos: "ad.", translation: "这里", phonetic: "hɪər" },
  { word: "there", pos: "ad.", translation: "那里", phonetic: "ðeər" },

  // 5. 时间日期
  { word: "today", pos: "n.", translation: "今天", phonetic: "təˈdeɪ" },
  { word: "tomorrow", pos: "n.", translation: "明天", phonetic: "təˈmɒrəʊ" },
  { word: "yesterday", pos: "n.", translation: "昨天", phonetic: "ˈjestədeɪ" },
  { word: "now", pos: "ad.", translation: "现在", phonetic: "naʊ" },
  { word: "day", pos: "n.", translation: "天；日", phonetic: "deɪ" },
  { word: "week", pos: "n.", translation: "周；星期", phonetic: "wiːk" },
  { word: "month", pos: "n.", translation: "月", phonetic: "mʌnθ" },
  { word: "year", pos: "n.", translation: "年", phonetic: "jɪər" },
  { word: "time", pos: "n.", translation: "时间", phonetic: "taɪm" },
  { word: "Monday", pos: "n.", translation: "星期一", phonetic: "ˈmʌndeɪ" },
  { word: "Tuesday", pos: "n.", translation: "星期二", phonetic: "ˈtjuːzdeɪ" },
  { word: "Wednesday", pos: "n.", translation: "星期三", phonetic: "ˈwenzdeɪ" },
  { word: "Thursday", pos: "n.", translation: "星期四", phonetic: "ˈθɜːzdeɪ" },
  { word: "Friday", pos: "n.", translation: "星期五", phonetic: "ˈfraɪdeɪ" },
  { word: "Saturday", pos: "n.", translation: "星期六", phonetic: "ˈsætədeɪ" },
  { word: "Sunday", pos: "n.", translation: "星期日", phonetic: "ˈsʌndeɪ" },

  // 6. 居家物品
  { word: "door", pos: "n.", translation: "门", phonetic: "dɔːr" },
  { word: "window", pos: "n.", translation: "窗户", phonetic: "ˈwɪndəʊ" },
  { word: "wall", pos: "n.", translation: "墙", phonetic: "wɔːl" },
  { word: "floor", pos: "n.", translation: "地板", phonetic: "flɔːr" },
  { word: "bed", pos: "n.", translation: "床", phonetic: "bed" },
  { word: "table", pos: "n.", translation: "桌子", phonetic: "ˈteɪbl" },
  { word: "room", pos: "n.", translation: "房间", phonetic: "ruːm" },
  { word: "home", pos: "n.", translation: "家", phonetic: "həʊm" },
  { word: "house", pos: "n.", translation: "房子", phonetic: "haʊs" },
  { word: "cup", pos: "n.", translation: "杯子", phonetic: "kʌp" },
  { word: "bowl", pos: "n.", translation: "碗", phonetic: "bəʊl" },
  { word: "plate", pos: "n.", translation: "盘子", phonetic: "pleɪt" },

  // 7. 情感感觉
  { word: "angry", pos: "a.", translation: "生气的", phonetic: "ˈæŋɡri" },
  { word: "scared", pos: "a.", translation: "害怕的", phonetic: "skeərd" },
  { word: "excited", pos: "a.", translation: "兴奋的", phonetic: "ɪkˈsaɪtɪd" },
  { word: "surprised", pos: "a.", translation: "惊讶的", phonetic: "səˈpraɪzd" },
  { word: "shy", pos: "a.", translation: "害羞的", phonetic: "ʃaɪ" },
  { word: "proud", pos: "a.", translation: "骄傲的", phonetic: "praʊd" },
  { word: "worried", pos: "a.", translation: "担心的", phonetic: "ˈwʌrid" },

  // 8. 自然
  { word: "moon", pos: "n.", translation: "月亮", phonetic: "muːn" },
  { word: "star", pos: "n.", translation: "星星", phonetic: "stɑːr" },
  { word: "sky", pos: "n.", translation: "天空", phonetic: "skaɪ" },
  { word: "tree", pos: "n.", translation: "树", phonetic: "triː" },
  { word: "flower", pos: "n.", translation: "花", phonetic: "ˈflaʊər" },
  { word: "grass", pos: "n.", translation: "草", phonetic: "ɡrɑːs" },
  { word: "river", pos: "n.", translation: "河流", phonetic: "ˈrɪvər" },
  { word: "mountain", pos: "n.", translation: "山", phonetic: "ˈmaʊntən" },
  { word: "sea", pos: "n.", translation: "海", phonetic: "siː" },
  { word: "spring", pos: "n.", translation: "春天", phonetic: "sprɪŋ" },
  { word: "summer", pos: "n.", translation: "夏天", phonetic: "ˈsʌmər" },
  { word: "autumn", pos: "n.", translation: "秋天", phonetic: "ˈɔːtəm" },
  { word: "winter", pos: "n.", translation: "冬天", phonetic: "ˈwɪntər" },
  { word: "season", pos: "n.", translation: "季节", phonetic: "ˈsiːzn" },

  // 9. 形状
  { word: "circle", pos: "n.", translation: "圆形", phonetic: "ˈsɜːkl" },
  { word: "square", pos: "n.", translation: "正方形", phonetic: "skweər" },
  { word: "triangle", pos: "n.", translation: "三角形", phonetic: "ˈtraɪæŋɡl" },
  { word: "heart", pos: "n.", translation: "心形", phonetic: "hɑːrt" },
  { word: "line", pos: "n.", translation: "线", phonetic: "laɪn" },
  { word: "shape", pos: "n.", translation: "形状", phonetic: "ʃeɪp" },

  // 10. 水果蔬菜扩展
  { word: "peach", pos: "n.", translation: "桃子", phonetic: "piːtʃ" },
  { word: "mango", pos: "n.", translation: "芒果", phonetic: "ˈmæŋɡəʊ" },
  { word: "cherry", pos: "n.", translation: "樱桃", phonetic: "ˈtʃeri" },
  { word: "corn", pos: "n.", translation: "玉米", phonetic: "kɔːrn" },
  { word: "bean", pos: "n.", translation: "豆", phonetic: "biːn" },
  { word: "carrot", pos: "n.", translation: "胡萝卜", phonetic: "ˈkærət" },
  { word: "vegetable", pos: "n.", translation: "蔬菜", phonetic: "ˈvedʒtəbl" },
  { word: "fruit", pos: "n.", translation: "水果", phonetic: "fruːt" },

  // 11. 学习用品扩展
  { word: "crayon", pos: "n.", translation: "蜡笔", phonetic: "ˈkreɪən" },
  { word: "bag", pos: "n.", translation: "书包", phonetic: "bæɡ" },
  { word: "notebook", pos: "n.", translation: "笔记本", phonetic: "ˈnəʊtbʊk" },
  { word: "blackboard", pos: "n.", translation: "黑板", phonetic: "ˈblækbɔːd" },
  { word: "storybook", pos: "n.", translation: "故事书", phonetic: "ˈstɔːribʊk" },
  { word: "pencil-box", pos: "n.", translation: "铅笔盒", phonetic: "ˈpensl bɒks" },

  // 12. 更多动物
  { word: "giraffe", pos: "n.", translation: "长颈鹿", phonetic: "dʒəˈrɑːf" },
  { word: "zebra", pos: "n.", translation: "斑马", phonetic: "ˈziːbrə" },
  { word: "ant", pos: "n.", translation: "蚂蚁", phonetic: "ænt" },
  { word: "bee", pos: "n.", translation: "蜜蜂", phonetic: "biː" },
  { word: "butterfly", pos: "n.", translation: "蝴蝶", phonetic: "ˈbʌtəflaɪ" },
  { word: "turtle", pos: "n.", translation: "乌龟", phonetic: "ˈtɜːrtl" },
  { word: "penguin", pos: "n.", translation: "企鹅", phonetic: "ˈpeŋɡwɪn" },
  { word: "hen", pos: "n.", translation: "母鸡", phonetic: "hen" },
  { word: "goose", pos: "n.", translation: "鹅", phonetic: "ɡuːs" },
  { word: "squirrel", pos: "n.", translation: "松鼠", phonetic: "ˈskwɜːrəl" },
  { word: "goat", pos: "n.", translation: "山羊", phonetic: "ɡəʊt" },
  { word: "donkey", pos: "n.", translation: "驴", phonetic: "ˈdɒŋki" },

  // 13. 动作指令
  { word: "listen", pos: "v.", translation: "听", phonetic: "ˈlɪsn" },
  { word: "look", pos: "v.", translation: "看", phonetic: "lʊk" },
  { word: "open", pos: "v.", translation: "打开", phonetic: "ˈəʊpən" },
  { word: "close", pos: "v.", translation: "关闭", phonetic: "kləʊz" },
  { word: "put", pos: "v.", translation: "放", phonetic: "pʊt" },
  { word: "take", pos: "v.", translation: "拿", phonetic: "teɪk" },
  { word: "give", pos: "v.", translation: "给", phonetic: "ɡɪv" },
  { word: "make", pos: "v.", translation: "制作", phonetic: "meɪk" },
  { word: "want", pos: "v.", translation: "想要", phonetic: "wɒnt" },
  { word: "like", pos: "v.", translation: "喜欢", phonetic: "laɪk" },
  { word: "love", pos: "v.", translation: "爱", phonetic: "lʌv" },
  { word: "help", pos: "v.", translation: "帮助", phonetic: "help" },
  { word: "let", pos: "v.", translation: "让", phonetic: "let" },
  { word: "can", pos: "v.", translation: "能；会", phonetic: "kæn" },
  { word: "do", pos: "v.", translation: "做", phonetic: "duː" },
  { word: "get", pos: "v.", translation: "得到；拿到", phonetic: "ɡet" },
  { word: "buy", pos: "v.", translation: "买", phonetic: "baɪ" },
  { word: "ask", pos: "v.", translation: "问", phonetic: "ɑːsk" },
  { word: "tell", pos: "v.", translation: "告诉", phonetic: "tel" },
  { word: "know", pos: "v.", translation: "知道", phonetic: "nəʊ" },
  { word: "think", pos: "v.", translation: "想；思考", phonetic: "θɪŋk" },
  { word: "count", pos: "v.", translation: "数数", phonetic: "kaʊnt" },

  // 14. 职业
  { word: "doctor", pos: "n.", translation: "医生", phonetic: "ˈdɒktər" },
  { word: "nurse", pos: "n.", translation: "护士", phonetic: "nɜːrs" },
  { word: "driver", pos: "n.", translation: "司机", phonetic: "ˈdraɪvər" },
  { word: "farmer", pos: "n.", translation: "农民", phonetic: "ˈfɑːrmər" },
  { word: "worker", pos: "n.", translation: "工人", phonetic: "ˈwɜːrkər" },
  { word: "policeman", pos: "n.", translation: "警察", phonetic: "pəˈliːsmən" },

  // 15. 场所
  { word: "park", pos: "n.", translation: "公园", phonetic: "pɑːrk" },
  { word: "zoo", pos: "n.", translation: "动物园", phonetic: "zuː" },
  { word: "shop", pos: "n.", translation: "商店", phonetic: "ʃɒp" },
  { word: "hospital", pos: "n.", translation: "医院", phonetic: "ˈhɒspɪtl" },
  { word: "restaurant", pos: "n.", translation: "餐馆", phonetic: "ˈrestrɒnt" },
  { word: "cinema", pos: "n.", translation: "电影院", phonetic: "ˈsɪnəmə" },
  { word: "farm", pos: "n.", translation: "农场", phonetic: "fɑːrm" },
  { word: "garden", pos: "n.", translation: "花园", phonetic: "ˈɡɑːrdn" },

  // 16. 国家
  { word: "China", pos: "n.", translation: "中国", phonetic: "ˈtʃaɪnə" },
  { word: "America", pos: "n.", translation: "美国", phonetic: "əˈmerɪkə" },
  { word: "England", pos: "n.", translation: "英国", phonetic: "ˈɪŋɡlənd" },
  { word: "Japan", pos: "n.", translation: "日本", phonetic: "dʒəˈpæn" },
  { word: "Canada", pos: "n.", translation: "加拿大", phonetic: "ˈkænədə" },

  // 17. 玩具
  { word: "doll", pos: "n.", translation: "洋娃娃", phonetic: "dɒl" },
  { word: "ball", pos: "n.", translation: "球", phonetic: "bɔːl" },
  { word: "kite", pos: "n.", translation: "风筝", phonetic: "kaɪt" },
  { word: "balloon", pos: "n.", translation: "气球", phonetic: "bəˈluːn" },
  { word: "toy", pos: "n.", translation: "玩具", phonetic: "tɔɪ" },
  { word: "robot", pos: "n.", translation: "机器人", phonetic: "ˈrəʊbɒt" },
  { word: "puzzle", pos: "n.", translation: "拼图", phonetic: "ˈpʌzl" },
  { word: "block", pos: "n.", translation: "积木", phonetic: "blɒk" },

  // 18. 副词
  { word: "again", pos: "ad.", translation: "再；又", phonetic: "əˈɡen" },
  { word: "very", pos: "ad.", translation: "非常", phonetic: "ˈveri" },
  { word: "too", pos: "ad.", translation: "也；太", phonetic: "tuː" },
  { word: "also", pos: "ad.", translation: "也", phonetic: "ˈɔːlsəʊ" },
  { word: "only", pos: "ad.", translation: "只；仅", phonetic: "ˈəʊnli" },
  { word: "always", pos: "ad.", translation: "总是", phonetic: "ˈɔːlweɪz" },
  { word: "sometimes", pos: "ad.", translation: "有时", phonetic: "ˈsʌmtaɪmz" },
  { word: "never", pos: "ad.", translation: "从不", phonetic: "ˈnevər" },

  // 19. 节日生日
  { word: "birthday", pos: "n.", translation: "生日", phonetic: "ˈbɜːθdeɪ" },
  { word: "party", pos: "n.", translation: "聚会；派对", phonetic: "ˈpɑːrti" },
  { word: "gift", pos: "n.", translation: "礼物", phonetic: "ɡɪft" },
  { word: "card", pos: "n.", translation: "卡片", phonetic: "kɑːrd" },
];

const CHUNK_SIZE = 100;

// ───────────────────────── 1. 读取现有 mom-core 词书 ─────────────────────────
const oldIndex = JSON.parse(
  fs.readFileSync(path.join(bookDir, "index.json"), "utf8")
);
const oldChunks = [];
for (const f of oldIndex.chunks) {
  oldChunks.push(...JSON.parse(fs.readFileSync(path.join(bookDir, f), "utf8")));
}
console.log(`[mom-core] 现有 ${oldChunks.length} 词`);

const existingSet = new Set(oldChunks.map((w) => w.word.toLowerCase()));

// 新词内部去重 + 与现有去重
const seen = new Set(existingSet);
const uniqueNew = [];
for (const w of NEW_WORDS) {
  const k = w.word.toLowerCase();
  if (seen.has(k)) {
    console.warn(`[mom-core] 跳过重复词: ${w.word}`);
    continue;
  }
  seen.add(k);
  uniqueNew.push(w);
}
console.log(`[mom-core] 新增 ${uniqueNew.length} 词（去重后）`);

// ───────────────────────── 2. 给新词分配 frequency（高于现有最高 9999）─────────────────────────
// 现有最高 frequency=9999（red）。新词 frequency 从 10000+uniqueNew.length-1 递减到 10000，
// 保证全部新词 frequency > 9999，按降序排在新词组内、整体排在新词组前。
const N = uniqueNew.length;
const newEntries = uniqueNew.map((w, i) => ({
  word: w.word,
  pos: w.pos,
  translation: w.translation,
  frequency: 10000 + (N - 1 - i), // 第一个最高：10000+N-1，最后一个：10000
  ...(w.phonetic ? { phonetic: w.phonetic } : {}),
}));

// 新词在前，原有词在后
const allEntries = [...newEntries, ...oldChunks];
console.log(`[mom-core] 合并后共 ${allEntries.length} 词`);

// ───────────────────────── 3. 重新分块写 chunk-NNN.json ─────────────────────────
// 先删除旧 chunk 文件（防止残留）
for (const f of oldIndex.chunks) {
  const p = path.join(bookDir, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const chunkFiles = [];
for (let i = 0; i < allEntries.length; i += CHUNK_SIZE) {
  const slice = allEntries.slice(i, i + CHUNK_SIZE);
  const name = `chunk-${String(Math.floor(i / CHUNK_SIZE)).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(bookDir, name), JSON.stringify(slice), "utf8");
  chunkFiles.push(name);
}
console.log(`[mom-core] 写入 ${chunkFiles.length} 个 chunk 文件`);

// ───────────────────────── 4. 更新 mom-core/index.json ─────────────────────────
const newIndex = {
  id: "mom-core",
  name: "宝妈亲子英语",
  description: "覆盖幼儿园到小学阶段的亲子英语词汇，帮助宝妈应对孩子提问",
  dailyNew: 10,
  sources: [
    { level: "T0", name: "人教版小学英语 PEP（三年级起点）" },
    { level: "T1", name: "幼儿园常用词" },
    { level: "T1", name: "小学1-6年级主题词汇" },
  ],
  sliced: true,
  wordCount: allEntries.length,
  chunkSize: CHUNK_SIZE,
  chunkCount: chunkFiles.length,
  chunks: chunkFiles,
};
fs.writeFileSync(
  path.join(bookDir, "index.json"),
  JSON.stringify(newIndex, null, 2),
  "utf8"
);
console.log(`[mom-core] 更新 index.json: wordCount=${allEntries.length}, chunkCount=${chunkFiles.length}`);

// ───────────────────────── 5. 更新 book-data/index.json 中 mom-core 条目 ─────────────────────────
const bookDataIndex = JSON.parse(
  fs.readFileSync(path.join(publicDir, "book-data", "index.json"), "utf8")
);
const momEntry = bookDataIndex.books.find((b) => b.id === "mom-core");
if (momEntry) {
  momEntry.wordCount = allEntries.length;
  momEntry.chunkCount = chunkFiles.length;
  momEntry.description = "覆盖幼儿园到小学阶段的亲子英语核心词汇（人教版PEP+启蒙200词+主题拓展），帮助宝妈应对孩子提问";
}
fs.writeFileSync(
  path.join(publicDir, "book-data", "index.json"),
  JSON.stringify(bookDataIndex, null, 2),
  "utf8"
);
console.log(`[book-data/index.json] 更新 mom-core: wordCount=${allEntries.length}`);

// ───────────────────────── 6. 把新词追加到 dict-data 切片（DictEntry 格式）─────────────────────────
let dictUpdated = 0;
for (const w of uniqueNew) {
  const key = w.word.toLowerCase().slice(0, 2);
  const letter = key[0];
  const letterDir = path.join(dictRoot, letter);
  fs.mkdirSync(letterDir, { recursive: true });
  const slicePath = path.join(letterDir, `${key}.json`);
  let arr = [];
  if (fs.existsSync(slicePath)) {
    try {
      arr = JSON.parse(fs.readFileSync(slicePath, "utf8"));
    } catch {
      arr = [];
    }
  }
  const existsIdx = arr.findIndex(
    (e) => e.word.toLowerCase() === w.word.toLowerCase()
  );
  const entry = {
    word: w.word,
    phonetic: w.phonetic || "",
    pos: w.pos,
    translation: w.translation,
    definition: "",
    frequency: 10000, // 高频优先展示
    tags: ["mom", "kid", "primary"],
    root: "",
    examples: [],
    synonyms: [],
    antonyms: [],
    collocations: [],
    wordFamily: [],
  };
  if (existsIdx >= 0) {
    arr[existsIdx] = { ...arr[existsIdx], ...entry };
  } else {
    arr.push(entry);
    dictUpdated++;
  }
  fs.writeFileSync(slicePath, JSON.stringify(arr), "utf8");
}
console.log(`[dict-data] 新增 ${dictUpdated} 个词条到对应切片`);

// ───────────────────────── 7. 重建 search-index.json ─────────────────────────
const seenSearch = new Set();
const searchEntries = [];
function scanDictDir(dir) {
  let letters;
  try {
    letters = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const letter of letters) {
    const ld = path.join(dir, letter);
    if (!fs.statSync(ld).isDirectory()) continue;
    let files;
    try {
      files = fs.readdirSync(ld);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const arr = JSON.parse(fs.readFileSync(path.join(ld, f), "utf8"));
      for (const e of arr) {
        const w = e?.word?.trim();
        if (!w) continue;
        const k = w.toLowerCase();
        if (seenSearch.has(k)) continue;
        seenSearch.add(k);
        searchEntries.push({ word: w, frequency: e.frequency ?? 0 });
      }
    }
  }
}
scanDictDir(dictRoot);
searchEntries.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
fs.writeFileSync(
  path.join(publicDir, "search-index.json"),
  JSON.stringify(searchEntries),
  "utf8"
);
console.log(`[search-index] 重建 ${searchEntries.length} 条索引`);

console.log("[mom-core] 扩展完成 ✅");
