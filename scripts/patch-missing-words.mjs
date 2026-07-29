#!/usr/bin/env node
/**
 * Patch missing words into WordFlow dict slice files and search-index.json.
 *
 * Reads /workspace/tmp-missing-words.txt, looks up a hardcoded translation map
 * for each word, then appends new entries to the appropriate slice file
 * (public/dict/{first_letter}/{first_2_chars}.json) and to search-index.json.
 *
 * Usage: node scripts/patch-missing-words.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const WORKSPACE = "/workspace";
const MISSING_WORDS_FILE = join(WORKSPACE, "tmp-missing-words.txt");
const PUBLIC_DIR = join(WORKSPACE, "public");
const DICT_DIR = join(PUBLIC_DIR, "dict-data");
const SEARCH_INDEX_FILE = join(PUBLIC_DIR, "search-index.json");

/**
 * Normalize a raw word from the missing-words file into the canonical word
 * stored in the dict:
 *  - strip trailing "[" (e.g. "instruct[" -> "instruct")
 *  - replace modifier-letter vertical line ˈ with a real apostrophe '
 *    (e.g. "oˈclock" -> "o'clock")
 *  - strip parenthesised suffixes (e.g. "systematic(al)" -> "systematic",
 *    "toward(s)" -> "towards")
 */
function normalizeWord(raw) {
  let w = raw.trim();
  if (w.endsWith("[")) w = w.slice(0, -1);
  w = w.replace(/\u02C8/g, "'"); // ˈ MODIFIER LETTER VERTICAL LINE -> '
  // "(s)" means optional 's' -> keep the 's' (plural form preferred, e.g. "towards")
  w = w.replace(/\(s\)/g, "s");
  // Strip other parenthesised suffixes (e.g. "systematic(al)" -> "systematic")
  w = w.replace(/\([^)]*\)/g, "");
  return w;
}

/** Slice key = first 2 lowercase chars, or the whole word if shorter. */
function sliceKey(word) {
  return word.toLowerCase().slice(0, 2);
}

/**
 * Hardcoded translation map keyed by the *normalized* word.
 * Each value: { translation, phonetic, pos, definition, frequency, tags }
 */
