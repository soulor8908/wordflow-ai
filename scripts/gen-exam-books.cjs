#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 生成「托福 / 雅思 / GRE」三大考试词库（toefl-core / ielts-core / gre-core）。
 *
 * 设计原则（卡帕西式取舍）：
 * - 不追求与官方 4500/3500/3200 全量词表对齐（那是商业词库规模，本地优先 App 无需也负担不起）
 * - 精选每个考试最高 ROI 的核心学术词 / 高频同义替换 / 难词辨析
 * - 每条均提供 word / pos / translation / phonetic，可直接进入复习卡片渲染
 * - 同步合并到 public/dict-data/{letter}/{prefix}.json（DictEntry 格式）
 * - 重建 public/search-index.json
 *
 * 数据来源（公开语料，T2/T3 级别）：
 * - 托福：ETS TPO 真题高频 + Academic Word List (AWL) + NAWL 学术词表
 * - 雅思：Academic Word List + 剑桥真题高频同义替换
 * - GRE：Barron's 3500 高频核心 + Magoosh + 再要你命 3000 高频
 *
 * 用法：node scripts/gen-exam-books.cjs
 */
const fs = require("fs");
const path = require("path");

const CHUNK_SIZE = 100;
const publicDir = path.join(process.cwd(), "public");
const bookDataDir = path.join(publicDir, "book-data");
const dictRoot = path.join(publicDir, "dict-data");

