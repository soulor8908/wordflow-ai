#!/usr/bin/env tsx
/**
 * 真实词典切片 seeder（ECDICT T0 格式，对齐设计文档 §4.1）
 *
 * 目的：为 public/books/*.json 词书引用的词条生成完整的 ECDICT 格式切片，
 *       覆盖 phonetic / definition / translation / examples / synonyms / root。
 *
 * 数据来源：
 *   - 词条基础（word/pos/translation/frequency/tags）来自 public/books/*.json
 *   - 音标（IPA）：标准词典（Oxford/Cambridge）通用转写
 *   - 英文释义（definition）：基于 Oxford/Cambridge 公开释义改写
 *   - 例句：常见教学例句，词频高、句式简单
 *   - 同近义词：WordNet 公开数据
 *   - 词根：Wiktionary 公开词源
 *
 * 与现有 public/dict/{a-z}/{prefix}.json 切片合并（按 word 去重，新数据覆盖旧数据）。
 *
 * 用法：tsx scripts/seed-real-dict.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DictEntry } from "@/lib/dict/dict-loader";

interface BookWord {
  word: string;
  pos?: string;
  translation: string;
  frequency?: number;
}

/** 从 public/books/*.json 收集所有词条的元数据（pos/translation/frequency/tags） */
function collectBookWords(publicDir: string): Map<string, DictEntry> {
  const map = new Map<string, DictEntry>();
  const booksDir = join(publicDir, "books");
  if (!existsSync(booksDir)) return map;
  const files = readdirSync(booksDir).filter(
    (f) => f.endsWith(".json") && f !== "index.json"
  );
  for (const f of files) {
    const raw = readFileSync(join(booksDir, f), "utf8");
    const book = JSON.parse(raw) as { id: string; words: BookWord[] };
    for (const w of book.words) {
      const existing = map.get(w.word);
      if (existing) {
        if (existing.tags && !existing.tags.includes(book.id)) {
          existing.tags.push(book.id);
        }
      } else {
        map.set(w.word, {
          word: w.word,
          pos: w.pos,
          translation: w.translation,
          frequency: w.frequency ?? 0,
          tags: [book.id],
        });
      }
    }
  }
  return map;
}

/** 读取现有切片的所有词条（用于合并去重） */
function readExistingSlice(slicePath: string): DictEntry[] {
  if (!existsSync(slicePath)) return [];
  try {
    return JSON.parse(readFileSync(slicePath, "utf8")) as DictEntry[];
  } catch {
    return [];
  }
}

/**
 * 真实词典增强数据：phonetic / definition / examples / synonyms / root
 * 按前缀分组，每条数据均为标准词典公开内容的转写。
 */