const WORD_DATA = {
  "a": {
    translation: "art. 一(个), 每一(个, 任何一个",
    phonetic: "/ə/",
    pos: "art.",
    definition: "used before a noun to refer to a single thing or person",
    frequency: 46000,
    tags: ["zk", "gk"],
  },
  "a.m": {
    translation: "abbr. 上午, 午前",
    phonetic: "/ˌeɪˈem/",
    pos: "abbr.",
    definition: "before noon (ante meridiem)",
    frequency: 8000,
    tags: ["zk", "gk"],
  },
  "acre": {
    translation: "n. 英亩",
    phonetic: "/ˈeɪkə/",
    pos: "n.",
    definition: "a unit of land area equal to 4,840 square yards",
    frequency: 5000,
    tags: ["cet4", "kaoyan"],
  },
  "africa": {
    translation: "n. 非洲",
    phonetic: "/ˈæfrɪkə/",
    pos: "n.",
    definition: "the second largest continent, south of the Mediterranean Sea",
    frequency: 12000,
    tags: ["zk", "gk"],
  },
  "agentic": {
    translation: "a. 自主的, 代理的, 能主动行动的",
    phonetic: "/əˈdʒentɪk/",
    pos: "a.",
    definition: "relating to an agent that can act autonomously to pursue goals",
    frequency: 300,
    tags: [],
  },
  "air-condition": {
    translation: "vt. 给…装空调, 调节…的空气",
    phonetic: "/ˈeəkəndɪʃn/",
    pos: "v.",
    definition: "to equip with an air-conditioning system; to control the temperature and humidity of air",
    frequency: 2000,
    tags: [],
  },
  "air-conditioning": {
    translation: "n. 空调, 空气调节",
    phonetic: "/ˈeəkəndɪʃənɪŋ/",
    pos: "n.",
    definition: "a system that controls the temperature and humidity of air in a building or vehicle",
    frequency: 4000,
    tags: ["cet4"],
  },
  "ambassadress": {
    translation: "n. 女大使, 大使夫人",
    phonetic: "/æmˈbæsədrɪs/",
    pos: "n.",
    definition: "a female ambassador or the wife of an ambassador",
    frequency: 500,
    tags: [],
  },
  "america": {
    translation: "n. 美国, 美洲",
    phonetic: "/əˈmerɪkə/",
    pos: "n.",
    definition: "the United States of America; the continent of the Americas",
    frequency: 14000,
    tags: ["zk", "gk"],
  },
  "an": {
    translation: "art. 一(个), 每一(个)",
    phonetic: "/ən/",
    pos: "art.",
    definition: "the indefinite article used before words beginning with a vowel sound",
    frequency: 42000,
    tags: ["zk", "gk"],
  },
  "apologise": {
    translation: "vi. 道歉, 认错, 辩解",
    phonetic: "/əˈpɒlədʒaɪz/",
    pos: "v.",
    definition: "to express regret for doing something wrong",
    frequency: 6000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "april": {
    translation: "n. 四月",
    phonetic: "/ˈeɪprəl/",
    pos: "n.",
    definition: "the fourth month of the year",
    frequency: 10000,
    tags: ["zk", "gk"],
  },
  "are": {
    translation: "v. 是",
    phonetic: "/ɑː/",
    pos: "v.",
    definition: "the plural and second-person singular present tense of 'be'",
    frequency: 46000,
    tags: ["zk", "gk"],
  },
  "asia": {
    translation: "n. 亚洲",
    phonetic: "/ˈeɪʒə/",
    pos: "n.",
    definition: "the largest continent, east of Europe",
    frequency: 11000,
    tags: ["zk", "gk"],
  },
  "atlantic": {
    translation: "a. 大西洋的\nn. 大西洋",
    phonetic: "/ətˈlæntɪk/",
    pos: "a.",
    definition: "relating to the Atlantic Ocean",
    frequency: 8000,
    tags: ["gk"],
  },
  "australia": {
    translation: "n. 澳大利亚, 澳洲",
    phonetic: "/ɒˈstreɪliə/",
    pos: "n.",
    definition: "a country and continent in the Southern Hemisphere",
    frequency: 11000,
    tags: ["zk", "gk"],
  },
  "backpropagation": {
    translation: "n. 反向传播",
    phonetic: "/ˌbækˌprɒpəˈɡeɪʃən/",
    pos: "n.",
    definition: "an algorithm used in training neural networks by computing gradients backward through the network",
    frequency: 400,
    tags: [],
  },
  "bacterium": {
    translation: "n. 细菌",
    phonetic: "/bækˈtɪəriəm/",
    pos: "n.",
    definition: "a single-celled microorganism; the singular form of 'bacteria'",
    frequency: 3000,
    tags: ["cet6", "kaoyan", "toefl"],
  },
  "bc": {
    translation: "abbr. 公元前 (Before Christ)",
    phonetic: "/ˌbiːˈsiː/",
    pos: "abbr.",
    definition: "before Christ; used to indicate dates before the traditional birth year of Jesus",
    frequency: 6000,
    tags: ["gk"],
  },
  "beddings": {
    translation: "n. 寝具, 铺盖, 被褥",
    phonetic: "/ˈbedɪŋz/",
    pos: "n.",
    definition: "mattresses, sheets, blankets and other items used on a bed",
    frequency: 2000,
    tags: [],
  },
  "bin": {
    translation: "n. 垃圾箱, 储物箱, 箱子",
    phonetic: "/bɪn/",
    pos: "n.",
    definition: "a receptacle for storing waste or other items",
    frequency: 5000,
    tags: ["cet4"],
  },
  "calorie": {
    translation: "n. 卡路里, 热量",
    phonetic: "/ˈkæləri/",
    pos: "n.",
    definition: "a unit of energy equal to the heat needed to raise the temperature of 1 gram of water by 1 degree Celsius",
    frequency: 4000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "cd": {
    translation: "abbr. 光盘, 激光唱片 (compact disc)",
    phonetic: "/ˌsiːˈdiː/",
    pos: "abbr.",
    definition: "a compact disc used to store digital audio or data",
    frequency: 5000,
    tags: ["zk", "gk"],
  },
  "cent": {
    translation: "n. 美分, 一分钱, 百分之一",
    phonetic: "/sent/",
    pos: "n.",
    definition: "a monetary unit equal to one hundredth of a dollar",
    frequency: 6000,
    tags: ["zk", "gk", "cet4"],
  },
  "centigrade": {
    translation: "a. 摄氏的, 百分度的",
    phonetic: "/ˈsentɪɡreɪd/",
    pos: "a.",
    definition: "relating to a temperature scale with 100 degrees between freezing and boiling points of water",
    frequency: 3000,
    tags: ["gk", "cet4"],
  },
  "centimetre": {
    translation: "n. 厘米, 公分",
    phonetic: "/ˈsentɪmiːtə/",
    pos: "n.",
    definition: "a metric unit of length equal to one hundredth of a metre",
    frequency: 3000,
    tags: ["gk", "cet4"],
  },
  "centre": {
    translation: "n. 中心, 中央, 中间\nv. 集中, 放在中心",
    phonetic: "/ˈsentə/",
    pos: "n.",
    definition: "the middle point of something; a place where a particular activity is carried out",
    frequency: 8000,
    tags: ["zk", "gk", "cet4", "kaoyan"],
  },
  "chain-of-thought": {
    translation: "n. 思维链",
    phonetic: "/tʃeɪn əv θɔːt/",
    pos: "n.",
    definition: "a prompt technique in large language models that produces step-by-step reasoning before the final answer",
    frequency: 300,
    tags: [],
  },
  "colour": {
    translation: "n. 颜色, 色彩\nv. 给…着色",
    phonetic: "/ˈkʌlə/",
    pos: "n.",
    definition: "the property possessed by an object of producing different sensations on the eye",
    frequency: 8000,
    tags: ["zk", "gk", "cet4", "kaoyan"],
  },
  "concurrency": {
    translation: "n. 并发性, 同时发生",
    phonetic: "/kənˈkʌrənsi/",
    pos: "n.",
    definition: "the ability of a system to handle multiple tasks simultaneously",
    frequency: 500,
    tags: [],
  },
  "congratulation": {
    translation: "n. 祝贺, 恭喜, 贺词",
    phonetic: "/kənˌɡrætʃuˈleɪʃən/",
    pos: "n.",
    definition: "an expression of pleasure at someone else's success or good fortune",
    frequency: 4000,
    tags: ["zk", "gk", "cet4"],
  },
  "context window": {
    translation: "n. 上下文窗口",
    phonetic: "/ˈkɒntekst ˈwɪndəʊ/",
    pos: "n.",
    definition: "the maximum amount of text a language model can process in a single request",
    frequency: 400,
    tags: [],
  },
  "coordinates": {
    translation: "n. 坐标, 坐标系",
    phonetic: "/kəʊˈɔːdɪnəts/",
    pos: "n.",
    definition: "a set of numbers used to specify a position in a coordinate system",
    frequency: 2000,
    tags: ["cet6", "kaoyan"],
  },
  "cors": {
    translation: "abbr. 跨域资源共享 (Cross-Origin Resource Sharing)",
    phonetic: "/kɔːs/",
    pos: "abbr.",
    definition: "a browser mechanism that allows web pages to access resources from a different origin",
    frequency: 400,
    tags: [],
  },
  "criterion": {
    translation: "n. 标准, 准则, 判据",
    phonetic: "/kraɪˈtɪəriən/",
    pos: "n.",
    definition: "a standard or principle by which something is judged",
    frequency: 4000,
    tags: ["cet6", "kaoyan", "toefl", "gre"],
  },
  "customs": {
    translation: "n. 海关, 关税, 进口税",
    phonetic: "/ˈkʌstəmz/",
    pos: "n.",
    definition: "the official department that administers and collects duties on imported goods",
    frequency: 4000,
    tags: ["cet4", "kaoyan"],
  },
  "deprecated": {
    translation: "a. 弃用的, 不赞成的, 过时的",
    phonetic: "/ˈdeprəkeɪtɪd/",
    pos: "a.",
    definition: "a feature that is still available but no longer recommended and may be removed in the future",
    frequency: 500,
    tags: [],
  },
  "deserialize": {
    translation: "vt. 反序列化",
    phonetic: "/diːˈsɪəriəlaɪz/",
    pos: "v.",
    definition: "to convert serialized data back into an in-memory object",
    frequency: 300,
    tags: [],
  },
  "dissatisfy": {
    translation: "vt. 使不满, 使不平",
    phonetic: "/dɪsˈsætɪsfaɪ/",
    pos: "v.",
    definition: "to fail to satisfy; to make discontented",
    frequency: 2000,
    tags: ["cet6", "kaoyan"],
  },
  "dollar": {
    translation: "n. 美元, 元",
    phonetic: "/ˈdɒlə/",
    pos: "n.",
    definition: "the basic monetary unit of the US, Canada, Australia, and other countries",
    frequency: 8000,
    tags: ["zk", "gk", "cet4", "kaoyan"],
  },
  "dr": {
    translation: "abbr. 博士, 医生 (doctor)",
    phonetic: "/ˈdɒktə/",
    pos: "abbr.",
    definition: "abbreviation for doctor, used before the name of a person with a doctoral degree",
    frequency: 6000,
    tags: ["zk", "gk"],
  },
  "dvd": {
    translation: "abbr. 数字影碟 (digital versatile disc)",
    phonetic: "/ˌdiː viː ˈdiː/",
    pos: "abbr.",
    definition: "a type of optical disc used for storing video and data",
    frequency: 4000,
    tags: ["zk", "gk"],
  },
  "e-mail": {
    translation: "n. 电子邮件\nvt. 给…发电子邮件",
    phonetic: "/ˈiː meɪl/",
    pos: "n.",
    definition: "messages distributed by electronic means from one computer to another",
    frequency: 5000,
    tags: ["zk", "gk", "cet4"],
  },
  "europe": {
    translation: "n. 欧洲",
    phonetic: "/ˈjʊərəp/",
    pos: "n.",
    definition: "the continent west of Asia and north of Africa",
    frequency: 12000,
    tags: ["zk", "gk"],
  },
  "eval": {
    translation: "n. 求值, 评估\nv. 执行求值",
    phonetic: "/ɪˈvæl/",
    pos: "n.",
    definition: "a function that evaluates a string as code; an evaluation",
    frequency: 500,
    tags: [],
  },
  "farther": {
    translation: "adv. 更远地, 进一步地\na. 更远的",
    phonetic: "/ˈfɑːðə/",
    pos: "adv.",
    definition: "at, to, or by a greater distance; further",
    frequency: 5000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "father-in-law": {
    translation: "n. 岳父, 公公",
    phonetic: "/ˈfɑːðər ɪn lɔː/",
    pos: "n.",
    definition: "the father of one's spouse",
    frequency: 3000,
    tags: ["zk", "gk"],
  },
  "few-shot": {
    translation: "a. 少样本的, 少量示例的",
    phonetic: "/fjuː ʃɒt/",
    pos: "a.",
    definition: "a prompt technique that provides a few examples to guide a model's output",
    frequency: 300,
    tags: [],
  },
  "fine-tuning": {
    translation: "n. 微调",
    phonetic: "/faɪn ˈtjuːnɪŋ/",
    pos: "n.",
    definition: "the process of further training a pretrained model on a specific task or dataset",
    frequency: 400,
    tags: [],
  },
  "flavour": {
    translation: "n. 味道, 风味, 滋味\nvt. 给…调味",
    phonetic: "/ˈfleɪvə/",
    pos: "n.",
    definition: "the distinctive taste of a food or drink",
    frequency: 4000,
    tags: ["cet4", "cet6", "kaoyan", "toefl"],
  },
  "franc": {
    translation: "n. 法郎",
    phonetic: "/fræŋk/",
    pos: "n.",
    definition: "the former monetary unit of France, Switzerland, and other countries",
    frequency: 3000,
    tags: ["cet4", "cet6"],
  },
  "gallon": {
    translation: "n. 加仑",
    phonetic: "/ˈɡælən/",
    pos: "n.",
    definition: "a unit of volume for liquid measure equal to 4 quarts (about 3.785 litres)",
    frequency: 3000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "goods": {
    translation: "n. 货物, 商品, 财产",
    phonetic: "/ɡʊdz/",
    pos: "n.",
    definition: "items for sale; personal property or belongings",
    frequency: 5000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "gram": {
    translation: "n. 克",
    phonetic: "/ɡræm/",
    pos: "n.",
    definition: "a metric unit of mass equal to one thousandth of a kilogram",
    frequency: 4000,
    tags: ["gk", "cet4"],
  },
  "gramme": {
    translation: "n. 克",
    phonetic: "/ɡræm/",
    pos: "n.",
    definition: "a metric unit of mass; an alternative spelling of 'gram'",
    frequency: 2000,
    tags: ["gk", "cet4"],
  },
  "grandparents": {
    translation: "n. 祖父母, 外祖父母",
    phonetic: "/ˈɡrænpeərənts/",
    pos: "n.",
    definition: "the parents of one's father or mother",
    frequency: 4000,
    tags: ["zk", "gk", "cet4"],
  },
  "GraphQL": {
    translation: "n. GraphQL查询语言",
    phonetic: "/ɡræf kju əl/",
    pos: "n.",
    definition: "a query language and runtime for APIs developed by Facebook",
    frequency: 500,
    tags: [],
  },
  "grown-up": {
    translation: "n. 成年人\na. 成年的, 成熟的",
    phonetic: "/ˈɡrəʊn ʌp/",
    pos: "n.",
    definition: "an adult; a fully grown person",
    frequency: 3000,
    tags: ["gk"],
  },
  "hardworking": {
    translation: "a. 勤勉的, 努力工作的",
    phonetic: "/ˌhɑːdˈwɜːkɪŋ/",
    pos: "a.",
    definition: "tending to work hard and diligently",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "humour": {
    translation: "n. 幽默, 诙谐, 心情",
    phonetic: "/ˈhjuːmə/",
    pos: "n.",
    definition: "the quality of being amusing or comic; a person's mood or temperament",
    frequency: 5000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "hyperparameter": {
    translation: "n. 超参数",
    phonetic: "/ˌhaɪpəˈpærəmɪtə/",
    pos: "n.",
    definition: "a parameter whose value is set before training a machine learning model",
    frequency: 400,
    tags: [],
  },
  "i": {
    translation: "pron. 我",
    phonetic: "/aɪ/",
    pos: "pron.",
    definition: "the ninth letter of the alphabet; used by a speaker to refer to himself or herself",
    frequency: 46000,
    tags: ["zk", "gk"],
  },
  "i.e.": {
    translation: "abbr. 即, 也就是 (id est)",
    phonetic: "/aɪ iː/",
    pos: "abbr.",
    definition: "that is to say; used to clarify or specify",
    frequency: 5000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "ice-cream": {
    translation: "n. 冰淇淋, 雪糕",
    phonetic: "/ˈaɪs kriːm/",
    pos: "n.",
    definition: "a frozen dessert made from cream, sugar, and flavourings",
    frequency: 4000,
    tags: ["zk", "gk"],
  },
  "idempotent": {
    translation: "a. 幂等的",
    phonetic: "/ˌaɪdəmˈpəʊtənt/",
    pos: "a.",
    definition: "an operation that produces the same result whether applied once or multiple times",
    frequency: 300,
    tags: [],
  },
  "instruct": {
    translation: "vt. 指示, 教授, 命令\nvi. 教学, 指导",
    phonetic: "/ɪnˈstrʌkt/",
    pos: "v.",
    definition: "to give someone directions or orders; to teach a subject or skill",
    frequency: 5000,
    tags: ["gk", "cet4", "cet6", "kaoyan", "toefl"],
  },
  "is": {
    translation: "v. 是",
    phonetic: "/ɪz/",
    pos: "v.",
    definition: "the third-person singular present tense of 'be'",
    frequency: 47000,
    tags: ["zk", "gk"],
  },
  "iterator": {
    translation: "n. 迭代器",
    phonetic: "/ˈɪtəreɪtə/",
    pos: "n.",
    definition: "an object that enables traversal of a collection, one element at a time",
    frequency: 500,
    tags: [],
  },
  "kilo": {
    translation: "n. 千克, 公斤",
    phonetic: "/ˈkiːləʊ/",
    pos: "n.",
    definition: "a kilogram; a metric unit of mass",
    frequency: 3000,
    tags: ["gk", "cet4"],
  },
  "kilogram": {
    translation: "n. 千克, 公斤",
    phonetic: "/ˈkɪləɡræm/",
    pos: "n.",
    definition: "a metric unit of mass equal to 1,000 grams",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "kilometer": {
    translation: "n. 千米, 公里",
    phonetic: "/ˈkɪləmiːtə/",
    pos: "n.",
    definition: "a metric unit of length equal to 1,000 metres (American spelling)",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "kilometre": {
    translation: "n. 千米, 公里",
    phonetic: "/ˈkɪləmiːtə/",
    pos: "n.",
    definition: "a metric unit of length equal to 1,000 metres",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "litre": {
    translation: "n. 升",
    phonetic: "/ˈliːtə/",
    pos: "n.",
    definition: "a metric unit of capacity equal to one cubic decimetre",
    frequency: 3000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "living-room": {
    translation: "n. 起居室, 客厅",
    phonetic: "/ˈlɪvɪŋ ruːm/",
    pos: "n.",
    definition: "a room in a house used for general everyday activities",
    frequency: 3000,
    tags: ["zk", "gk", "cet4"],
  },
  "manager": {
    translation: "n. 经理, 管理者, 管理程序",
    phonetic: "/ˈmænɪdʒə/",
    pos: "n.",
    definition: "a person responsible for controlling or administering an organization or activity",
    frequency: 6000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "means": {
    translation: "n. 手段, 方法, 财产, 工具",
    phonetic: "/miːnz/",
    pos: "n.",
    definition: "an action or system by which a result is achieved; resources or money",
    frequency: 6000,
    tags: ["gk", "cet4", "cet6", "kaoyan", "toefl"],
  },
  "mechanics": {
    translation: "n. 力学, 机械学, 技术细节, 结构",
    phonetic: "/məˈkænɪks/",
    pos: "n.",
    definition: "the branch of physics dealing with motion and force; the way something works",
    frequency: 4000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "metre": {
    translation: "n. 米, 公尺, 韵律",
    phonetic: "/ˈmiːtə/",
    pos: "n.",
    definition: "the basic metric unit of length; the rhythm of a verse in poetry",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "mile": {
    translation: "n. 英里",
    phonetic: "/maɪl/",
    pos: "n.",
    definition: "a unit of distance equal to 1,760 yards (about 1.609 kilometres)",
    frequency: 5000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "millimetre": {
    translation: "n. 毫米",
    phonetic: "/ˈmɪlimiːtə/",
    pos: "n.",
    definition: "a metric unit of length equal to one thousandth of a metre",
    frequency: 3000,
    tags: ["gk", "cet4"],
  },
  "neighbour": {
    translation: "n. 邻居, 邻国\nv. 邻接",
    phonetic: "/ˈneɪbə/",
    pos: "n.",
    definition: "a person living next to or near another",
    frequency: 5000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "nil": {
    translation: "n. 零, 没有, 无",
    phonetic: "/nɪl/",
    pos: "n.",
    definition: "nothing; zero, especially in sports scores",
    frequency: 3000,
    tags: ["gk", "cet6"],
  },
  "o'clock": {
    translation: "adv. ...点钟",
    phonetic: "/əˈklɒk/",
    pos: "adv.",
    definition: "used to specify the time according to a clock",
    frequency: 8000,
    tags: ["zk", "gk"],
  },
  "observability": {
    translation: "n. 可观测性",
    phonetic: "/əbˌzɜːvəˈbɪləti/",
    pos: "n.",
    definition: "the ability to measure a system's internal state from its external outputs",
    frequency: 300,
    tags: [],
  },
  "oceania": {
    translation: "n. 大洋洲",
    phonetic: "/ˌəʊʃiˈɑːniə/",
    pos: "n.",
    definition: "a region of the Pacific Ocean comprising Australia, New Zealand, and other island nations",
    frequency: 5000,
    tags: ["gk"],
  },
  "odour": {
    translation: "n. 气味, 香味, 臭味",
    phonetic: "/ˈəʊdə/",
    pos: "n.",
    definition: "a distinctive smell, especially an unpleasant one",
    frequency: 3000,
    tags: ["cet6", "kaoyan", "toefl", "ielts"],
  },
  "oilfield": {
    translation: "n. 油田",
    phonetic: "/ˈɔɪlfiːld/",
    pos: "n.",
    definition: "an area of land or seabed under which petroleum occurs naturally",
    frequency: 2000,
    tags: [],
  },
  "organisation": {
    translation: "n. 组织, 机构, 团体",
    phonetic: "/ˌɔːɡənaɪˈzeɪʃən/",
    pos: "n.",
    definition: "an organized group of people with a particular purpose",
    frequency: 5000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "organise": {
    translation: "vt. 组织, 安排, 筹办\nvi. 组织起来",
    phonetic: "/ˈɔːɡənaɪz/",
    pos: "v.",
    definition: "to arrange or structure something systematically",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "ounce": {
    translation: "n. 盎司, 少量",
    phonetic: "/aʊns/",
    pos: "n.",
    definition: "a unit of weight equal to one sixteenth of a pound (about 28.35 grams)",
    frequency: 3000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "outskirt": {
    translation: "n. 郊区, 市郊, 边缘",
    phonetic: "/ˈaʊtskɜːt/",
    pos: "n.",
    definition: "the outer parts of a town or city",
    frequency: 3000,
    tags: ["cet6", "kaoyan", "toefl"],
  },
  "overfitting": {
    translation: "n. 过拟合",
    phonetic: "/ˌəʊvəˈfɪtɪŋ/",
    pos: "n.",
    definition: "a modeling error where a model fits training data too closely and fails to generalize",
    frequency: 400,
    tags: [],
  },
  "ox": {
    translation: "n. 牛, 公牛",
    phonetic: "/ɒks/",
    pos: "n.",
    definition: "a domesticated bovine animal used for ploughing; the singular of 'oxen'",
    frequency: 4000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "pants": {
    translation: "n. 裤子, 短裤",
    phonetic: "/pænts/",
    pos: "n.",
    definition: "trousers; undergarments",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "part-time": {
    translation: "a. 兼职的, 部分时间的\nadv. 兼职地",
    phonetic: "/ˌpɑːtˈtaɪm/",
    pos: "a.",
    definition: "working for only part of the usual working day or week",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "passer-by": {
    translation: "n. 过路人, 路人",
    phonetic: "/ˌpɑːsəˈbaɪ/",
    pos: "n.",
    definition: "a person who is walking past a place by chance",
    frequency: 3000,
    tags: ["gk", "cet4", "cet6"],
  },
  "pence": {
    translation: "n. 便士 (penny的复数)",
    phonetic: "/pens/",
    pos: "n.",
    definition: "the plural form of 'penny', a British unit of money",
    frequency: 3000,
    tags: ["cet4", "cet6"],
  },
  "penny": {
    translation: "n. 便士, 一分钱",
    phonetic: "/ˈpeni/",
    pos: "n.",
    definition: "a British unit of money equal to one hundredth of a pound",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6"],
  },
  "percent": {
    translation: "n. 百分之…, 百分比",
    phonetic: "/pəˈsent/",
    pos: "n.",
    definition: "one part in every hundred",
    frequency: 6000,
    tags: ["zk", "gk", "cet4", "kaoyan"],
  },
  "perceptron": {
    translation: "n. 感知器, 感知机",
    phonetic: "/pəˈseptrɒn/",
    pos: "n.",
    definition: "an algorithm for supervised learning of binary classifiers, the simplest type of neural network",
    frequency: 400,
    tags: [],
  },
  "ping-pong": {
    translation: "n. 乒乓球, 桌球",
    phonetic: "/ˈpɪŋ pɒŋ/",
    pos: "n.",
    definition: "the game of table tennis",
    frequency: 3000,
    tags: ["zk", "gk"],
  },
  "pint": {
    translation: "n. 品脱",
    phonetic: "/paɪnt/",
    pos: "n.",
    definition: "a unit of volume equal to one eighth of a gallon (about 0.568 litres)",
    frequency: 3000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "postcode": {
    translation: "n. 邮政编码, 邮编",
    phonetic: "/ˈpəʊstkəʊd/",
    pos: "n.",
    definition: "a code used in the postal system to identify a geographic delivery area",
    frequency: 3000,
    tags: ["gk", "cet4", "ielts"],
  },
  "pragma": {
    translation: "n. 编译指示, 实用指令",
    phonetic: "/ˈpræɡmə/",
    pos: "n.",
    definition: "a compiler directive that provides instructions to the compiler without affecting the code logic",
    frequency: 400,
    tags: [],
  },
  "pretrain": {
    translation: "vt. 预训练",
    phonetic: "/priːˈtreɪn/",
    pos: "v.",
    definition: "to train a model on a large dataset before fine-tuning it for a specific task",
    frequency: 400,
    tags: [],
  },
  "proceeding": {
    translation: "n. 程序, 进程, 会议录, 诉讼",
    phonetic: "/prəˈsiːdɪŋ/",
    pos: "n.",
    definition: "an event or series of events; the official record of a conference",
    frequency: 3000,
    tags: ["cet6", "kaoyan", "toefl"],
  },
  "programme": {
    translation: "n. 节目, 程序, 计划, 大纲\nvt. 编程, 安排节目",
    phonetic: "/ˈprəʊɡræm/",
    pos: "n.",
    definition: "a planned series of activities; a broadcast; a set of instructions for a computer",
    frequency: 5000,
    tags: ["zk", "gk", "cet4", "kaoyan"],
  },
  "quart": {
    translation: "n. 夸脱",
    phonetic: "/kwɔːt/",
    pos: "n.",
    definition: "a unit of volume equal to a quarter of a gallon (about 1.136 litres)",
    frequency: 3000,
    tags: ["cet4", "cet6"],
  },
  "realise": {
    translation: "vt. 意识到, 实现, 了解\nvi. 变卖, 获得",
    phonetic: "/ˈrɪəlaɪz/",
    pos: "v.",
    definition: "to become aware of something; to make something real",
    frequency: 6000,
    tags: ["gk", "cet4", "cet6", "kaoyan", "toefl"],
  },
  "recognise": {
    translation: "vt. 认出, 承认, 识别\nvi. 承认",
    phonetic: "/ˈrekəɡnaɪz/",
    pos: "v.",
    definition: "to identify someone or something from previous experience; to acknowledge as valid",
    frequency: 6000,
    tags: ["gk", "cet4", "cet6", "kaoyan", "toefl"],
  },
  "reflexion": {
    translation: "n. 反射, 反思, 映像",
    phonetic: "/rɪˈflekʃən/",
    pos: "n.",
    definition: "an alternative spelling of 'reflection'; the act of bending back or deep thought",
    frequency: 2000,
    tags: ["cet6", "kaoyan"],
  },
  "rumour": {
    translation: "n. 谣言, 传闻\nv. 谣传",
    phonetic: "/ˈruːmə/",
    pos: "n.",
    definition: "a currently circulating story or report of uncertain truth",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "runtime": {
    translation: "n. 运行时间, 运行时",
    phonetic: "/ˈrʌntaɪm/",
    pos: "n.",
    definition: "the period during which a program is executing; the environment in which a program runs",
    frequency: 500,
    tags: [],
  },
  "schoolbag": {
    translation: "n. 书包",
    phonetic: "/ˈskuːlbæɡ/",
    pos: "n.",
    definition: "a bag used by students to carry books and school supplies",
    frequency: 3000,
    tags: ["zk", "gk"],
  },
  "serializer": {
    translation: "n. 序列化器",
    phonetic: "/ˈsɪəriəlaɪzə/",
    pos: "n.",
    definition: "a component that converts objects into a format suitable for storage or transmission",
    frequency: 300,
    tags: [],
  },
  "sideroad": {
    translation: "n. 旁路, 小路, 岔路",
    phonetic: "/ˈsaɪdrəʊd/",
    pos: "n.",
    definition: "a minor road that branches off a main road; a side road",
    frequency: 2000,
    tags: [],
  },
  "sneaker": {
    translation: "n. 运动鞋, 帆布鞋",
    phonetic: "/ˈsniːkə/",
    pos: "n.",
    definition: "a soft sports shoe with a rubber sole",
    frequency: 3000,
    tags: ["gk", "cet4"],
  },
  "so-called": {
    translation: "a. 所谓的, 号称的",
    phonetic: "/ˌsəʊˈkɔːld/",
    pos: "a.",
    definition: "used to describe something that is commonly named or referred to in a particular way",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "softmax": {
    translation: "n. softmax函数",
    phonetic: "/ˈsɒftmæks/",
    pos: "n.",
    definition: "a function that converts a vector of numbers into a probability distribution",
    frequency: 400,
    tags: [],
  },
  "stateful": {
    translation: "a. 有状态的",
    phonetic: "/ˈsteɪtfʊl/",
    pos: "a.",
    definition: "relating to a system or component that retains information about past interactions",
    frequency: 400,
    tags: [],
  },
  "stateswoman": {
    translation: "n. 女政治家, 女国务活动家",
    phonetic: "/ˈsteɪtsˌwʊmən/",
    pos: "n.",
    definition: "a female statesman; a woman experienced in government and politics",
    frequency: 1000,
    tags: [],
  },
  "subway": {
    translation: "n. 地铁, 地下通道",
    phonetic: "/ˈsʌbweɪ/",
    pos: "n.",
    definition: "an underground railway system in a city; a pedestrian underpass",
    frequency: 4000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "systematic": {
    translation: "a. 系统的, 体系的, 有规律的",
    phonetic: "/ˌsɪstəˈmætɪk/",
    pos: "a.",
    definition: "done according to a fixed plan or system; methodical",
    frequency: 5000,
    tags: ["cet4", "cet6", "kaoyan", "toefl", "ielts"],
  },
  "t-shirt": {
    translation: "n. T恤衫, 短袖汗衫",
    phonetic: "/ˈtiː ʃɜːt/",
    pos: "n.",
    definition: "a short-sleeved casual top with a T-shaped outline",
    frequency: 4000,
    tags: ["zk", "gk"],
  },
  "telecommunication": {
    translation: "n. 电信, 远程通信, 电讯",
    phonetic: "/ˌtelɪkəˌmjuːnɪˈkeɪʃən/",
    pos: "n.",
    definition: "communication over a distance by electronic means such as telephone, radio, or television",
    frequency: 3000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "theatre": {
    translation: "n. 剧院, 戏院, 电影院, 戏剧",
    phonetic: "/ˈθɪətə/",
    pos: "n.",
    definition: "a building for performing plays; the art or profession of dramatic performance",
    frequency: 5000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "tokenization": {
    translation: "n. 分词, 标记化",
    phonetic: "/ˌtəʊkənaɪˈzeɪʃən/",
    pos: "n.",
    definition: "the process of breaking text into smaller units called tokens for natural language processing",
    frequency: 400,
    tags: [],
  },
  "tokenizer": {
    translation: "n. 分词器, 标记器",
    phonetic: "/ˈtəʊkənaɪzə/",
    pos: "n.",
    definition: "a component that splits text into tokens for processing by a language model",
    frequency: 400,
    tags: [],
  },
  "ton": {
    translation: "n. 吨, 大量",
    phonetic: "/tʌn/",
    pos: "n.",
    definition: "a unit of weight equal to 2,000 pounds (short ton) or 2,240 pounds (long ton)",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "towards": {
    translation: "prep. 向, 朝, 对于, 为了",
    phonetic: "/təˈwɔːdz/",
    pos: "prep.",
    definition: "in the direction of; with regard to",
    frequency: 6000,
    tags: ["zk", "gk", "cet4", "kaoyan"],
  },
  "trolleybus": {
    translation: "n. 无轨电车",
    phonetic: "/ˈtrɒlibʌs/",
    pos: "n.",
    definition: "a bus powered by electricity from overhead wires",
    frequency: 2000,
    tags: ["gk"],
  },
  "tumour": {
    translation: "n. 肿瘤, 肿块",
    phonetic: "/ˈtjuːmə/",
    pos: "n.",
    definition: "a swelling of a part of the body caused by abnormal cell growth",
    frequency: 3000,
    tags: ["cet6", "kaoyan", "toefl", "ielts"],
  },
  "tyre": {
    translation: "n. 轮胎, 车胎",
    phonetic: "/ˈtaɪə/",
    pos: "n.",
    definition: "a rubber covering around a wheel, providing traction and cushioning",
    frequency: 3000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "underfitting": {
    translation: "n. 欠拟合",
    phonetic: "/ˌʌndəˈfɪtɪŋ/",
    pos: "n.",
    definition: "a modeling error where a model is too simple to capture the underlying patterns in the data",
    frequency: 400,
    tags: [],
  },
  "up-to-date": {
    translation: "a. 最新的, 现代的, 时新的",
    phonetic: "/ˌʌptəˈdeɪt/",
    pos: "a.",
    definition: "incorporating the latest information or developments",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "upside-down": {
    translation: "adv. 颠倒地, 倒置地",
    phonetic: "/ˌʌpsaɪdˈdaʊn/",
    pos: "adv.",
    definition: "with the top part underneath; in an inverted position",
    frequency: 3000,
    tags: ["gk", "cet4"],
  },
  "vapour": {
    translation: "n. 蒸汽, 水汽, 雾气",
    phonetic: "/ˈveɪpə/",
    pos: "n.",
    definition: "a substance in its gaseous state, especially when diffused at ordinary temperatures",
    frequency: 3000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "vcd": {
    translation: "abbr. 影碟光盘 (video compact disc)",
    phonetic: "/ˌviː siː ˈdiː/",
    pos: "abbr.",
    definition: "a compact disc that stores video and audio data",
    frequency: 2000,
    tags: ["zk", "gk"],
  },
  "volt": {
    translation: "n. 伏特, 伏",
    phonetic: "/vəʊlt/",
    pos: "n.",
    definition: "the unit of electric potential and electromotive force",
    frequency: 3000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "waggon": {
    translation: "n. 四轮马车, 货车, 手推车",
    phonetic: "/ˈwæɡən/",
    pos: "n.",
    definition: "a four-wheeled vehicle for transporting goods, drawn by animals",
    frequency: 2000,
    tags: ["cet4", "cet6"],
  },
  "waiting-room": {
    translation: "n. 候车室, 等候室, 候诊室",
    phonetic: "/ˈweɪtɪŋ ruːm/",
    pos: "n.",
    definition: "a room where people wait, as at a station or doctor's office",
    frequency: 2000,
    tags: ["gk", "cet4"],
  },
  "watt": {
    translation: "n. 瓦特, 瓦",
    phonetic: "/wɒt/",
    pos: "n.",
    definition: "the unit of electric power equal to one joule per second",
    frequency: 3000,
    tags: ["cet4", "cet6", "kaoyan"],
  },
  "webhook": {
    translation: "n. 网络钩子",
    phonetic: "/ˈwebhʊk/",
    pos: "n.",
    definition: "an HTTP callback that is triggered by a specific event and sends data to a server",
    frequency: 400,
    tags: [],
  },
  "well-known": {
    translation: "a. 著名的, 众所周知的",
    phonetic: "/ˌwelˈnəʊn/",
    pos: "a.",
    definition: "known by many people; familiar or famous",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "westwards": {
    translation: "adv. 向西",
    phonetic: "/ˈwestwədz/",
    pos: "adv.",
    definition: "in or toward the west",
    frequency: 2000,
    tags: [],
  },
  "world-wide": {
    translation: "a. 全世界的, 世界范围的, 国际的",
    phonetic: "/ˌwɜːldˈwaɪd/",
    pos: "a.",
    definition: "extending throughout the world; global",
    frequency: 3000,
    tags: ["gk", "cet4", "kaoyan"],
  },
  "x-ray": {
    translation: "n. X射线, X光, X光照片\nvt. 用X光检查",
    phonetic: "/ˈeks reɪ/",
    pos: "n.",
    definition: "a form of electromagnetic radiation used to create images of the inside of the body",
    frequency: 4000,
    tags: ["gk", "cet4", "cet6", "kaoyan"],
  },
  "zero-shot": {
    translation: "a. 零样本的, 零示例的",
    phonetic: "/ˈzɪərəʊ ʃɒt/",
    pos: "a.",
    definition: "a prompt technique where a model performs a task without any provided examples",
    frequency: 300,
    tags: [],
  },
};

/** Build a dict entry object with a stable field order. */
function buildEntry(word, data) {
  const entry = {
    word: word,
    translation: data.translation,
  };
  if (data.phonetic !== undefined) entry.phonetic = data.phonetic;
  if (data.pos !== undefined) entry.pos = data.pos;
  if (data.definition !== undefined) entry.definition = data.definition;
  if (data.frequency !== undefined) entry.frequency = data.frequency;
  if (data.tags !== undefined && data.tags.length > 0) entry.tags = data.tags;
  return entry;
}

function main() {
  // 1. Read missing words
  const rawText = readFileSync(MISSING_WORDS_FILE, "utf8");
  const rawWords = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  console.log(`[patch] Read ${rawWords.length} missing words from ${MISSING_WORDS_FILE}`);

  // 2. Normalize each word and look up translation data; group by slice key
  const groups = new Map(); // sliceKey -> [{ word, data }]
  let missing = 0;
  for (const raw of rawWords) {
    const word = normalizeWord(raw);
    const data = WORD_DATA[word];
    if (!data) {
      console.warn(`[patch] WARNING: no translation data for word: "${word}" (raw: "${raw}")`);
      missing++;
      continue;
    }
    const key = sliceKey(word);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ word, data });
  }

  if (missing > 0) {
    console.warn(`[patch] ${missing} words had no translation data and were skipped.`);
  }

  // 3. For each group, read the slice file, append new entries (dedup by word),
  //    sort by frequency descending, write back compact JSON.
  let added = 0;
  let skipped = 0;
  for (const [key, items] of groups) {
    const letter = key[0];
    const dir = join(DICT_DIR, letter);
    const file = join(dir, `${key}.json`);
    mkdirSync(dir, { recursive: true });

    let existing = [];
    if (existsSync(file)) {
      try {
        const raw = readFileSync(file, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existing = parsed;
      } catch (err) {
        console.warn(`[patch] WARNING: failed to parse ${file}, treating as empty. (${err.message})`);
      }
    }

    const existingWords = new Set(existing.map((e) => e.word));
    for (const { word, data } of items) {
      if (existingWords.has(word)) {
        skipped++;
        continue;
      }
      existing.push(buildEntry(word, data));
      existingWords.add(word);
      added++;
    }

    // Sort by frequency descending
    existing.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));

    writeFileSync(file, JSON.stringify(existing), "utf8");
  }

  console.log(`[patch] Dict slices: ${added} words added, ${skipped} skipped (already present).`);

  // 4. Update search-index.json (flat array of {word, frequency})
  let index = [];
  if (existsSync(SEARCH_INDEX_FILE)) {
    try {
      const raw = readFileSync(SEARCH_INDEX_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) index = parsed;
    } catch (err) {
      console.warn(`[patch] WARNING: failed to parse ${SEARCH_INDEX_FILE}, treating as empty. (${err.message})`);
    }
  }

  const indexKeys = new Set(index.map((e) => e.word.toLowerCase()));
  let indexAdded = 0;
  for (const items of groups.values()) {
    for (const { word, data } of items) {
      const lk = word.toLowerCase();
      if (indexKeys.has(lk)) continue;
      index.push({ word, frequency: data.frequency ?? 0 });
      indexKeys.add(lk);
      indexAdded++;
    }
  }

  // Sort by frequency descending (matching build-search-index.ts)
  index.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  writeFileSync(SEARCH_INDEX_FILE, JSON.stringify(index), "utf8");

  console.log(`[patch] search-index.json: ${indexAdded} new entries added (total: ${index.length}).`);
  console.log("[patch] Done.");
}

main();