// ───────────────────────── 托福核心学术词 ─────────────────────────
const TOEFL_WORDS = [
  // 学科高频动词
  { word: "acquire", pos: "vt.", translation: "获得；学到；取得", phonetic: "əˈkwaɪər" },
  { word: "adapt", pos: "v.", translation: "适应；改编", phonetic: "əˈdæpt" },
  { word: "adopt", pos: "vt.", translation: "采纳；收养", phonetic: "əˈdɒpt" },
  { word: "alter", pos: "v.", translation: "改变；改动", phonetic: "ˈɔːltər" },
  { word: "analyze", pos: "vt.", translation: "分析；解析", phonetic: "ˈænəlaɪz" },
  { word: "approximate", pos: "v.", translation: "近似；接近", phonetic: "əˈprɒksɪmət" },
  { word: "assemble", pos: "v.", translation: "集合；组装", phonetic: "əˈsembl" },
  { word: "assess", pos: "vt.", translation: "评估；评价", phonetic: "əˈses" },
  { word: "assign", pos: "vt.", translation: "分配；指派", phonetic: "əˈsaɪn" },
  { word: "assume", pos: "vt.", translation: "假设；承担", phonetic: "əˈsjuːm" },
  { word: "attain", pos: "vt.", translation: "达到；获得", phonetic: "əˈteɪn" },
  { word: "attribute", pos: "vt.", translation: "归因于；属性", phonetic: "əˈtrɪbjuːt" },
  { word: "calculate", pos: "vt.", translation: "计算；预测", phonetic: "ˈkælkjuleɪt" },
  { word: "categorize", pos: "vt.", translation: "分类；归类", phonetic: "ˈkætəɡəraɪz" },
  { word: "cite", pos: "vt.", translation: "引用；引证", phonetic: "saɪt" },
  { word: "classify", pos: "vt.", translation: "分类；归类", phonetic: "ˈklæsɪfaɪ" },
  { word: "compile", pos: "vt.", translation: "编辑；汇编", phonetic: "kəmˈpaɪl" },
  { word: "compose", pos: "v.", translation: "组成；创作", phonetic: "kəmˈpəʊz" },
  { word: "comprise", pos: "vt.", translation: "包含；构成", phonetic: "kəmˈpraɪz" },
  { word: "conclude", pos: "v.", translation: "推断；结束", phonetic: "kənˈkluːd" },
  { word: "conduct", pos: "vt.", translation: "进行；引导", phonetic: "kənˈdʌkt" },
  { word: "confirm", pos: "vt.", translation: "确认；证实", phonetic: "kənˈfɜːm" },
  { word: "consume", pos: "vt.", translation: "消耗；消费", phonetic: "kənˈsjuːm" },
  { word: "convey", pos: "vt.", translation: "传达；运输", phonetic: "kənˈveɪ" },
  { word: "correspond", pos: "vi.", translation: "符合；通信", phonetic: "ˌkɒrɪˈspɒnd" },
  { word: "deduce", pos: "vt.", translation: "推断；演绎", phonetic: "dɪˈdjuːs" },
  { word: "demonstrate", pos: "vt.", translation: "证明；演示", phonetic: "ˈdemənstreɪt" },
  { word: "derive", pos: "v.", translation: "源自；派生", phonetic: "dɪˈraɪv" },
  { word: "detect", pos: "vt.", translation: "察觉；探测", phonetic: "dɪˈtekt" },
  { word: "determine", pos: "vt.", translation: "确定；决定", phonetic: "dɪˈtɜːmɪn" },
  { word: "diminish", pos: "v.", translation: "减少；缩小", phonetic: "dɪˈmɪnɪʃ" },
  { word: "distinguish", pos: "v.", translation: "区分；辨别", phonetic: "dɪˈstɪŋɡwɪʃ" },
  { word: "distribute", pos: "vt.", translation: "分发；分布", phonetic: "dɪˈstrɪbjuːt" },
  { word: "dominate", pos: "v.", translation: "支配；统治", phonetic: "ˈdɒmɪneɪt" },
  { word: "eliminate", pos: "vt.", translation: "消除；淘汰", phonetic: "ɪˈlɪmɪneɪt" },
  { word: "emerge", pos: "vi.", translation: "出现；浮现", phonetic: "iˈmɜːrdʒ" },
  { word: "emphasize", pos: "vt.", translation: "强调；着重", phonetic: "ˈemfəsaɪz" },
  { word: "encounter", pos: "vt.", translation: "遭遇；遇到", phonetic: "ɪnˈkaʊntər" },
  { word: "enhance", pos: "vt.", translation: "提高；增强", phonetic: "ɪnˈhɑːns" },
  { word: "ensure", pos: "vt.", translation: "确保；保证", phonetic: "ɪnˈʃʊər" },
  { word: "establish", pos: "vt.", translation: "建立；确立", phonetic: "ɪˈstæblɪʃ" },
  { word: "evaluate", pos: "vt.", translation: "评估；评价", phonetic: "ɪˈvæljueɪt" },
  { word: "evidence", pos: "vt.", translation: "证明；显示", phonetic: "ˈevɪdəns" },
  { word: "evolve", pos: "v.", translation: "演变；进化", phonetic: "iˈvɒlv" },
  { word: "exhibit", pos: "vt.", translation: "展出；显示", phonetic: "ɪɡˈzɪbɪt" },
  { word: "expand", pos: "v.", translation: "扩展；膨胀", phonetic: "ɪkˈspænd" },
  { word: "expose", pos: "vt.", translation: "暴露；揭露", phonetic: "ɪkˈspəʊz" },
  { word: "fluctuate", pos: "vi.", translation: "波动；起伏", phonetic: "ˈflʌktʃueɪt" },
  { word: "generate", pos: "vt.", translation: "产生；生成", phonetic: "ˈdʒenəreɪt" },
  { word: "guarantee", pos: "vt.", translation: "保证；担保", phonetic: "ˌɡærənˈtiː" },
  { word: "identify", pos: "vt.", translation: "识别；确认", phonetic: "aɪˈdentɪfaɪ" },
  { word: "illustrate", pos: "vt.", translation: "说明；图解", phonetic: "ˈɪləstreɪt" },
  { word: "imply", pos: "vt.", translation: "暗示；意味", phonetic: "ɪmˈplaɪ" },
  { word: "incorporate", pos: "vt.", translation: "包含；合并", phonetic: "ɪnˈkɔːpəreɪt" },
  { word: "indicate", pos: "vt.", translation: "表明；指示", phonetic: "ˈɪndɪkeɪt" },
  { word: "influence", pos: "vt.", translation: "影响；感化", phonetic: "ˈɪnfluəns" },
  { word: "initiate", pos: "vt.", translation: "发起；开始", phonetic: "ɪˈnɪʃieɪt" },
  { word: "innovate", pos: "v.", translation: "创新；改革", phonetic: "ˈɪnəveɪt" },
  { word: "integrate", pos: "v.", translation: "整合；融入", phonetic: "ˈɪntɪɡreɪt" },
  { word: "interpret", pos: "vt.", translation: "解释；口译", phonetic: "ɪnˈtɜːrprɪt" },
  { word: "investigate", pos: "v.", translation: "调查；研究", phonetic: "ɪnˈvestɪɡeɪt" },
  { word: "involve", pos: "vt.", translation: "包含；牵涉", phonetic: "ɪnˈvɒlv" },
  { word: "isolate", pos: "vt.", translation: "隔离；孤立", phonetic: "ˈaɪsəleɪt" },
  { word: "justify", pos: "vt.", translation: "证明…正当；辩护", phonetic: "ˈdʒʌstɪfaɪ" },
  { word: "maintain", pos: "vt.", translation: "维持；保养", phonetic: "meɪnˈteɪn" },
  { word: "manipulate", pos: "vt.", translation: "操纵；操作", phonetic: "məˈnɪpjuleɪt" },
  { word: "measure", pos: "vt.", translation: "测量；衡量", phonetic: "ˈmeʒər" },
  { word: "modify", pos: "vt.", translation: "修改；调整", phonetic: "ˈmɒdɪfaɪ" },
  { word: "monitor", pos: "vt.", translation: "监控；监测", phonetic: "ˈmɒnɪtər" },
  { word: "obtain", pos: "vt.", translation: "获得；得到", phonetic: "əbˈteɪn" },
  { word: "occur", pos: "vi.", translation: "发生；出现", phonetic: "əˈkɜːr" },
  { word: "operate", pos: "v.", translation: "操作；运营", phonetic: "ˈɒpəreɪt" },
  { word: "originate", pos: "v.", translation: "起源；发源", phonetic: "əˈrɪdʒɪneɪt" },
  { word: "overcome", pos: "vt.", translation: "克服；战胜", phonetic: "ˌəʊvərˈkʌm" },
  { word: "participate", pos: "vi.", translation: "参加；参与", phonetic: "pɑːrˈtɪsɪpeɪt" },
  { word: "perceive", pos: "vt.", translation: "察觉；理解", phonetic: "pərˈsiːv" },
  { word: "persist", pos: "vi.", translation: "坚持；持续", phonetic: "pərˈsɪst" },
  { word: "predict", pos: "vt.", translation: "预测；预言", phonetic: "prɪˈdɪkt" },
  { word: "preserve", pos: "vt.", translation: "保护；保存", phonetic: "prɪˈzɜːrv" },
  { word: "proceed", pos: "vi.", translation: "继续；进行", phonetic: "prəˈsiːd" },
  { word: "promote", pos: "vt.", translation: "促进；推广", phonetic: "prəˈməʊt" },
  { word: "propose", pos: "v.", translation: "提议；求婚", phonetic: "prəˈpəʊz" },
  { word: "prove", pos: "vt.", translation: "证明；证实", phonetic: "pruːv" },
  { word: "publish", pos: "vt.", translation: "出版；发表", phonetic: "ˈpʌblɪʃ" },
  { word: "pursue", pos: "vt.", translation: "追求；追赶", phonetic: "pərˈsjuː" },
  { word: "range", pos: "v.", translation: "范围；涉及", phonetic: "reɪndʒ" },
  { word: "recover", pos: "v.", translation: "恢复；复原", phonetic: "rɪˈkʌvər" },
  { word: "reflect", pos: "v.", translation: "反映；反思", phonetic: "rɪˈflekt" },
  { word: "reform", pos: "v.", translation: "改革；改良", phonetic: "rɪˈfɔːm" },
  { word: "regulate", pos: "vt.", translation: "管理；调节", phonetic: "ˈreɡjuleɪt" },
  { word: "reinforce", pos: "vt.", translation: "加强；增援", phonetic: "ˌriːɪnˈfɔːrs" },
  { word: "reject", pos: "vt.", translation: "拒绝；驳回", phonetic: "rɪˈdʒekt" },
  { word: "release", pos: "vt.", translation: "释放；发布", phonetic: "rɪˈliːs" },
  { word: "rely", pos: "vi.", translation: "依赖；信赖", phonetic: "rɪˈlaɪ" },
  { word: "remain", pos: "vi.", translation: "保持；剩下", phonetic: "rɪˈmeɪn" },
  { word: "remove", pos: "vt.", translation: "移除；消除", phonetic: "rɪˈmuːv" },
  { word: "replace", pos: "vt.", translation: "取代；替换", phonetic: "rɪˈpleɪs" },
  { word: "represent", pos: "vt.", translation: "代表；表示", phonetic: "ˌreprɪˈzent" },
  { word: "resolve", pos: "vt.", translation: "解决；决心", phonetic: "rɪˈzɒlv" },
  { word: "respond", pos: "vi.", translation: "回应；反应", phonetic: "rɪˈspɒnd" },
  { word: "restrict", pos: "vt.", translation: "限制；约束", phonetic: "rɪˈstrɪkt" },
  { word: "retain", pos: "vt.", translation: "保留；保持", phonetic: "rɪˈteɪn" },
  { word: "reveal", pos: "vt.", translation: "揭示；透露", phonetic: "rɪˈviːl" },
  { word: "shift", pos: "v.", translation: "转移；改变", phonetic: "ʃɪft" },
  { word: "simulate", pos: "vt.", translation: "模拟；模仿", phonetic: "ˈsɪmjuleɪt" },
  { word: "solve", pos: "vt.", translation: "解决；解答", phonetic: "sɒlv" },
  { word: "specify", pos: "vt.", translation: "明确；指定", phonetic: "ˈspesɪfaɪ" },
  { word: "stimulate", pos: "vt.", translation: "刺激；激励", phonetic: "ˈstɪmjuleɪt" },
  { word: "substitute", pos: "v.", translation: "替代；取代", phonetic: "ˈsʌbstɪtjuːt" },
  { word: "sustain", pos: "vt.", translation: "维持；承受", phonetic: "səˈsteɪn" },
  { word: "transfer", pos: "v.", translation: "转移；转让", phonetic: "trænsˈfɜːr" },
  { word: "transform", pos: "v.", translation: "转变；改造", phonetic: "trænsˈfɔːm" },
  { word: "transmit", pos: "vt.", translation: "传输；传播", phonetic: "trænsˈmɪt" },
  { word: "trigger", pos: "vt.", translation: "触发；引发", phonetic: "ˈtrɪɡər" },
  { word: "validate", pos: "vt.", translation: "验证；确认", phonetic: "ˈvælɪdeɪt" },
  { word: "vary", pos: "v.", translation: "变化；不同", phonetic: "ˈveəri" },
  { word: "violate", pos: "vt.", translation: "违反；侵犯", phonetic: "ˈvaɪəleɪt" },
  { word: "yield", pos: "v.", translation: "产出；屈服", phonetic: "jiːld" },

  // 学科高频名词
  { word: "abundance", pos: "n.", translation: "丰富；充裕", phonetic: "əˈbʌndəns" },
  { word: "accumulation", pos: "n.", translation: "积累；堆积", phonetic: "əˌkjuːmjəˈleɪʃn" },
  { word: "advancement", pos: "n.", translation: "进步；前进", phonetic: "ədˈvɑːnsmənt" },
  { word: "agriculture", pos: "n.", translation: "农业；农耕", phonetic: "ˈæɡrɪkʌltʃər" },
  { word: "ancestor", pos: "n.", translation: "祖先；先驱", phonetic: "ˈænsestər" },
  { word: "approach", pos: "n.", translation: "方法；接近", phonetic: "əˈprəʊtʃ" },
  { word: "atmosphere", pos: "n.", translation: "大气；气氛", phonetic: "ˈætməsfɪər" },
  { word: "boundary", pos: "n.", translation: "边界；界限", phonetic: "ˈbaʊndəri" },
  { word: "capacity", pos: "n.", translation: "容量；能力", phonetic: "kəˈpæsəti" },
  { word: "category", pos: "n.", translation: "类别；范畴", phonetic: "ˈkætəɡəri" },
  { word: "circumstance", pos: "n.", translation: "情况；环境", phonetic: "ˈsɜːrkəmstæns" },
  { word: "civilization", pos: "n.", translation: "文明；文化", phonetic: "ˌsɪvəlaɪˈzeɪʃn" },
  { word: "component", pos: "n.", translation: "组件；成分", phonetic: "kəmˈpəʊnənt" },
  { word: "concept", pos: "n.", translation: "概念；观念", phonetic: "ˈkɒnsept" },
  { word: "consequence", pos: "n.", translation: "后果；结果", phonetic: "ˈkɒnsɪkwəns" },
  { word: "consumer", pos: "n.", translation: "消费者；顾客", phonetic: "kənˈsjuːmər" },
  { word: "context", pos: "n.", translation: "上下文；背景", phonetic: "ˈkɒntekst" },
  { word: "controversy", pos: "n.", translation: "争议；争论", phonetic: "ˈkɒntrəvɜːrsi" },
  { word: "criterion", pos: "n.", translation: "标准；准则", phonetic: "kraɪˈtɪəriən" },
  { word: "decade", pos: "n.", translation: "十年；十年期", phonetic: "ˈdekeɪd" },
  { word: "decline", pos: "n.", translation: "下降；衰退", phonetic: "dɪˈklaɪn" },
  { word: "deposit", pos: "n.", translation: "沉积物；存款", phonetic: "dɪˈpɒzɪt" },
  { word: "distribution", pos: "n.", translation: "分布；分配", phonetic: "ˌdɪstrɪˈbjuːʃn" },
  { word: "diversity", pos: "n.", translation: "多样性；差异", phonetic: "daɪˈvɜːrsəti" },
  { word: "domestic", pos: "a.", translation: "家庭的；国内的", phonetic: "dəˈmestɪk" },
  { word: "ecosystem", pos: "n.", translation: "生态系统", phonetic: "ˈiːkəʊsɪstəm" },
  { word: "emission", pos: "n.", translation: "排放；发射", phonetic: "iˈmɪʃn" },
  { word: "emphasis", pos: "n.", translation: "强调；重点", phonetic: "ˈemfəsɪs" },
  { word: "environment", pos: "n.", translation: "环境；周围", phonetic: "ɪnˈvaɪrənmənt" },
  { word: "evidence", pos: "n.", translation: "证据；迹象", phonetic: "ˈevɪdəns" },
  { word: "evolution", pos: "n.", translation: "进化；演变", phonetic: "ˌiːvəˈluːʃn" },
  { word: "existence", pos: "n.", translation: "存在；生存", phonetic: "ɪɡˈzɪstəns" },
  { word: "expansion", pos: "n.", translation: "扩张；膨胀", phonetic: "ɪkˈspænʃn" },
  { word: "experiment", pos: "n.", translation: "实验；试验", phonetic: "ɪkˈsperɪmənt" },
  { word: "exposure", pos: "n.", translation: "暴露；接触", phonetic: "ɪkˈspəʊʒər" },
  { word: "feature", pos: "n.", translation: "特征；特色", phonetic: "ˈfiːtʃər" },
  { word: "framework", pos: "n.", translation: "框架；体系", phonetic: "ˈfreɪmwɜːrk" },
  { word: "generation", pos: "n.", translation: "代；一代", phonetic: "ˌdʒenəˈreɪʃn" },
  { word: "geology", pos: "n.", translation: "地质学", phonetic: "dʒiˈɒlədʒi" },
  { word: "hypothesis", pos: "n.", translation: "假设；假说", phonetic: "haɪˈpɒθəsɪs" },
  { word: "impact", pos: "n.", translation: "影响；冲击", phonetic: "ˈɪmpækt" },
  { word: "indication", pos: "n.", translation: "指示；迹象", phonetic: "ˌɪndɪˈkeɪʃn" },
  { word: "innovation", pos: "n.", translation: "创新；革新", phonetic: "ˌɪnəˈveɪʃn" },
  { word: "insight", pos: "n.", translation: "洞察；见解", phonetic: "ˈɪnsaɪt" },
  { word: "interaction", pos: "n.", translation: "互动；相互作用", phonetic: "ˌɪntərˈækʃn" },
  { word: "interpretation", pos: "n.", translation: "解释；口译", phonetic: "ɪnˌtɜːrprɪˈteɪʃn" },
  { word: "investigation", pos: "n.", translation: "调查；研究", phonetic: "ɪnˌvestɪˈɡeɪʃn" },
  { word: "involvement", pos: "n.", translation: "参与；牵涉", phonetic: "ɪnˈvɒlvmənt" },
  { word: "landscape", pos: "n.", translation: "景观；地貌", phonetic: "ˈlændskeɪp" },
  { word: "limitation", pos: "n.", translation: "限制；局限性", phonetic: "ˌlɪmɪˈteɪʃn" },
  { word: "literature", pos: "n.", translation: "文学；文献", phonetic: "ˈlɪtrətʃər" },
  { word: "majority", pos: "n.", translation: "多数；大多数", phonetic: "məˈdʒɒrəti" },
  { word: "metabolism", pos: "n.", translation: "新陈代谢", phonetic: "məˈtæbəlɪzəm" },
  { word: "migration", pos: "n.", translation: "迁移；迁徙", phonetic: "maɪˈɡreɪʃn" },
  { word: "mineral", pos: "n.", translation: "矿物；矿物质", phonetic: "ˈmɪnərəl" },
  { word: "modification", pos: "n.", translation: "修改；调整", phonetic: "ˌmɒdɪfɪˈkeɪʃn" },
  { word: "notion", pos: "n.", translation: "概念；观念", phonetic: "ˈnəʊʃn" },
  { word: "observation", pos: "n.", translation: "观察；观测", phonetic: "ˌɒbzərˈveɪʃn" },
  { word: "obstacle", pos: "n.", translation: "障碍；阻碍", phonetic: "ˈɒbstəkl" },
  { word: "occurrence", pos: "n.", translation: "发生；事件", phonetic: "əˈkʌrəns" },
  { word: "organism", pos: "n.", translation: "生物；有机体", phonetic: "ˈɔːɡənɪzəm" },
  { word: "outcome", pos: "n.", translation: "结果；成果", phonetic: "ˈaʊtkʌm" },
  { word: "perspective", pos: "n.", translation: "视角；观点", phonetic: "pərˈspektɪv" },
  { word: "phenomenon", pos: "n.", translation: "现象；奇迹", phonetic: "fəˈnɒmɪnən" },
  { word: "policy", pos: "n.", translation: "政策；方针", phonetic: "ˈpɒləsi" },
  { word: "pollution", pos: "n.", translation: "污染；污染物", phonetic: "pəˈluːʃn" },
  { word: "population", pos: "n.", translation: "人口；种群", phonetic: "ˌpɒpjuˈleɪʃn" },
  { word: "potential", pos: "n.", translation: "潜力；潜能", phonetic: "pəˈtenʃl" },
  { word: "predator", pos: "n.", translation: "捕食者；掠夺者", phonetic: "ˈpredətər" },
  { word: "preference", pos: "n.", translation: "偏好；偏爱", phonetic: "ˈprefrəns" },
  { word: "preservation", pos: "n.", translation: "保护；保存", phonetic: "ˌprezərˈveɪʃn" },
  { word: "principle", pos: "n.", translation: "原则；原理", phonetic: "ˈprɪnsəpl" },
  { word: "priority", pos: "n.", translation: "优先；优先事项", phonetic: "praɪˈɒrəti" },
  { word: "procedure", pos: "n.", translation: "程序；步骤", phonetic: "prəˈsiːdʒər" },
  { word: "process", pos: "n.", translation: "过程；流程", phonetic: "ˈprɒses" },
  { word: "production", pos: "n.", translation: "生产；产量", phonetic: "prəˈdʌkʃn" },
  { word: "prosperity", pos: "n.", translation: "繁荣；兴旺", phonetic: "prɒˈsperəti" },
  { word: "reaction", pos: "n.", translation: "反应；反作用", phonetic: "riˈækʃn" },
  { word: "region", pos: "n.", translation: "地区；区域", phonetic: "ˈriːdʒən" },
  { word: "regulation", pos: "n.", translation: "规则；调节", phonetic: "ˌreɡjuˈleɪʃn" },
  { word: "resource", pos: "n.", translation: "资源；资料", phonetic: "rɪˈsɔːrs" },
  { word: "response", pos: "n.", translation: "回应；反应", phonetic: "rɪˈspɒns" },
  { word: "revolution", pos: "n.", translation: "革命；变革", phonetic: "ˌrevəˈluːʃn" },
  { word: "scenario", pos: "n.", translation: "情景；剧本", phonetic: "səˈnɑːriəʊ" },
  { word: "scholar", pos: "n.", translation: "学者；奖学金获得者", phonetic: "ˈskɒlər" },
  { word: "sediment", pos: "n.", translation: "沉积物；沉淀", phonetic: "ˈsedɪmənt" },
  { word: "sequence", pos: "n.", translation: "顺序；序列", phonetic: "ˈsiːkwəns" },
  { word: "settlement", pos: "n.", translation: "定居点；解决", phonetic: "ˈsetlmənt" },
  { word: "species", pos: "n.", translation: "物种；种类", phonetic: "ˈspiːʃiːz" },
  { word: "specimen", pos: "n.", translation: "标本；样本", phonetic: "ˈspesɪmən" },
  { word: "strategy", pos: "n.", translation: "策略；战略", phonetic: "ˈstrætədʒi" },
  { word: "substance", pos: "n.", translation: "物质；实质", phonetic: "ˈsʌbstəns" },
  { word: "survey", pos: "n.", translation: "调查；测量", phonetic: "ˈsɜːrveɪ" },
  { word: "survival", pos: "n.", translation: "生存；幸存", phonetic: "sərˈvaɪvl" },
  { word: "sustainability", pos: "n.", translation: "可持续性", phonetic: "səˌsteɪnəˈbɪləti" },
  { word: "symbol", pos: "n.", translation: "象征；符号", phonetic: "ˈsɪmbl" },
  { word: "technique", pos: "n.", translation: "技术；技巧", phonetic: "tekˈniːk" },
  { word: "tendency", pos: "n.", translation: "倾向；趋势", phonetic: "ˈtendənsi" },
  { word: "theory", pos: "n.", translation: "理论；学说", phonetic: "ˈθɪəri" },
  { word: "tradition", pos: "n.", translation: "传统；惯例", phonetic: "trəˈdɪʃn" },
  { word: "transition", pos: "n.", translation: "过渡；转变", phonetic: "trænˈzɪʃn" },
  { word: "trend", pos: "n.", translation: "趋势；动向", phonetic: "trend" },
  { word: "variation", pos: "n.", translation: "变化；变种", phonetic: "ˌveəriˈeɪʃn" },
  { word: "vegetation", pos: "n.", translation: "植被；植物", phonetic: "ˌvedʒəˈteɪʃn" },
  { word: "verify", pos: "vt.", translation: "核实；证明", phonetic: "ˈverɪfaɪ" },
  { word: "volume", pos: "n.", translation: "体积；卷；音量", phonetic: "ˈvɒljuːm" },
];