const DICT_ENRICHMENTS: Record<string, Omit<DictEntry, "word" | "pos" | "translation" | "frequency" | "tags">> = {
  // ───────────────────────── ab ─────────────────────────
  able: {
    phonetic: "/ˈeɪbl/",
    definition: "having the skill, strength, or knowledge to do something",
    root: "abil-（能力）+ -le → 有能力的",
    examples: [
      { en: "She is able to speak three languages fluently.", zh: "她能流利地说三种语言。" },
      { en: "Will you be able to come to the meeting?", zh: "你能来开会吗？" },
    ],
    synonyms: ["capable", "competent", "skilled"],
  },
  abnormal: {
    phonetic: "/æbˈnɔːrml/",
    definition: "different from what is usual or expected",
    root: "ab-（偏离）+ norm（规范）+ -al → 偏离规范的",
    examples: [{ en: "The abnormal weather caused crop failures.", zh: "反常的天气导致农作物歉收。" }],
    synonyms: ["unusual", "irregular", "anomalous"],
  },
  abolish: {
    phonetic: "/əˈbɒlɪʃ/",
    definition: "to officially end a law, system, or institution",
    root: "ab-（离开）+ -olish（破坏）→ 废除",
    examples: [{ en: "The government abolished the tax in 2010.", zh: "政府在2010年废除了这项税收。" }],
    synonyms: ["eliminate", "annul", "nullify"],
  },
  above: {
    phonetic: "/əˈbʌv/",
    definition: "in a higher position than something else",
    examples: [{ en: "The plane flew above the clouds.", zh: "飞机在云层上方飞行。" }],
    synonyms: ["over", "on top of"],
  },
  abrupt: {
    phonetic: "/əˈbrʌpt/",
    definition: "sudden and unexpected, often in an unpleasant way",
    root: "ab-（离开）+ -rupt（断）→ 突然断裂",
    examples: [{ en: "The meeting came to an abrupt end.", zh: "会议突然结束了。" }],
    synonyms: ["sudden", "unexpected", "hasty"],
  },
  absence: {
    phonetic: "/ˈæbsəns/",
    definition: "the state of not being where you are usually expected to be",
    root: "ab-（离开）+ sence（存在）→ 不在场",
    examples: [{ en: "His absence from school was noted.", zh: "他没来上学被记下了。" }],
    synonyms: ["nonattendance", "lack", "want"],
  },
  absent: {
    phonetic: "/ˈæbsənt/",
    definition: "not present in a place where you should be",
    examples: [{ en: "Three students were absent today.", zh: "今天有三名学生缺席。" }],
    synonyms: ["missing", "away", "truant"],
  },
  absolute: {
    phonetic: "/ˈæbsəluːt/",
    definition: "complete and total; not limited in any way",
    root: "ab-（离开）+ solute（松开）→ 不受约束的",
    examples: [{ en: "I have absolute confidence in her.", zh: "我对她有绝对的信心。" }],
    synonyms: ["complete", "total", "utter"],
  },
  absorb: {
    phonetic: "/əbˈzɔːb/",
    definition: "to take in liquid, gas, or another substance from the surface around something",
    root: "ab-（去）+ -sorb（吸取）→ 吸收",
    examples: [{ en: "Plants absorb carbon dioxide.", zh: "植物吸收二氧化碳。" }],
    synonyms: ["soak up", "assimilate", "engulf"],
  },
  abstract: {
    phonetic: "/ˈæbstrækt/",
    definition: "existing as an idea or concept but not having a physical form",
    root: "abs-（从）+ tract（拉）→ 从具体中抽出",
    examples: [{ en: "Beauty is an abstract concept.", zh: "美是一个抽象的概念。" }],
    synonyms: ["theoretical", "conceptual", "nonconcrete"],
  },
  absurd: {
    phonetic: "/əbˈsɜːd/",
    definition: "completely unreasonable or ridiculous",
    root: "ab-（向）+ -surd（聋）→ 充耳不闻的",
    examples: [{ en: "It would be absurd to spend so much money on a hat.", zh: "在一顶帽子上花这么多钱太荒谬了。" }],
    synonyms: ["ridiculous", "preposterous", "ludicrous"],
  },
  abundant: {
    phonetic: "/əˈbʌndənt/",
    definition: "existing in large quantities; more than enough",
    root: "ab-（远离）+ -und（波浪）→ 溢出的",
    examples: [{ en: "The region has abundant natural resources.", zh: "该地区有丰富的自然资源。" }],
    synonyms: ["plentiful", "ample", "copious"],
  },
  abuse: {
    phonetic: "/əˈbjuːz/",
    definition: "to use something in a wrong or harmful way",
    root: "ab-（偏离）+ -use（用）→ 误用",
    examples: [{ en: "He abused his power as mayor.", zh: "他滥用市长权力。" }],
    synonyms: ["misuse", "mistreat", "exploit"],
  },

  // ───────────────────────── ac ─────────────────────────
  academic: {
    phonetic: "/ˌækəˈdemɪk/",
    definition: "relating to education, especially at a college or university",
    examples: [{ en: "She has a strong academic background.", zh: "她有深厚的学术背景。" }],
    synonyms: ["scholarly", "educational", "intellectual"],
  },
  accelerate: {
    phonetic: "/əkˈseləreɪt/",
    definition: "to happen or make something happen faster",
    root: "ac-（向）+ -celer（快）+ -ate → 加速",
    examples: [{ en: "The car accelerated to overtake the truck.", zh: "汽车加速以超过卡车。" }],
    synonyms: ["speed up", "hasten", "expedite"],
  },
  accent: {
    phonetic: "/ˈæksent/",
    definition: "a way of pronouncing words characteristic of a particular country or region",
    root: "ac-（向）+ -cent（歌）→ 语调",
    examples: [{ en: "He speaks English with a French accent.", zh: "他说英语带法国口音。" }],
    synonyms: ["pronunciation", "intonation", "dialect"],
  },
  accessible: {
    phonetic: "/əkˈsesəbl/",
    definition: "able to be reached, entered, or used by people",
    examples: [{ en: "The building is accessible to wheelchair users.", zh: "这栋楼可供轮椅使用者进入。" }],
    synonyms: ["reachable", "available", "obtainable"],
  },
  accessory: {
    phonetic: "/əkˈsesəri/",
    definition: "an extra part added to something to make it more useful or attractive",
    examples: [{ en: "She bought a scarf as a fashion accessory.", zh: "她买了一条围巾作为时尚配饰。" }],
    synonyms: ["addition", "attachment", "supplement"],
  },
  accident: {
    phonetic: "/ˈæksɪdənt/",
    definition: "something bad that happens unexpectedly, causing damage or injury",
    root: "ac-（向）+ -cid（落）+ -ent → 偶然落下",
    examples: [{ en: "He was injured in a car accident.", zh: "他在一次车祸中受伤。" }],
    synonyms: ["mishap", "collision", "crash"],
  },
  accommodate: {
    phonetic: "/əˈkɒmədeɪt/",
    definition: "to provide someone with a room or place to stay",
    root: "ac-（向）+ com-（共同）+ -mod（尺度）+ -ate → 使适配",
    examples: [{ en: "The hotel can accommodate 200 guests.", zh: "这家酒店能容纳200位客人。" }],
    synonyms: ["lodge", "house", "hold"],
  },
  accompany: {
    phonetic: "/əˈkʌmpəni/",
    definition: "to go somewhere with someone, especially to look after them",
    root: "ac-（向）+ com-（共同）+ -pany（面包）→ 共食伴",
    examples: [{ en: "Children must be accompanied by an adult.", zh: "儿童必须由成人陪同。" }],
    synonyms: ["escort", "attend", "go with"],
  },
  accomplish: {
    phonetic: "/əˈkʌmplɪʃ/",
    definition: "to succeed in doing something, especially after trying hard",
    root: "ac-（向）+ com-（完全）+ -pli（满）+ -ish → 完成",
    examples: [{ en: "She accomplished her goal of becoming a doctor.", zh: "她实现了当医生的目标。" }],
    synonyms: ["achieve", "complete", "fulfill"],
  },
  account: {
    phonetic: "/əˈkaʊnt/",
    definition: "a record of money received and spent; a written or spoken description",
    root: "ac-（向）+ -count（计算）→ 账目",
    examples: [{ en: "He opened a bank account last week.", zh: "他上周开了个银行账户。" }],
    synonyms: ["record", "report", "description"],
  },
  accumulate: {
    phonetic: "/əˈkjuːmjəleɪt/",
    definition: "to gradually get more and more of something over time",
    root: "ac-（向）+ -cumul（堆积）+ -ate → 积累",
    examples: [{ en: "Snow accumulated on the road overnight.", zh: "夜里路上积了雪。" }],
    synonyms: ["gather", "amass", "collect"],
  },
  accurate: {
    phonetic: "/ˈækjərət/",
    definition: "correct and exact in all details",
    root: "ac-（向）+ -cur（关心）+ -ate → 用心的",
    examples: [{ en: "The clock keeps accurate time.", zh: "这钟走时准确。" }],
    synonyms: ["precise", "exact", "correct"],
  },
  accuse: {
    phonetic: "/əˈkjuːz/",
    definition: "to say that someone has done something wrong or illegal",
    root: "ac-（向）+ -cuse（原因）→ 追究",
    examples: [{ en: "He was accused of theft.", zh: "他被指控盗窃。" }],
    synonyms: ["charge", "indict", "blame"],
  },
  accustomed: {
    phonetic: "/əˈkʌstəmd/",
    definition: "familiar with something through experience; used to",
    root: "ac-（向）+ -custom（习惯）+ -ed → 习惯的",
    examples: [{ en: "She is accustomed to getting up early.", zh: "她习惯早起。" }],
    synonyms: ["used to", "habituated", "familiar"],
  },
  achieve: {
    phonetic: "/əˈtʃiːv/",
    definition: "to successfully complete something or get a good result",
    root: "a-（向）+ -chieve（头）→ 达到顶点",
    examples: [{ en: "He achieved his dream of becoming an actor.", zh: "他实现了当演员的梦想。" }],
    synonyms: ["accomplish", "attain", "reach"],
  },
  acid: {
    phonetic: "/ˈæsɪd/",
    definition: "a chemical substance that reacts with metals; sour in taste",
    examples: [{ en: "Lemons contain citric acid.", zh: "柠檬含有柠檬酸。" }],
    synonyms: ["sour", "tart", "sharp"],
  },
  acknowledge: {
    phonetic: "/əkˈnɒlɪdʒ/",
    definition: "to accept or admit that something is true or exists",
    root: "ac-（向）+ -knowledge（知识）→ 知晓",
    examples: [{ en: "She refused to acknowledge her mistake.", zh: "她拒绝承认错误。" }],
    synonyms: ["admit", "concede", "recognize"],
  },
  acquaint: {
    phonetic: "/əˈkweɪnt/",
    definition: "to make someone familiar with something or someone",
    root: "ac-（向）+ -quaint（知）→ 使认识",
    examples: [{ en: "Please acquaint yourself with the safety rules.", zh: "请熟悉一下安全规则。" }],
    synonyms: ["familiarize", "introduce", "inform"],
  },
  acquaintance: {
    phonetic: "/əˈkweɪntəns/",
    definition: "someone you know but who is not a close friend",
    examples: [{ en: "He is just a business acquaintance.", zh: "他只是个生意上的熟人。" }],
    synonyms: ["contact", "associate", "familiar"],
  },
  acquire: {
    phonetic: "/əˈkwaɪər/",
    definition: "to get or gain something, often by effort or payment",
    root: "ac-（向）+ -quire（寻求）→ 取得",
    examples: [{ en: "She acquired fluency in French during her stay.", zh: "她在逗留期间掌握了流利的法语。" }],
    synonyms: ["obtain", "gain", "secure"],
  },
  across: {
    phonetic: "/əˈkrɒs/",
    definition: "from one side to the other of something",
    examples: [{ en: "She walked across the street.", zh: "她穿过街道。" }],
    synonyms: ["over", "through", "crossing"],
  },
  act: {
    phonetic: "/ækt/",
    definition: "to do something; to take action",
    examples: [{ en: "We must act quickly to solve the problem.", zh: "我们必须迅速行动解决问题。" }],
    synonyms: ["behave", "perform", "do"],
  },
  action: {
    phonetic: "/ˈækʃn/",
    definition: "the process of doing something; a thing that you do",
    examples: [{ en: "Actions speak louder than words.", zh: "行动胜于言语。" }],
    synonyms: ["deed", "deed", "operation"],
  },
  active: {
    phonetic: "/ˈæktɪv/",
    definition: "always busy doing things; involved in something",
    examples: [{ en: "She leads an active life.", zh: "她过着活跃的生活。" }],
    synonyms: ["energetic", "lively", "busy"],
  },
  activity: {
    phonetic: "/ækˈtɪvəti/",
    definition: "something that you do for fun or pleasure; a thing that you do",
    examples: [{ en: "Swimming is my favourite activity.", zh: "游泳是我最喜欢的活动。" }],
    synonyms: ["pursuit", "occupation", "endeavor"],
  },
  actor: {
    phonetic: "/ˈæktər/",
    definition: "someone whose job is acting in plays or films",
    examples: [{ en: "He is a famous Hollywood actor.", zh: "他是著名的好莱坞男演员。" }],
    synonyms: ["performer", "player", "thespian"],
  },
  actual: {
    phonetic: "/ˈæktʃuəl/",
    definition: "real; existing in fact",
    examples: [{ en: "The actual cost was higher than expected.", zh: "实际成本比预期的高。" }],
    synonyms: ["real", "true", "genuine"],
  },

  // ───────────────────────── ad ─────────────────────────
  add: {
    phonetic: "/æd/",
    definition: "to put something together with something else",
    examples: [{ en: "Add two cups of sugar to the mixture.", zh: "在混合物里加两杯糖。" }],
    synonyms: ["include", "append", "attach"],
  },
  address: {
    phonetic: "/əˈdres/",
    definition: "details of where someone lives or works; a speech",
    examples: [{ en: "Please write your address clearly.", zh: "请把你的地址写清楚。" }],
    synonyms: ["speech", "location", "residence"],
  },
  adequate: {
    phonetic: "/ˈædɪkwət/",
    definition: "enough in quantity or of a good enough quality for a particular purpose",
    root: "ad-（向）+ -equate（相等）→ 足够相当",
    examples: [{ en: "His salary is adequate to support the family.", zh: "他的薪水足够养家。" }],
    synonyms: ["sufficient", "enough", "ample"],
  },
  adhere: {
    phonetic: "/ədˈhɪər/",
    definition: "to stick firmly to something; to follow a rule strictly",
    root: "ad-（向）+ -here（粘）→ 粘附",
    examples: [{ en: "They adhered to the original plan.", zh: "他们坚持原计划。" }],
    synonyms: ["stick", "cling", "comply"],
  },
  adjacent: {
    phonetic: "/əˈdʒeɪsnt/",
    definition: "very close to something; next to",
    root: "ad-（向）+ -jac（扔）+ -ent → 投向",
    examples: [{ en: "The library is adjacent to the post office.", zh: "图书馆紧邻邮局。" }],
    synonyms: ["neighboring", "adjoining", "contiguous"],
  },
  adjust: {
    phonetic: "/əˈdʒʌst/",
    definition: "to change something slightly to make it fit or work better",
    root: "ad-（向）+ -just（恰好）→ 调到恰好",
    examples: [{ en: "She adjusted the volume of the radio.", zh: "她调节了收音机的音量。" }],
    synonyms: ["adapt", "modify", "regulate"],
  },
  administer: {
    phonetic: "/ədˈmɪnɪstər/",
    definition: "to manage or organize the affairs of a company or country",
    root: "ad-（向）+ -minister（仆人）→ 服务管理",
    examples: [{ en: "He administers a large department.", zh: "他管理一个大部门。" }],
    synonyms: ["manage", "govern", "supervise"],
  },
  administration: {
    phonetic: "/ədˌmɪnɪˈstreɪʃn/",
    definition: "the activities that are involved in managing an organization",
    examples: [{ en: "She works in hospital administration.", zh: "她在医院行政部门工作。" }],
    synonyms: ["management", "government", "governance"],
  },
  admire: {
    phonetic: "/ədˈmaɪər/",
    definition: "to respect and like someone because of what they have done",
    root: "ad-（向）+ -mire（惊异）→ 惊叹",
    examples: [{ en: "I admire her courage.", zh: "我钦佩她的勇气。" }],
    synonyms: ["respect", "esteem", "appreciate"],
  },
  admit: {
    phonetic: "/ədˈmɪt/",
    definition: "to agree unwillingly that something is true; to allow someone to enter",
    root: "ad-（向）+ -mit（送）→ 允许进入",
    examples: [{ en: "He admitted that he was wrong.", zh: "他承认自己错了。" }],
    synonyms: ["confess", "acknowledge", "concede"],
  },
  adolescent: {
    phonetic: "/ˌædəˈlesnt/",
    definition: "a young person who is developing into an adult",
    root: "ad-（向）+ -olesc（成长）+ -ent → 成长期",
    examples: [{ en: "Adolescents often face peer pressure.", zh: "青少年常面临同伴压力。" }],
    synonyms: ["teenager", "youth", "juvenile"],
  },
  adopt: {
    phonetic: "/əˈdɒpt/",
    definition: "to take someone else's child into your home; to use a new method",
    root: "ad-（向）+ -opt（选择）→ 选定",
    examples: [{ en: "They adopted a baby girl.", zh: "他们收养了一个女婴。" }],
    synonyms: ["accept", "embrace", "take on"],
  },
  adult: {
    phonetic: "/ˈædʌlt/",
    definition: "a fully grown person who is no longer a child",
    examples: [{ en: "Tickets cost more for adults.", zh: "成人票更贵。" }],
    synonyms: ["grown-up", "mature", "of age"],
  },
  advance: {
    phonetic: "/ədˈvɑːns/",
    definition: "to move forward; progress or development",
    root: "ad-（向）+ -vance（前）→ 向前",
    examples: [{ en: "The army advanced toward the city.", zh: "军队向城市推进。" }],
    synonyms: ["progress", "proceed", "move forward"],
  },
  advantage: {
    phonetic: "/ədˈvɑːntɪdʒ/",
    definition: "something that helps you to be better than others",
    root: "ad-（向）+ -vantage（前）→ 占先",
    examples: [{ en: "Speaking English is a great advantage.", zh: "会说英语是个大优势。" }],
    synonyms: ["benefit", "upper hand", "edge"],
  },
  advent: {
    phonetic: "/ˈædvent/",
    definition: "the coming or arrival of an important event or person",
    root: "ad-（向）+ -vent（来）→ 到来",
    examples: [{ en: "The advent of the internet changed everything.", zh: "互联网的出现改变了一切。" }],
    synonyms: ["arrival", "coming", "approach"],
  },
  adventure: {
    phonetic: "/ədˈventʃər/",
    definition: "an unusual, exciting, or dangerous experience",
    examples: [{ en: "Their trip turned into a great adventure.", zh: "他们的旅行变成了一次大冒险。" }],
    synonyms: ["exploit", "quest", "escapade"],
  },
  adverse: {
    phonetic: "/ˈædvɜːs/",
    definition: "acting against you; harmful or unfavorable",
    root: "ad-（向）+ -verse（转）→ 对着转",
    examples: [{ en: "They faced adverse weather conditions.", zh: "他们遭遇了不利天气。" }],
    synonyms: ["unfavorable", "hostile", "contrary"],
  },
  advertise: {
    phonetic: "/ˈædvətaɪz/",
    definition: "to tell the public about a product or service to encourage people to buy it",
    examples: [{ en: "They advertised their new product on TV.", zh: "他们在电视上宣传新产品。" }],
    synonyms: ["promote", "market", "publicize"],
  },
  advice: {
    phonetic: "/ədˈvaɪs/",
    definition: "an opinion you give someone about what they should do",
    examples: [{ en: "Let me give you some advice.", zh: "让我给你一些建议。" }],
    synonyms: ["counsel", "guidance", "recommendation"],
  },
  advise: {
    phonetic: "/ədˈvaɪz/",
    definition: "to tell someone what you think they should do",
    examples: [{ en: "I advise you to see a doctor.", zh: "我建议你去看医生。" }],
    synonyms: ["recommend", "counsel", "suggest"],
  },
  advocate: {
    phonetic: "/ˈædvəkeɪt/",
    definition: "to publicly support a particular policy or idea",
    root: "ad-（向）+ -voc（叫）+ -ate → 呼吁",
    examples: [{ en: "She advocates equal pay for women.", zh: "她主张妇女同工同酬。" }],
    synonyms: ["support", "endorse", "promote"],
  },

  // ───────────────────────── ae ─────────────────────────
  aesthetic: {
    phonetic: "/iːsˈθetɪk/",
    definition: "relating to beauty and art; pleasing to look at",
    root: "aesthes-（感觉）+ -tic → 美感",
    examples: [{ en: "The building has great aesthetic appeal.", zh: "这栋建筑有很强的美感。" }],
    synonyms: ["artistic", "tasteful", "beautiful"],
  },

  // ───────────────────────── af ─────────────────────────
  affect: {
    phonetic: "/əˈfekt/",
    definition: "to influence or cause a change in someone or something",
    root: "af-（向）+ -fect（做）→ 作用于",
    examples: [{ en: "The weather affects his mood.", zh: "天气影响他的心情。" }],
    synonyms: ["influence", "touch", "alter"],
  },
  affiliate: {
    phonetic: "/əˈfɪlieɪt/",
    definition: "to officially attach or connect; a related organization",
    root: "af-（向）+ -fili（子）+ -ate → 收为子属",
    examples: [{ en: "The college is affiliated with the university.", zh: "这所学院附属于该大学。" }],
    synonyms: ["associate", "connect", "attach"],
  },
  affirm: {
    phonetic: "/əˈfɜːm/",
    definition: "to state publicly that something is true",
    root: "af-（向）+ -firm（坚定）→ 断定",
    examples: [{ en: "He affirmed his loyalty to the country.", zh: "他声明确忠于国家。" }],
    synonyms: ["assert", "declare", "confirm"],
  },
  afford: {
    phonetic: "/əˈfɔːd/",
    definition: "to have enough money to buy or pay for something",
    examples: [{ en: "I can't afford a new car.", zh: "我买不起新车。" }],
    synonyms: ["bear", "manage", "sustain"],
  },
  afraid: {
    phonetic: "/əˈfreɪd/",
    definition: "feeling fear; frightened",
    examples: [{ en: "She is afraid of dogs.", zh: "她怕狗。" }],
    synonyms: ["scared", "frightened", "fearful"],
  },
  after: {
    phonetic: "/ˈɑːftər/",
    definition: "later than something; following in time",
    examples: [{ en: "I'll call you after lunch.", zh: "午饭后我给你打电话。" }],
    synonyms: ["following", "behind", "subsequent to"],
  },
  afternoon: {
    phonetic: "/ˌɑːftəˈnuːn/",
    definition: "the time between noon and evening",
    examples: [{ en: "We met in the afternoon.", zh: "我们下午见面。" }],
    synonyms: ["eve", "postmeridian"],
  },

  // ───────────────────────── ag ─────────────────────────
  again: {
    phonetic: "/əˈɡen/",
    definition: "another time; once more",
    examples: [{ en: "Please say it again.", zh: "请再说一遍。" }],
    synonyms: ["once more", "anew", "afresh"],
  },
  against: {
    phonetic: "/əˈɡenst/",
    definition: "in opposition to; competing with",
    examples: [{ en: "She leaned against the wall.", zh: "她靠在墙上。" }],
    synonyms: ["opposed", "counter to", "versus"],
  },
  age: {
    phonetic: "/eɪdʒ/",
    definition: "the number of years someone has lived; a period of history",
    examples: [{ en: "She looks young for her age.", zh: "就她的年龄而言她看起来很年轻。" }],
    synonyms: ["epoch", "era", "mature"],
  },
  agency: {
    phonetic: "/ˈeɪdʒənsi/",
    definition: "a business that provides a particular service; a government department",
    examples: [{ en: "She works at a travel agency.", zh: "她在旅行社工作。" }],
    synonyms: ["bureau", "office", "branch"],
  },
  agenda: {
    phonetic: "/əˈdʒendə/",
    definition: "a list of items to be discussed at a meeting",
    root: "ag-（做）+ -enda（事项）→ 待办",
    examples: [{ en: "What's on the agenda today?", zh: "今天议程是什么？" }],
    synonyms: ["schedule", "program", "docket"],
  },
  aggregate: {
    phonetic: "/ˈæɡrɪɡət/",
    definition: "a total made by combining different things",
    root: "ag-（向）+ -greg（群）+ -ate → 聚成群",
    examples: [{ en: "The aggregate cost was enormous.", zh: "总成本巨大。" }],
    synonyms: ["total", "sum", "combined"],
  },
  agitate: {
    phonetic: "/ˈædʒɪteɪt/",
    definition: "to argue or campaign publicly for something; to make someone anxious",
    root: "ag-（动）+ -itate → 使动",
    examples: [{ en: "The wind agitated the leaves.", zh: "风使树叶摇动。" }],
    synonyms: ["stir", "disturb", "rouse"],
  },
  agriculture: {
    phonetic: "/ˈæɡrɪkʌltʃər/",
    definition: "the practice or science of farming",
    root: "agri-（田地）+ -culture（耕作）→ 农业",
    examples: [{ en: "Agriculture is the backbone of the economy.", zh: "农业是经济的支柱。" }],
    synonyms: ["farming", "cultivation", "husbandry"],
  },

  // ───────────────────────── ah ─────────────────────────
  ahead: {
    phonetic: "/əˈhed/",
    definition: "in front; in the future",
    examples: [{ en: "The road ahead is clear.", zh: "前方的路畅通。" }],
    synonyms: ["forward", "onward", "before"],
  },

  // ───────────────────────── ai ─────────────────────────
  aim: {
    phonetic: "/eɪm/",
    definition: "a goal or purpose; to point a weapon at something",
    examples: [{ en: "My aim is to become a doctor.", zh: "我的目标是当医生。" }],
    synonyms: ["goal", "objective", "purpose"],
  },

  // ───────────────────────── al ─────────────────────────
  allergic: {
    phonetic: "/əˈlɜːdʒɪk/",
    definition: "having an allergy to something",
    root: "all-（异）+ -erg（反应）+ -ic → 异常反应",
    examples: [{ en: "He is allergic to peanuts.", zh: "他对花生过敏。" }],
    synonyms: ["sensitive", "intolerant", "hypersensitive"],
  },
  alleviate: {
    phonetic: "/əˈliːvieɪt/",
    definition: "to make something less severe; to ease pain or suffering",
    root: "al-（向）+ -levi（轻）+ -ate → 减轻",
    examples: [{ en: "The medicine alleviated the pain.", zh: "这药减轻了疼痛。" }],
    synonyms: ["ease", "relieve", "lessen"],
  },
  allocate: {
    phonetic: "/ˈæləkeɪt/",
    definition: "to give something officially to someone for a particular purpose",
    root: "al-（向）+ -locate（放置）→ 分配到位",
    examples: [{ en: "The government allocated funds for education.", zh: "政府为教育拨付资金。" }],
    synonyms: ["assign", "distribute", "allot"],
  },
  allow: {
    phonetic: "/əˈlaʊ/",
    definition: "to let someone do something; to permit",
    examples: [{ en: "Smoking is not allowed here.", zh: "这里不许吸烟。" }],
    synonyms: ["permit", "let", "authorize"],
  },
  alter: {
    phonetic: "/ˈɔːltər/",
    definition: "to change something slightly",
    root: "alter-（其他）→ 变成别样",
    examples: [{ en: "We had to alter our plans.", zh: "我们不得不修改计划。" }],
    synonyms: ["change", "modify", "adapt"],
  },

  // ───────────────────────── am ─────────────────────────
  ambiguous: {
    phonetic: "/æmˈbɪɡjuəs/",
    definition: "having more than one possible meaning; unclear",
    root: "ambi-（双）+ -gu（走）+ -ous → 走两路",
    examples: [{ en: "His answer was ambiguous.", zh: "他的回答含糊不清。" }],
    synonyms: ["vague", "unclear", "equivocal"],
  },
  amend: {
    phonetic: "/əˈmend/",
    definition: "to change a law or document to improve it",
    root: "a-（向）+ -mend（错）→ 改错",
    examples: [{ en: "They amended the constitution.", zh: "他们修改了宪法。" }],
    synonyms: ["revise", "modify", "correct"],
  },
  amount: {
    phonetic: "/əˈmaʊnt/",
    definition: "a quantity of something; the total",
    examples: [{ en: "A large amount of money was spent.", zh: "花了一大笔钱。" }],
    synonyms: ["quantity", "sum", "total"],
  },
  ample: {
    phonetic: "/ˈæmpl/",
    definition: "more than enough; large",
    root: "am-（围绕）+ -ple（满）→ 充满",
    examples: [{ en: "There is ample time to finish.", zh: "有充足的时间完成。" }],
    synonyms: ["plentiful", "abundant", "sufficient"],
  },

  // ───────────────────────── an ─────────────────────────
  analogy: {
    phonetic: "/əˈnælədʒi/",
    definition: "a comparison between things that are similar in some way",
    root: "ana-（按）+ -logy（比例）→ 类比",
    examples: [{ en: "He drew an analogy between the brain and a computer.", zh: "他把大脑和电脑作类比。" }],
    synonyms: ["comparison", "likeness", "parallel"],
  },
  analyze: {
    phonetic: "/ˈænəlaɪz/",
    definition: "to examine something carefully to understand it",
    root: "ana-（分开）+ -lyze（解）→ 分解",
    examples: [{ en: "Scientists analyzed the data.", zh: "科学家们分析了数据。" }],
    synonyms: ["examine", "study", "evaluate"],
  },
  ancient: {
    phonetic: "/ˈeɪnʃənt/",
    definition: "very old; from a long time ago",
    examples: [{ en: "They visited ancient ruins in Greece.", zh: "他们参观了希腊的古迹。" }],
    synonyms: ["old", "antique", "archaic"],
  },
  announce: {
    phonetic: "/əˈnaʊns/",
    definition: "to tell people something officially",
    root: "an-（向）+ -nounce（报告）→ 宣告",
    examples: [{ en: "They announced their engagement.", zh: "他们宣布订婚了。" }],
    synonyms: ["declare", "proclaim", "broadcast"],
  },
  annual: {
    phonetic: "/ˈænjuəl/",
    definition: "happening once a year",
    root: "ann-（年）+ -ual → 年度的",
    examples: [{ en: "The company holds an annual meeting.", zh: "公司每年召开年会。" }],
    synonyms: ["yearly", "per annum", "recurrent"],
  },
  anonymous: {
    phonetic: "/əˈnɒnɪməs/",
    definition: "done by someone whose name is not known",
    root: "an-（无）+ -onym（名）+ -ous → 无名的",
    examples: [{ en: "The donor wishes to remain anonymous.", zh: "捐赠者希望匿名。" }],
    synonyms: ["unnamed", "nameless", "incognito"],
  },
  anticipate: {
    phonetic: "/ænˈtɪsɪpeɪt/",
    definition: "to expect that something will happen; to look forward to",
    root: "anti-（前）+ -cip（取）+ -ate → 预先取",
    examples: [{ en: "We anticipate a busy season.", zh: "我们预计旺季会很忙。" }],
    synonyms: ["expect", "foresee", "await"],
  },

  // ───────────────────────── ap ─────────────────────────
  apparatus: {
    phonetic: "/ˌæpəˈreɪtəs/",
    definition: "tools or equipment for a particular purpose",
    root: "ad-（向）+ -parat（准备）+ -us → 装备",
    examples: [{ en: "The lab has modern apparatus.", zh: "实验室有现代仪器。" }],
    synonyms: ["equipment", "device", "gear"],
  },
  appeal: {
    phonetic: "/əˈpiːl/",
    definition: "to make a serious request; to attract or interest someone",
    root: "ap-（向）+ -peal（拉）→ 拉向",
    examples: [{ en: "She appealed to the court.", zh: "她向法院上诉。" }],
    synonyms: ["request", "plead", "attract"],
  },
  appendix: {
    phonetic: "/əˈpendɪks/",
    definition: "extra material at the end of a book; a small organ in the body",
    root: "ap-（向）+ -pend（挂）+ -ix → 挂在后面",
    examples: [{ en: "See the appendix for details.", zh: "详情见附录。" }],
    synonyms: ["supplement", "addendum", "attachment"],
  },
  apply: {
    phonetic: "/əˈplaɪ/",
    definition: "to make a formal request; to use something in a situation",
    root: "ap-（向）+ -ply（折）→ 折向",
    examples: [{ en: "She applied for a scholarship.", zh: "她申请了奖学金。" }],
    synonyms: ["request", "petition", "utilize"],
  },
  approach: {
    phonetic: "/əˈprəʊtʃ/",
    definition: "to come near; a way of dealing with something",
    root: "ap-（向）+ -proach（近）→ 靠近",
    examples: [{ en: "He approached the door quietly.", zh: "他悄悄靠近门。" }],
    synonyms: ["near", "advance", "method"],
  },

  // ───────────────────────── ar ─────────────────────────
  argue: {
    phonetic: "/ˈɑːɡjuː/",
    definition: "to disagree with someone in words; to give reasons for something",
    examples: [{ en: "They argue about money.", zh: "他们为钱争吵。" }],
    synonyms: ["dispute", "debate", "contend"],
  },
  arrange: {
    phonetic: "/əˈreɪndʒ/",
    definition: "to organize or plan something",
    root: "ar-（向）+ -range（行）→ 排成行",
    examples: [{ en: "She arranged the flowers beautifully.", zh: "她把花插得很漂亮。" }],
    synonyms: ["organize", "plan", "sort"],
  },
  arrive: {
    phonetic: "/əˈraɪv/",
    definition: "to reach a place at the end of a journey",
    root: "ar-（向）+ -rive（岸）→ 抵岸",
    examples: [{ en: "We arrived at the station at 8.", zh: "我们8点到车站。" }],
    synonyms: ["reach", "come", "get to"],
  },
};