// ───────────────────────── 雅思核心学术词 ─────────────────────────
const IELTS_WORDS = [
  // AWL 学术词族核心
  { word: "analyze", pos: "vt.", translation: "分析；解析", phonetic: "ˈænəlaɪz" },
  { word: "approach", pos: "n.", translation: "方法；途径", phonetic: "əˈprəʊtʃ" },
  { word: "area", pos: "n.", translation: "领域；区域", phonetic: "ˈeəriə" },
  { word: "assess", pos: "vt.", translation: "评估；评价", phonetic: "əˈses" },
  { word: "assume", pos: "vt.", translation: "假定；承担", phonetic: "əˈsjuːm" },
  { word: "authority", pos: "n.", translation: "权威；当局", phonetic: "ɔːˈθɒrəti" },
  { word: "available", pos: "a.", translation: "可获得的；可用的", phonetic: "əˈveɪləbl" },
  { word: "benefit", pos: "n.", translation: "利益；好处", phonetic: "ˈbenɪfɪt" },
  { word: "concept", pos: "n.", translation: "概念；观念", phonetic: "ˈkɒnsept" },
  { word: "consistent", pos: "a.", translation: "一致的；连贯的", phonetic: "kənˈsɪstənt" },
  { word: "constitute", pos: "v.", translation: "构成；组成", phonetic: "ˈkɒnstɪtjuːt" },
  { word: "context", pos: "n.", translation: "背景；上下文", phonetic: "ˈkɒntekst" },
  { word: "contract", pos: "n.", translation: "合同；契约", phonetic: "ˈkɒntrækt" },
  { word: "create", pos: "vt.", translation: "创造；创建", phonetic: "kriˈeɪt" },
  { word: "data", pos: "n.", translation: "数据；资料", phonetic: "ˈdeɪtə" },
  { word: "define", pos: "vt.", translation: "定义；明确", phonetic: "dɪˈfaɪn" },
  { word: "derive", pos: "v.", translation: "源自；派生", phonetic: "dɪˈraɪv" },
  { word: "distribute", pos: "vt.", translation: "分配；分布", phonetic: "dɪˈstrɪbjuːt" },
  { word: "economy", pos: "n.", translation: "经济；节约", phonetic: "ɪˈkɒnəmi" },
  { word: "environment", pos: "n.", translation: "环境；周围", phonetic: "ɪnˈvaɪrənmənt" },
  { word: "establish", pos: "vt.", translation: "建立；确立", phonetic: "ɪˈstæblɪʃ" },
  { word: "estimate", pos: "vt.", translation: "估计；估算", phonetic: "ˈestɪmeɪt" },
  { word: "evident", pos: "a.", translation: "明显的；显然的", phonetic: "ˈevɪdənt" },
  { word: "export", pos: "v.", translation: "出口；输出", phonetic: "ɪkˈspɔːt" },
  { word: "factor", pos: "n.", translation: "因素；要素", phonetic: "ˈfæktər" },
  { word: "finance", pos: "n.", translation: "财政；金融", phonetic: "ˈfaɪnæns" },
  { word: "formula", pos: "n.", translation: "公式；配方", phonetic: "ˈfɔːmjələ" },
  { word: "function", pos: "n.", translation: "功能；作用", phonetic: "ˈfʌŋkʃn" },
  { word: "identify", pos: "vt.", translation: "识别；确认", phonetic: "aɪˈdentɪfaɪ" },
  { word: "income", pos: "n.", translation: "收入；所得", phonetic: "ˈɪnkʌm" },
  { word: "indicate", pos: "vt.", translation: "表明；指示", phonetic: "ˈɪndɪkeɪt" },
  { word: "individual", pos: "n.", translation: "个人；个体", phonetic: "ˌɪndɪˈvɪdʒuəl" },
  { word: "interpret", pos: "vt.", translation: "解释；口译", phonetic: "ɪnˈtɜːrprɪt" },
  { word: "involve", pos: "vt.", translation: "包含；牵涉", phonetic: "ɪnˈvɒlv" },
  { word: "issue", pos: "n.", translation: "议题；问题", phonetic: "ˈɪʃuː" },
  { word: "labour", pos: "n.", translation: "劳动；劳动力", phonetic: "ˈleɪbər" },
  { word: "legal", pos: "a.", translation: "法律的；合法的", phonetic: "ˈliːɡl" },
  { word: "legislate", pos: "v.", translation: "立法；制定法律", phonetic: "ˈledʒɪsleɪt" },
  { word: "major", pos: "a.", translation: "主要的；较大的", phonetic: "ˈmeɪdʒər" },
  { word: "method", pos: "n.", translation: "方法；方式", phonetic: "ˈmeθəd" },
  { word: "occur", pos: "vi.", translation: "发生；出现", phonetic: "əˈkɜːr" },
  { word: "percent", pos: "n.", translation: "百分之…；百分比", phonetic: "pərˈsent" },
  { word: "period", pos: "n.", translation: "时期；阶段", phonetic: "ˈpɪəriəd" },
  { word: "policy", pos: "n.", translation: "政策；方针", phonetic: "ˈpɒləsi" },
  { word: "principle", pos: "n.", translation: "原则；原理", phonetic: "ˈprɪnsəpl" },
  { word: "proceed", pos: "vi.", translation: "继续；进行", phonetic: "prəˈsiːd" },
  { word: "process", pos: "n.", translation: "过程；流程", phonetic: "ˈprɒses" },
  { word: "require", pos: "vt.", translation: "需要；要求", phonetic: "rɪˈkwaɪər" },
  { word: "research", pos: "n.", translation: "研究；调查", phonetic: "rɪˈsɜːrtʃ" },
  { word: "respond", pos: "vi.", translation: "回应；反应", phonetic: "rɪˈspɒnd" },
  { word: "role", pos: "n.", translation: "角色；作用", phonetic: "rəʊl" },
  { word: "section", pos: "n.", translation: "部分；章节", phonetic: "ˈsekʃn" },
  { word: "sector", pos: "n.", translation: "部门；行业", phonetic: "ˈsektər" },
  { word: "significant", pos: "a.", translation: "重要的；显著的", phonetic: "sɪɡˈnɪfɪkənt" },
  { word: "similar", pos: "a.", translation: "相似的；类似的", phonetic: "ˈsɪmələr" },
  { word: "source", pos: "n.", translation: "来源；源头", phonetic: "sɔːrs" },
  { word: "specific", pos: "a.", translation: "具体的；明确的", phonetic: "spəˈsɪfɪk" },
  { word: "structure", pos: "n.", translation: "结构；构造", phonetic: "ˈstrʌktʃər" },
  { word: "theory", pos: "n.", translation: "理论；学说", phonetic: "ˈθɪəri" },
  { word: "vary", pos: "v.", translation: "变化；不同", phonetic: "ˈveəri" },

  // 剑桥真题高频同义替换与搭配
  { word: "advantage", pos: "n.", translation: "优势；有利条件", phonetic: "ədˈvɑːntɪdʒ" },
  { word: "disadvantage", pos: "n.", translation: "劣势；不利条件", phonetic: "ˌdɪsədˈvɑːntɪdʒ" },
  { word: "alternative", pos: "n.", translation: "替代方案；选择", phonetic: "ɔːlˈtɜːrnətɪv" },
  { word: "consequence", pos: "n.", translation: "后果；结果", phonetic: "ˈkɒnsɪkwəns" },
  { word: "contribute", pos: "v.", translation: "贡献；促成", phonetic: "kənˈtrɪbjuːt" },
  { word: "deteriorate", pos: "v.", translation: "恶化；变坏", phonetic: "dɪˈtɪəriəreɪt" },
  { word: "diminish", pos: "v.", translation: "减少；削弱", phonetic: "dɪˈmɪnɪʃ" },
  { word: "efficient", pos: "a.", translation: "高效的；有效率的", phonetic: "ɪˈfɪʃnt" },
  { word: "enhance", pos: "vt.", translation: "提高；增强", phonetic: "ɪnˈhɑːns" },
  { word: "exhaust", pos: "vt.", translation: "耗尽；使筋疲力尽", phonetic: "ɪɡˈzɔːst" },
  { word: "fluctuate", pos: "vi.", translation: "波动；起伏", phonetic: "ˈflʌktʃueɪt" },
  { word: "fundamental", pos: "a.", translation: "基本的；根本的", phonetic: "ˌfʌndəˈmentl" },
  { word: "generate", pos: "vt.", translation: "产生；引起", phonetic: "ˈdʒenəreɪt" },
  { word: "implement", pos: "vt.", translation: "实施；贯彻", phonetic: "ˈɪmplɪment" },
  { word: "incentive", pos: "n.", translation: "激励；动机", phonetic: "ɪnˈsentɪv" },
  { word: "inevitable", pos: "a.", translation: "不可避免的；必然的", phonetic: "ɪnˈevɪtəbl" },
  { word: "infrastructure", pos: "n.", translation: "基础设施", phonetic: "ˈɪnfrəstrʌktʃər" },
  { word: "innovative", pos: "a.", translation: "创新的；革新的", phonetic: "ˈɪnəveɪtɪv" },
  { word: "integrate", pos: "v.", translation: "整合；融合", phonetic: "ˈɪntɪɡreɪt" },
  { word: "intervene", pos: "vi.", translation: "干预；介入", phonetic: "ˌɪntərˈviːn" },
  { word: "invest", pos: "v.", translation: "投资；投入", phonetic: "ɪnˈvest" },
  { word: "justify", pos: "vt.", translation: "证明…正当；辩解", phonetic: "ˈdʒʌstɪfaɪ" },
  { word: "mitigate", pos: "vt.", translation: "减轻；缓和", phonetic: "ˈmɪtɪɡeɪt" },
  { word: "monitor", pos: "vt.", translation: "监测；监控", phonetic: "ˈmɒnɪtər" },
  { word: "obstacle", pos: "n.", translation: "障碍；阻碍", phonetic: "ˈɒbstəkl" },
  { word: "predominant", pos: "a.", translation: "占主导的；主要的", phonetic: "prɪˈdɒmɪnənt" },
  { word: "prevalent", pos: "a.", translation: "流行的；普遍的", phonetic: "ˈprevələnt" },
  { word: "profound", pos: "a.", translation: "深刻的；深远的", phonetic: "prəˈfaʊnd" },
  { word: "promote", pos: "vt.", translation: "促进；推广", phonetic: "prəˈməʊt" },
  { word: "proportion", pos: "n.", translation: "比例；部分", phonetic: "prəˈpɔːʃn" },
  { word: "relevant", pos: "a.", translation: "相关的；切题的", phonetic: "ˈreləvənt" },
  { word: "reluctant", pos: "a.", translation: "不情愿的；勉强的", phonetic: "rɪˈlʌktənt" },
  { word: "remarkable", pos: "a.", translation: "显著的；非凡的", phonetic: "rɪˈmɑːrkəbl" },
  { word: "restrict", pos: "vt.", translation: "限制；约束", phonetic: "rɪˈstrɪkt" },
  { word: "retain", pos: "vt.", translation: "保留；保持", phonetic: "rɪˈteɪn" },
  { word: "subsequent", pos: "a.", translation: "随后的；后来的", phonetic: "ˈsʌbsɪkwənt" },
  { word: "sufficient", pos: "a.", translation: "足够的；充足的", phonetic: "səˈfɪʃnt" },
  { word: "sustain", pos: "vt.", translation: "维持；承受", phonetic: "səˈsteɪn" },
  { word: "tackle", pos: "vt.", translation: "处理；应对", phonetic: "ˈtækl" },
  { word: "tendency", pos: "n.", translation: "倾向；趋势", phonetic: "ˈtendənsi" },
  { word: "tolerate", pos: "vt.", translation: "容忍；忍受", phonetic: "ˈtɒləreɪt" },
  { word: "transfer", pos: "v.", translation: "转移；转让", phonetic: "trænsˈfɜːr" },
  { word: "undergo", pos: "vt.", translation: "经历；经受", phonetic: "ˌʌndərˈɡəʊ" },
  { word: "violate", pos: "vt.", translation: "违反；侵犯", phonetic: "ˈvaɪəleɪt" },
];

// ───────────────────────── GRE 核心填空词汇 ─────────────────────────
const GRE_WORDS = [
  // 巴朗高频核心 + Magoosh + 再要你命 3000 高频
  { word: "abate", pos: "v.", translation: "减轻；减少", phonetic: "əˈbeɪt" },
  { word: "aberrant", pos: "a.", translation: "异常的；偏离常规的", phonetic: "æˈberənt" },
  { word: "abeyance", pos: "n.", translation: "中止；搁置", phonetic: "əˈbeɪəns" },
  { word: "abjure", pos: "vt.", translation: "发誓放弃；公开放弃", phonetic: "əbˈdʒʊər" },
  { word: "abnegation", pos: "n.", translation: "克己；放弃", phonetic: "ˌæbnɪˈɡeɪʃn" },
  { word: "abrogate", pos: "vt.", translation: "废除；取消", phonetic: "ˈæbrəɡeɪt" },
  { word: "abscond", pos: "vi.", translation: "潜逃；逃避", phonetic: "æbˈskɒnd" },
  { word: "abstemious", pos: "a.", translation: "有节制的；饮食有度的", phonetic: "æbˈstiːmiəs" },
  { word: "abundant", pos: "a.", translation: "丰富的；充裕的", phonetic: "əˈbʌndənt" },
  { word: "abjure", pos: "vt.", translation: "发誓放弃；郑重放弃", phonetic: "əbˈdʒʊər" },
  { word: "acumen", pos: "n.", translation: "敏锐；聪明", phonetic: "ˈækjəmən" },
  { word: "adamant", pos: "a.", translation: "坚定不移的；固执的", phonetic: "ˈædəmənt" },
  { word: "admonish", pos: "vt.", translation: "告诫；责备", phonetic: "ədˈmɒnɪʃ" },
  { word: "adroit", pos: "a.", translation: "灵巧的；熟练的", phonetic: "əˈdrɔɪt" },
  { word: "adulterate", pos: "vt.", translation: "掺杂；掺假", phonetic: "əˈdʌltəreɪt" },
  { word: "aesthetic", pos: "a.", translation: "审美的；美学的", phonetic: "iːsˈθetɪk" },
  { word: "affable", pos: "a.", translation: "和蔼可亲的；友善的", phonetic: "ˈæfəbl" },
  { word: "affinity", pos: "n.", translation: "密切关系；喜爱", phonetic: "əˈfɪnəti" },
  { word: "aggrandize", pos: "vt.", translation: "扩大；提高（地位）", phonetic: "əˈɡrændaɪz" },
  { word: "alacrity", pos: "n.", translation: "乐意；敏捷", phonetic: "əˈlækrəti" },
  { word: "alchemy", pos: "n.", translation: "炼金术；魔力", phonetic: "ˈælkəmi" },
  { word: "amalgamate", pos: "v.", translation: "合并；融合", phonetic: "əˈmælɡəmeɪt" },
  { word: "ambiguous", pos: "a.", translation: "含糊的；模棱两可的", phonetic: "æmˈbɪɡjuəs" },
  { word: "ambivalence", pos: "n.", translation: "矛盾心理；矛盾情感", phonetic: "æmˈbɪvələns" },
  { word: "ameliorate", pos: "v.", translation: "改善；改良", phonetic: "əˈmiːliəreɪt" },
  { word: "amenable", pos: "a.", translation: "顺从的；通情达理的", phonetic: "əˈmiːnəbl" },
  { word: "amiable", pos: "a.", translation: "友好的；和蔼的", phonetic: "ˈeɪmiəbl" },
  { word: "anachronistic", pos: "a.", translation: "时代错误的；过时的", phonetic: "əˌnækrəˈnɪstɪk" },
  { word: "anomaly", pos: "n.", translation: "异常；反常", phonetic: "əˈnɒməli" },
  { word: "antagonism", pos: "n.", translation: "对抗；敌意", phonetic: "ænˈtæɡənɪzəm" },
  { word: "antipathy", pos: "n.", translation: "反感；厌恶", phonetic: "ænˈtɪpəθi" },
  { word: "apathy", pos: "n.", translation: "冷漠；漠不关心", phonetic: "ˈæpəθi" },
  { word: "appease", pos: "vt.", translation: "安抚；平息", phonetic: "əˈpiːz" },
  { word: "apprise", pos: "vt.", translation: "通知；告知", phonetic: "əˈpraɪz" },
  { word: "approbation", pos: "n.", translation: "认可；赞许", phonetic: "ˌɒprəˈbeɪʃn" },
  { word: "appropriate", pos: "vt.", translation: "挪用；占用", phonetic: "əˈprəʊprieɪt" },
  { word: "apropos", pos: "a.", translation: "恰当的；相关的", phonetic: "ˌæprəˈpəʊ" },
  { word: "arcane", pos: "a.", translation: "神秘的；晦涩难懂的", phonetic: "ɑːrˈkeɪn" },
  { word: "arduous", pos: "a.", translation: "费力的；艰巨的", phonetic: "ˈɑːrdʒuəs" },
  { word: "arrogate", pos: "vt.", translation: "冒称；霸占", phonetic: "ˈærəɡeɪt" },
  { word: "ascetic", pos: "a.", translation: "苦行的；禁欲的", phonetic: "əˈsetɪk" },
  { word: "ascertain", pos: "vt.", translation: "查明；弄清", phonetic: "ˌæsərˈteɪn" },
  { word: "aspersion", pos: "n.", translation: "诽谤；中伤", phonetic: "əˈspɜːrʒn" },
  { word: "assail", pos: "vt.", translation: "攻击；抨击", phonetic: "əˈseɪl" },
  { word: "assiduous", pos: "a.", translation: "勤勉的；刻苦的", phonetic: "əˈsɪdʒuəs" },
  { word: "assuage", pos: "vt.", translation: "缓和；减轻", phonetic: "əˈsweɪdʒ" },
  { word: "asterisk", pos: "n.", translation: "星号； asterisk 标记", phonetic: "ˈæstərɪsk" },
  { word: "astute", pos: "a.", translation: "机敏的；精明的", phonetic: "əˈstjuːt" },
  { word: "augment", pos: "v.", translation: "增加；增大", phonetic: "ɔːɡˈment" },
  { word: "austere", pos: "a.", translation: "朴素的；严厉的", phonetic: "ɒˈstɪər" },
  { word: "authoritarian", pos: "a.", translation: "独裁主义的", phonetic: "ɔːˌθɒrəˈteəriən" },
  { word: "autonomous", pos: "a.", translation: "自治的；自主的", phonetic: "ɔːˈtɒnəməs" },
  { word: "avarice", pos: "n.", translation: "贪婪；贪欲", phonetic: "ˈævərɪs" },
  { word: "aversion", pos: "n.", translation: "厌恶；反感", phonetic: "əˈvɜːrʒn" },
  { word: "avert", pos: "vt.", translation: "转移；避免", phonetic: "əˈvɜːrt" },
  { word: "banal", pos: "a.", translation: "平庸的；陈腐的", phonetic: "bəˈnɑːl" },
  { word: "banter", pos: "n.", translation: "玩笑；戏谑", phonetic: "ˈbæntər" },
  { word: "baroque", pos: "a.", translation: "巴洛克式的；怪异的", phonetic: "bəˈrɒk" },
  { word: "belligerent", pos: "a.", translation: "好战的；交战的", phonetic: "bəˈlɪdʒərənt" },
  { word: "beneficent", pos: "a.", translation: "仁慈的；行善的", phonetic: "bɪˈnefɪsnt" },
  { word: "benevolent", pos: "a.", translation: "仁慈的；慈善的", phonetic: "bəˈnevələnt" },
  { word: "bequeath", pos: "vt.", translation: "遗赠；遗留", phonetic: "bɪˈkwiːð" },
  { word: "berate", pos: "vt.", translation: "严厉责备", phonetic: "bɪˈreɪt" },
  { word: "bewilder", pos: "vt.", translation: "使迷惑；使不知所措", phonetic: "bɪˈwɪldər" },
  { word: "blasé", pos: "a.", translation: "厌倦的；无动于衷的", phonetic: "ˈblɑːzeɪ" },
  { word: "bolster", pos: "vt.", translation: "支持；加强", phonetic: "ˈbəʊlstər" },
  { word: "bombastic", pos: "a.", translation: "夸夸其谈的", phonetic: "bɒmˈbæstɪk" },
  { word: "bourgeois", pos: "a.", translation: "资产阶级的；中产阶级的", phonetic: "ˈbʊərʒwɑː" },
  { word: "bucolic", pos: "a.", translation: "乡村的；田园的", phonetic: "bjuːˈkɒlɪk" },
  { word: "burgeon", pos: "v.", translation: "迅速增长；发芽", phonetic: "ˈbɜːrdʒən" },
  { word: "burlesque", pos: "n.", translation: "滑稽戏；讽刺", phonetic: "bɜːrˈlesk" },
  { word: "cacophony", pos: "n.", translation: "刺耳的杂音", phonetic: "kəˈkɒfəni" },
  { word: "cajole", pos: "v.", translation: "哄骗；劝诱", phonetic: "kəˈdʒəʊl" },
  { word: "calumny", pos: "n.", translation: "诽谤；中伤", phonetic: "ˈkæləmni" },
  { word: "candid", pos: "a.", translation: "坦率的；直白的", phonetic: "ˈkændɪd" },
  { word: "cantankerous", pos: "a.", translation: "脾气坏的；爱争吵的", phonetic: "kænˈtæŋkərəs" },
  { word: "capacious", pos: "a.", translation: "容量大的；宽敞的", phonetic: "kəˈpeɪʃəs" },
  { word: "capitulate", pos: "vi.", translation: "投降；屈服", phonetic: "kəˈpɪtʃuleɪt" },
  { word: "capricious", pos: "a.", translation: "反复无常的；任性的", phonetic: "kəˈprɪʃəs" },
  { word: "carping", pos: "a.", translation: "吹毛求疵的", phonetic: "ˈkɑːrpɪŋ" },
  { word: "cavalier", pos: "a.", translation: "漫不经心的；傲慢的", phonetic: "ˌkævəˈlɪər" },
  { word: "censure", pos: "n.", translation: "责难；谴责", phonetic: "ˈsenʃər" },
  { word: "chicanery", pos: "n.", translation: "诡计；欺骗", phonetic: "ʃɪˈkeɪnəri" },
  { word: "chimera", pos: "n.", translation: "幻想；荒诞不经", phonetic: "kaɪˈmɪərə" },
  { word: "choleric", pos: "a.", translation: "易怒的；暴躁的", phonetic: "ˈkɒlərɪk" },
  { word: "cogent", pos: "a.", translation: "有说服力的", phonetic: "ˈkəʊdʒənt" },
  { word: "cogitate", pos: "v.", translation: "深思熟虑", phonetic: "ˈkɒdʒɪteɪt" },
  { word: "coherent", pos: "a.", translation: "连贯的；一致的", phonetic: "kəʊˈhɪərənt" },
  { word: "colloquial", pos: "a.", translation: "口语的；通俗的", phonetic: "kəˈləʊkwiəl" },
  { word: "complaisant", pos: "a.", translation: "殷勤的；顺从的", phonetic: "kəmˈpleɪznt" },
  { word: "compliant", pos: "a.", translation: "顺从的；符合的", phonetic: "kəmˈplaɪənt" },
  { word: "comprehensive", pos: "a.", translation: "全面的；综合的", phonetic: "ˌkɒmprɪˈhensɪv" },
  { word: "conciliate", pos: "vt.", translation: "安抚；调和", phonetic: "kənˈsɪlieɪt" },
  { word: "condescend", pos: "vi.", translation: "屈尊；俯就", phonetic: "ˌkɒndɪˈsend" },
  { word: "condone", pos: "vt.", translation: "宽恕；纵容", phonetic: "kənˈdəʊn" },
  { word: "confluence", pos: "n.", translation: "汇合；聚集", phonetic: "ˈkɒnfluəns" },
  { word: "congenial", pos: "a.", translation: "意气相投的；适宜的", phonetic: "kənˈdʒiːniəl" },
  { word: "connoisseur", pos: "n.", translation: "鉴赏家；行家", phonetic: "ˌkɒnəˈsɜːr" },
  { word: "consensus", pos: "n.", translation: "共识；一致意见", phonetic: "kənˈsensəs" },
  { word: "contentious", pos: "a.", translation: "有争议的；好争吵的", phonetic: "kənˈtenʃəs" },
  { word: "contrite", pos: "a.", translation: "悔悟的；痛悔的", phonetic: "kənˈtraɪt" },
  { word: "controversial", pos: "a.", translation: "有争议的", phonetic: "ˌkɒntrəˈvɜːrʃl" },
  { word: "convivial", pos: "a.", translation: "欢乐的；好交际的", phonetic: "kənˈvɪviəl" },
  { word: "copious", pos: "a.", translation: "丰富的；大量的", phonetic: "ˈkəʊpiəs" },
  { word: "corroborate", pos: "vt.", translation: "证实；支持", phonetic: "kəˈrɒbəreɪt" },
  { word: "credulous", pos: "a.", translation: "轻信的；易受骗的", phonetic: "ˈkredʒələs" },
  { word: "culpable", pos: "a.", translation: "有罪的；该受谴责的", phonetic: "ˈkʌlpəbl" },
  { word: "cursory", pos: "a.", translation: "草率的；粗略的", phonetic: "ˈkɜːrsəri" },
  { word: "dearth", pos: "n.", translation: "缺乏；稀少", phonetic: "dɜːrθ" },
  { word: "debilitate", pos: "vt.", translation: "使衰弱", phonetic: "dɪˈbɪlɪteɪt" },
  { word: "decorum", pos: "n.", translation: "得体；端庄", phonetic: "dɪˈkɔːrəm" },
  { word: "deference", pos: "n.", translation: "敬意；顺从", phonetic: "ˈdefərəns" },
  { word: "delineate", pos: "vt.", translation: "描绘；勾画", phonetic: "dɪˈlɪnieɪt" },
  { word: "demagogue", pos: "n.", translation: "蛊惑民心的政客", phonetic: "ˈdeməɡɒɡ" },
  { word: "denigrate", pos: "vt.", translation: "诋毁；贬低", phonetic: "ˈdenɪɡreɪt" },
  { word: "deplore", pos: "vt.", translation: "强烈反对；哀叹", phonetic: "dɪˈplɔːr" },
  { word: "deprecate", pos: "vt.", translation: "反对；不赞成", phonetic: "ˈdeprəkeɪt" },
  { word: "deride", pos: "vt.", translation: "嘲笑；愚弄", phonetic: "dɪˈraɪd" },
  { word: "desiccate", pos: "vt.", translation: "使干燥；脱水", phonetic: "ˈdesɪkeɪt" },
  { word: "desultory", pos: "a.", translation: "散漫的；无目的的", phonetic: "ˈdesəltri" },
  { word: "diatribe", pos: "n.", translation: "抨击；谴责", phonetic: "ˈdaɪətraɪb" },
  { word: "dichotomy", pos: "n.", translation: "二分法；对立", phonetic: "daɪˈkɒtəmi" },
  { word: "didactic", pos: "a.", translation: "说教的；教诲的", phonetic: "daɪˈdæktɪk" },
  { word: "diffidence", pos: "n.", translation: "缺乏自信；羞怯", phonetic: "ˈdɪfɪdəns" },
  { word: "dilatory", pos: "a.", translation: "拖延的；缓慢的", phonetic: "ˈdɪlətɔːri" },
  { word: "dilettante", pos: "n.", translation: "浅薄的涉猎者", phonetic: "ˌdɪləˈtænti" },
  { word: "dirge", pos: "n.", translation: "挽歌；哀乐", phonetic: "dɜːrdʒ" },
  { word: "disabuse", pos: "vt.", translation: "纠正；使醒悟", phonetic: "ˌdɪsəˈbjuːz" },
  { word: "disparage", pos: "vt.", translation: "贬低；诋毁", phonetic: "dɪˈspærɪdʒ" },
  { word: "disparate", pos: "a.", translation: "迥然不同的", phonetic: "ˈdɪspərət" },
  { word: "dissemble", pos: "v.", translation: "掩饰；伪装", phonetic: "dɪˈsembl" },
  { word: "dissonance", pos: "n.", translation: "不和谐；不一致", phonetic: "ˈdɪsənəns" },
  { word: "dogmatic", pos: "a.", translation: "教条的；武断的", phonetic: "dɒɡˈmætɪk" },
  { word: "ebullient", pos: "a.", translation: "热情洋溢的", phonetic: "ɪˈbʌliənt" },
  { word: "eclectic", pos: "a.", translation: "折衷的；兼收并蓄的", phonetic: "ɪˈklektɪk" },
  { word: "effrontery", pos: "n.", translation: "厚颜无耻；放肆", phonetic: "ɪˈfrʌntəri" },
  { word: "egocentric", pos: "a.", translation: "自我中心的", phonetic: "ˌiːɡəʊˈsentrɪk" },
  { word: "egregious", pos: "a.", translation: "极其糟糕的；惊人的", phonetic: "ɪˈɡriːdʒiəs" },
  { word: "elegy", pos: "n.", translation: "挽歌；哀诗", phonetic: "ˈelədʒi" },
  { word: "eloquent", pos: "a.", translation: "雄辩的；有说服力的", phonetic: "ˈeləkwənt" },
  { word: "emaciated", pos: "a.", translation: "瘦弱的；憔悴的", phonetic: "ɪˈmeɪʃieɪtɪd" },
  { word: "empirical", pos: "a.", translation: "经验主义的；实证的", phonetic: "ɪmˈpɪrɪkl" },
  { word: "encomium", pos: "n.", translation: "赞颂；颂词", phonetic: "enˈkəʊmiəm" },
  { word: "endemic", pos: "a.", translation: "地方性的；特有的", phonetic: "enˈdemɪk" },
  { word: "enervate", pos: "vt.", translation: "使衰弱；使无力", phonetic: "ˈenərveɪt" },
  { word: "engender", pos: "vt.", translation: "产生；引起", phonetic: "ɪnˈdʒendər" },
  { word: "enigma", pos: "n.", translation: "谜；费解的事物", phonetic: "ɪˈnɪɡmə" },
  { word: "ephemeral", pos: "a.", translation: "短暂的；瞬息的", phonetic: "ɪˈfemərəl" },
  { word: "epistolary", pos: "a.", translation: "书信的；书信体的", phonetic: "ɪˈpɪstələri" },
  { word: "equanimity", pos: "n.", translation: "平静；镇定", phonetic: "ˌekwəˈnɪməti" },
  { word: "equivocate", pos: "vi.", translation: "模棱两可；支吾", phonetic: "ɪˈkwɪvəkeɪt" },
  { word: "erudite", pos: "a.", translation: "博学的；有学问的", phonetic: "ˈerudaɪt" },
  { word: "esoteric", pos: "a.", translation: "深奥的；秘传的", phonetic: "ˌesəˈterɪk" },
  { word: "eulogy", pos: "n.", translation: "颂词；悼词", phonetic: "ˈjuːlədʒi" },
  { word: "euphemism", pos: "n.", translation: "委婉语；婉言", phonetic: "ˈjuːfəmɪzəm" },
  { word: "exacerbate", pos: "vt.", translation: "恶化；激怒", phonetic: "ɪɡˈzæsərbeɪt" },
  { word: "exculpate", pos: "vt.", translation: "开脱；使无罪", phonetic: "ˈekskʌlpeɪt" },
  { word: "exigency", pos: "n.", translation: "紧急；迫切需要", phonetic: "ˈeksɪdʒənsi" },
  { word: "exonerate", pos: "vt.", translation: "使免罪；免除责任", phonetic: "ɪɡˈzɒnəreɪt" },
  { word: "fastidious", pos: "a.", translation: "挑剔的；一丝不苟的", phonetic: "fæˈstɪdiəs" },
  { word: "fatuous", pos: "a.", translation: "愚蠢的；荒谬的", phonetic: "ˈfætʃuəs" },
  { word: "garrulous", pos: "a.", translation: "喋喋不休的", phonetic: "ˈɡærələs" },
  { word: "grandiose", pos: "a.", translation: "浮夸的；宏大的", phonetic: "ˈɡrændiəʊs" },
  { word: "hapless", pos: "a.", translation: "不幸的；倒霉的", phonetic: "ˈhæpləs" },
  { word: "iconoclast", pos: "n.", translation: "打破传统的人", phonetic: "aɪˈkɒnəklæst" },
  { word: "idolatrous", pos: "a.", translation: "偶像崇拜的", phonetic: "aɪˈdɒlətrəs" },
  { word: "impetuous", pos: "a.", translation: "冲动的；鲁莽的", phonetic: "ɪmˈpetʃuəs" },
  { word: "implacable", pos: "a.", translation: "难平息的；不妥协的", phonetic: "ɪmˈplækəbl" },
  { word: "inchoate", pos: "a.", translation: "初期的；未完成的", phonetic: "ɪnˈkəʊət" },
  { word: "ingenuous", pos: "a.", translation: "天真的；单纯的", phonetic: "ɪnˈdʒenjuəs" },
  { word: "inimical", pos: "a.", translation: "敌意的；不利的", phonetic: "ɪˈnɪmɪkl" },
  { word: "insidious", pos: "a.", translation: "阴险的；潜伏的", phonetic: "ɪnˈsɪdiəs" },
  { word: "intransigent", pos: "a.", translation: "不妥协的；固执的", phonetic: "ɪnˈtrænsɪdʒənt" },
  { word: "inveterate", pos: "a.", translation: "根深蒂固的；积习的", phonetic: "ɪnˈvetərət" },
  { word: "laconic", pos: "a.", translation: "简洁的；言简意赅的", phonetic: "ləˈkɒnɪk" },
  { word: "magnanimous", pos: "a.", translation: "宽宏大量的", phonetic: "mæɡˈnænɪməs" },
  { word: "mercurial", pos: "a.", translation: "多变的；活泼的", phonetic: "mɜːrˈkjʊriəl" },
  { word: "obfuscate", pos: "vt.", translation: "使困惑；使模糊", phonetic: "ˈɒbfʌskeɪt" },
  { word: "obsequious", pos: "a.", translation: "谄媚的；奉承的", phonetic: "əbˈsiːkwiəs" },
  { word: "obstreperous", pos: "a.", translation: "吵闹的；喧嚣的", phonetic: "əbˈstrepərəs" },
  { word: "ostentatious", pos: "a.", translation: "炫耀的；卖弄的", phonetic: "ˌɒstenˈteɪʃəs" },
  { word: "pandering", pos: "n.", translation: "迎合；怂恿", phonetic: "ˈpændərɪŋ" },
  { word: "paragon", pos: "n.", translation: "模范；完美典范", phonetic: "ˈpærəɡən" },
  { word: "partisan", pos: "n.", translation: "党徒；偏袒者", phonetic: "ˈpɑːrtɪzn" },
  { word: "pejorative", pos: "a.", translation: "贬损的；轻蔑的", phonetic: "pɪˈdʒɒrətɪv" },
  { word: "perfidious", pos: "a.", translation: "背信弃义的", phonetic: "pərˈfɪdiəs" },
  { word: "perfunctory", pos: "a.", translation: "敷衍的；草率的", phonetic: "pərˈfʌŋktəri" },
  { word: "perspicacious", pos: "a.", translation: "敏锐的；有洞察力的", phonetic: "ˌpɜːrspɪˈkeɪʃəs" },
  { word: "petulant", pos: "a.", translation: "暴躁的；任性的", phonetic: "ˈpetʃələnt" },
  { word: "phlegmatic", pos: "a.", translation: "冷淡的；镇定的", phonetic: "flegˈmætɪk" },
  { word: "pithy", pos: "a.", translation: "简洁有力的", phonetic: "ˈpɪθi" },
  { word: "placate", pos: "vt.", translation: "安抚；平息", phonetic: "pləˈkeɪt" },
  { word: "platitude", pos: "n.", translation: "陈词滥调", phonetic: "ˈplætɪtjuːd" },
  { word: "plethora", pos: "n.", translation: "过多；过剩", phonetic: "ˈpleθərə" },
  { word: "pragmatic", pos: "a.", translation: "务实的；实用主义的", phonetic: "præɡˈmætɪk" },
  { word: "precarious", pos: "a.", translation: "危险的；不稳定的", phonetic: "prɪˈkeəriəs" },
  { word: "precipitate", pos: "vt.", translation: "促成；使加速", phonetic: "prɪˈsɪpɪteɪt" },
  { word: "predilection", pos: "n.", translation: "偏爱；偏好", phonetic: "ˌpriːdɪˈlekʃn" },
  { word: "prevaricate", pos: "vi.", translation: "支吾；搪塞", phonetic: "prɪˈværɪkeɪt" },
  { word: "profligate", pos: "a.", translation: "放荡的；挥霍的", phonetic: "ˈprɒflɪɡət" },
  { word: "prolific", pos: "a.", translation: "多产的；丰富的", phonetic: "prəˈlɪfɪk" },
  { word: "prosaic", pos: "a.", translation: "平淡的；乏味的", phonetic: "prəˈzeɪɪk" },
  { word: "pugnacious", pos: "a.", translation: "好斗的；好争吵的", phonetic: "pʌɡˈneɪʃəs" },
  { word: "quixotic", pos: "a.", translation: "不切实际的；空想的", phonetic: "kwɪkˈsɒtɪk" },
  { word: "recalcitrant", pos: "a.", translation: "顽抗的；不顺从的", phonetic: "rɪˈkælsɪtrənt" },
  { word: "reticent", pos: "a.", translation: "沉默寡言的", phonetic: "ˈretɪsnt" },
  { word: "sycophant", pos: "n.", translation: "马屁精；谄媚者", phonetic: "ˈsɪkəfænt" },
  { word: "taciturn", pos: "a.", translation: "沉默寡言的", phonetic: "ˈtæsɪtɜːrn" },
  { word: "tenacious", pos: "a.", translation: "坚韧的；顽强的", phonetic: "təˈneɪʃəs" },
  { word: "trenchant", pos: "a.", translation: "尖锐的；犀利的", phonetic: "ˈtrentʃənt" },
  { word: "ubiquitous", pos: "a.", translation: "无处不在的；普遍存在的", phonetic: "juːˈbɪkwɪtəs" },
  { word: "venerate", pos: "vt.", translation: "尊敬；崇敬", phonetic: "ˈvenəreɪt" },
  { word: "verbose", pos: "a.", translation: "冗长的；啰嗦的", phonetic: "vɜːrˈbəʊs" },
  { word: "vex", pos: "vt.", translation: "使烦恼；激怒", phonetic: "veks" },
  { word: "vindicate", pos: "vt.", translation: "证明无辜；证实", phonetic: "ˈvɪndɪkeɪt" },
  { word: "vociferous", pos: "a.", translation: "大声疾呼的；喧噪的", phonetic: "vəˈsɪfərəs" },
  { word: "voluble", pos: "a.", translation: "健谈的；流利的", phonetic: "ˈvɒljəbl" },
  { word: "wary", pos: "a.", translation: "警惕的；小心的", phonetic: "ˈweəri" },
  { word: "wheedle", pos: "v.", translation: "哄骗；骗取", phonetic: "ˈwiːdl" },
  { word: "zealot", pos: "n.", translation: "狂热者；极端分子", phonetic: "ˈzelət" },
];