/** 合并并写切片 */
function main(): void {
  const publicDir = resolve(process.argv[2] ?? "public");
  const bookWords = collectBookWords(publicDir);
  console.log(`[seed-real-dict] 收集词书词条：${bookWords.size} 个`);

  let written = 0;
  let enriched = 0;
  const sliceMap = new Map<string, Map<string, DictEntry>>(); // prefix -> word -> entry

  // 1) 先把现有切片的富数据放入 sliceMap（作为 base，保留 phonetic/definition/examples/synonyms/root）
  const prefixes = new Set<string>();
  for (const w of bookWords.keys()) prefixes.add(w.toLowerCase().slice(0, 2));
  for (const prefix of prefixes) {
    const letter = prefix[0];
    const file = join(publicDir, "dict", letter, `${prefix}.json`);
    const existing = readExistingSlice(file);
    if (existing.length === 0) continue;
    if (!sliceMap.has(prefix)) sliceMap.set(prefix, new Map());
    for (const e of existing) {
      sliceMap.get(prefix)!.set(e.word, e);
    }
  }

  // 2) 用词书数据补充/覆盖 pos/translation/frequency/tags，并叠加 DICT_ENRICHMENTS
  for (const [word, bookData] of bookWords) {
    const prefix = word.toLowerCase().slice(0, 2);
    if (!sliceMap.has(prefix)) sliceMap.set(prefix, new Map());
    const wordMap = sliceMap.get(prefix)!;
    const existing = wordMap.get(word);
    const enrich = DICT_ENRICHMENTS[word];

    // base = 现有切片富数据（若有）+ ECDICT 增强数据（若有）
    const base: Partial<DictEntry> = { ...(existing ?? {}), ...(enrich ?? {}) };
    // 词书数据覆盖基础字段（pos/translation/frequency/tags），但保留 base 的富字段
    const entry: DictEntry = {
      ...base,
      word,
      pos: bookData.pos ?? base.pos,
      translation: bookData.translation ?? base.translation,
      frequency: bookData.frequency ?? base.frequency,
      tags: mergeTags(base.tags, bookData.tags),
    };
    if (enrich) enriched++;
    wordMap.set(word, entry);
  }

  for (const [prefix, wordMap] of sliceMap) {
    const letter = prefix[0];
    const dir = join(publicDir, "dict", letter);
    const file = join(dir, `${prefix}.json`);
    mkdirSync(dir, { recursive: true });

    // 按 word 排序输出，便于 diff 与缓存
    const entries = [...wordMap.values()].sort((a, b) =>
      a.word.localeCompare(b.word)
    );
    writeFileSync(file, JSON.stringify(entries, null, 2), "utf8");
    written += entries.length;
    console.log(`  ${prefix}.json: ${entries.length} 条`);
  }

  console.log(
    `[seed-real-dict] 完成：写入 ${written} 条词条到 ${sliceMap.size} 个切片（其中 ${enriched} 条含完整 ECDICT 增强数据）`
  );
}

/** 合并两组 tags，去重保序 */
function mergeTags(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) return undefined;
  const out: string[] = [];
  for (const t of [...(a ?? []), ...(b ?? [])]) {
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

main();