// ───────────────────────── 词库元数据 ─────────────────────────
const BOOK_META = {
  "toefl-core": {
    name: "TOEFL 托福核心学术词",
    description:
      "托福 iBT 核心学术词汇，覆盖 TPO 真题高频动词与学科话题词（基于 ETS TPO 语料 + Academic Word List + NAWL）",
    level: "TOEFL",
    color: "red",
    dailyNew: 25,
    sources: [
      { level: "T0", name: "ETS TOEFL iBT 官方指南" },
      { level: "T2", name: "Academic Word List (AWL) + NAWL" },
    ],
  },
  "ielts-core": {
    name: "IELTS 雅思核心学术词",
    description:
      "雅思学术类核心词汇，覆盖 AWL 学术词族 + 剑桥真题高频同义替换与搭配（基于剑桥语料库 + Academic Word List）",
    level: "IELTS",
    color: "amber",
    dailyNew: 20,
    sources: [
      { level: "T0", name: "Cambridge IELTS 真题语料" },
      { level: "T2", name: "Academic Word List (AWL)" },
    ],
  },
  "gre-core": {
    name: "GRE 核心填空词汇",
    description:
      "GRE Verbal 核心填空高频词，覆盖近义词辨析与学术难词（基于 ETS 官方题库 + Magoosh + 巴朗 800 / 再要你命 3000）",
    level: "GRE",
    color: "slate",
    dailyNew: 30,
    sources: [
      { level: "T0", name: "ETS GRE 官方指南" },
      { level: "T2", name: "Barron's 800 + Magoosh GRE" },
    ],
  },
};

const WORD_SETS = {
  "toefl-core": TOEFL_WORDS,
  "ielts-core": IELTS_WORDS,
  "gre-core": GRE_WORDS,
};

// ───────────────────────── 工具函数 ─────────────────────────

/** 仅词库内部去重；跨词库不去重（每本词书是独立学习资源，同一词可出现于多本） */
function dedupeWithinBook(words) {
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const k = w.word.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** 写切片化词书（chunks + index.json），返回 { wordCount, chunkCount, words } */
function buildSlicedBook(bookId, words) {
  const meta = BOOK_META[bookId];
  if (!meta) throw new Error(`未知词库: ${bookId}`);

  // 同一词库内去重（按小写 word）
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    const k = w.word.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(w);
  }

  const total = unique.length;
  const chunkCount = Math.ceil(total / CHUNK_SIZE);
  const bookDir = path.join(bookDataDir, bookId);
  fs.mkdirSync(bookDir, { recursive: true });

  // 赋 frequency：GRE 难词最低（学术低频），TOEFL 中等，IELTS 中高
  // 范围：3000-6000，与现有词库 frequency 区间不冲突
  const freqBase = bookId === "gre-core" ? 3000 : bookId === "toefl-core" ? 4000 : 5000;
  const wordsWithFreq = unique.map((w, i) => ({
    word: w.word,
    pos: w.pos || undefined,
    translation: w.translation,
    frequency: freqBase + (total - 1 - i), // 越靠前 frequency 越高
    ...(w.phonetic ? { phonetic: w.phonetic } : {}),
  }));

  // 写切片
  const chunkFiles = [];
  for (let c = 0; c < chunkCount; c++) {
    const start = c * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, total);
    const slice = wordsWithFreq.slice(start, end);
    const name = `chunk-${String(c).padStart(3, "0")}.json`;
    fs.writeFileSync(
      path.join(bookDir, name),
      JSON.stringify(slice),
      "utf8"
    );
    chunkFiles.push(name);
  }

  // 写 index.json
  const index = {
    id: bookId,
    name: meta.name,
    description: meta.description,
    dailyNew: meta.dailyNew,
    sources: meta.sources,
    sliced: true,
    wordCount: total,
    chunkSize: CHUNK_SIZE,
    chunkCount,
    chunks: chunkFiles,
  };
  fs.writeFileSync(
    path.join(bookDir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf8"
  );

  console.log(
    `  ${bookId}: ${total} 词, ${chunkCount} 切片, ${meta.dailyNew} 词/日`
  );
  return { wordCount: total, chunkCount, words: unique };
}

/** 把新词追加到 dict-data 切片（DictEntry 格式），返回新增条目数 */
function appendToDictSlices(words, bookId, tags) {
  let added = 0;
  for (const w of words) {
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
      frequency: 4500, // 考试词库统一中等偏低 frequency
      tags,
      root: "",
      examples: [],
      synonyms: [],
      antonyms: [],
      collocations: [],
      wordFamily: [],
    };
    if (existsIdx >= 0) {
      // 合并：保留已有 definition/examples，覆盖基础字段
      arr[existsIdx] = {
        ...arr[existsIdx],
        ...entry,
        // 若已有 tags，合并
        tags: Array.from(
          new Set([...(arr[existsIdx].tags || []), ...tags])
        ),
      };
    } else {
      arr.push(entry);
      added++;
    }
    fs.writeFileSync(slicePath, JSON.stringify(arr), "utf8");
  }
  return added;
}

/** 重建 search-index.json（全量扫描 dict-data） */
function rebuildSearchIndex() {
  const seen = new Set();
  const entries = [];
  function scanDir(dir) {
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
        let arr;
        try {
          arr = JSON.parse(fs.readFileSync(path.join(ld, f), "utf8"));
        } catch {
          continue;
        }
        for (const e of arr) {
          const w = e?.word?.trim();
          if (!w) continue;
          const k = w.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          entries.push({ word: w, frequency: e.frequency ?? 0 });
        }
      }
    }
  }
  scanDir(dictRoot);
  entries.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  fs.writeFileSync(
    path.join(publicDir, "search-index.json"),
    JSON.stringify(entries),
    "utf8"
  );
  return entries.length;
}

/** 更新 book-data/index.json：确保三本词库已加入，元数据准确 */
function updateBookDataIndex(results) {
  const indexPath = path.join(bookDataDir, "index.json");
  let bookDataIndex = { books: [] };
  if (fs.existsSync(indexPath)) {
    try {
      bookDataIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch {
      bookDataIndex = { books: [] };
    }
  }

  for (const r of results) {
    const meta = BOOK_META[r.bookId];
    const existingIdx = bookDataIndex.books.findIndex((b) => b.id === r.bookId);
    const entry = {
      id: r.bookId,
      name: meta.name,
      description: meta.description,
      level: meta.level,
      wordCount: r.wordCount,
      dailyNew: meta.dailyNew,
      color: meta.color,
      sliced: true,
      chunkCount: r.chunkCount,
    };
    if (existingIdx >= 0) {
      bookDataIndex.books[existingIdx] = entry;
    } else {
      // 追加到列表末尾（在 dev-core 之后）
      bookDataIndex.books.push(entry);
    }
  }

  fs.writeFileSync(
    indexPath,
    JSON.stringify(bookDataIndex, null, 2),
    "utf8"
  );
  console.log(
    `[book-data/index.json] 更新 ${results.length} 个词库条目，共 ${bookDataIndex.books.length} 本词库`
  );
}

// ───────────────────────── 主流程 ─────────────────────────

function main() {
  console.log("[gen-exam-books] 开始生成托福/雅思/GRE 词库");
  console.log(`[gen-exam-books] 输出目录: ${bookDataDir}`);
  console.log("");

  const results = [];
  const allNewWords = []; // 用于 dict-data 同步

  // 1. 构建三本词库（每本独立去重，跨词库允许重复词）
  console.log("[gen-exam-books] 构建切片化词库:");
  for (const bookId of ["toefl-core", "ielts-core", "gre-core"]) {
    const rawWords = WORD_SETS[bookId];
    const uniqueInBook = dedupeWithinBook(rawWords);

    const result = buildSlicedBook(bookId, uniqueInBook);
    results.push({ bookId, ...result });

    // 收集用于 dict-data 同步的词（dict-data 会自动合并重复词的 tags）
    allNewWords.push({ bookId, words: uniqueInBook });
  }

  // 2. 同步到 dict-data 切片
  console.log("\n[gen-exam-books] 同步新词到 dict-data 切片:");
  let totalDictAdded = 0;
  for (const { bookId, words } of allNewWords) {
    const tags =
      bookId === "toefl-core"
        ? ["toefl", "academic"]
        : bookId === "ielts-core"
        ? ["ielts", "academic"]
        : ["gre", "advanced"];
    const added = appendToDictSlices(words, bookId, tags);
    totalDictAdded += added;
    console.log(`  ${bookId}: 新增 ${added} 词到 dict-data`);
  }
  console.log(`[dict-data] 共新增 ${totalDictAdded} 个词条`);

  // 3. 重建 search-index.json
  console.log("\n[gen-exam-books] 重建 search-index.json:");
  const indexCount = rebuildSearchIndex();
  console.log(`[search-index] 重建 ${indexCount} 条索引`);

  // 4. 更新 book-data/index.json
  console.log("\n[gen-exam-books] 更新 book-data/index.json:");
  updateBookDataIndex(results);

  // 5. 汇总
  const totalWords = results.reduce((s, r) => s + r.wordCount, 0);
  const totalChunks = results.reduce((s, r) => s + r.chunkCount, 0);
  console.log(
    `\n[gen-exam-books] ✅ 完成：${totalWords} 词, ${totalChunks} 切片, 3 词库`
  );
  console.log(`[gen-exam-books]    dict-data 新增 ${totalDictAdded} 词条`);
  console.log(`[gen-exam-books]    search-index 共 ${indexCount} 条`);
}

main();
