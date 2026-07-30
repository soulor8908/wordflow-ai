#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 生成「程序员 & AI 工作英语」词库（dev-core）。
 *
 * 覆盖：编程通用、Web/后端、数据/AI/大语言模型最新术语。
 * 产出：
 *   public/books/dev-core/index.json
 *   public/books/dev-core/chunk-000.json ... chunk-00X.json
 * 并把词条合并写入 public/dict-data/{letter}/{prefix}.json（DictEntry 格式）。
 */
const fs = require("fs");
const path = require("path");

const WORDS = [
  // ── 编程通用 ──
  { word: "algorithm", pos: "n.", translation: "算法；计算步骤", phonetic: "ˈælɡərɪðəm" },
  { word: "compile", pos: "vt.", translation: "编译；汇编", phonetic: "kəmˈpaɪl" },
  { word: "compiler", pos: "n.", translation: "编译器；编译程序", phonetic: "kəmˈpaɪlər" },
  { word: "runtime", pos: "n.", translation: "运行时；运行环境", phonetic: "ˈrʌntaɪm" },
  { word: "framework", pos: "n.", translation: "框架；架构", phonetic: "ˈfreɪmwɜːrk" },
  { word: "library", pos: "n.", translation: "库；程序库", phonetic: "ˈlaɪbrəri" },
  { word: "module", pos: "n.", translation: "模块；组件", phonetic: "ˈmɒdjuːl" },
  { word: "package", pos: "n.", translation: "包；软件包", phonetic: "ˈpækɪdʒ" },
  { word: "dependency", pos: "n.", translation: "依赖；依赖项", phonetic: "dɪˈpendənsi" },
  { word: "deprecated", pos: "a.", translation: "已弃用的；不推荐的", phonetic: "ˈdeprəkeɪtɪd" },
  { word: "asynchronous", pos: "a.", translation: "异步的", phonetic: "eɪˈsɪŋkrənəs" },
  { word: "concurrency", pos: "n.", translation: "并发；并发性", phonetic: "kənˈkʌrənsi" },
  { word: "parallel", pos: "a.", translation: "并行的；平行的", phonetic: "ˈpærəlel" },
  { word: "thread", pos: "n.", translation: "线程；线索", phonetic: "θred" },
  { word: "process", pos: "n.", translation: "进程；过程", phonetic: "ˈprɒses" },
  { word: "socket", pos: "n.", translation: "套接字；插座", phonetic: "ˈsɒkɪt" },
  { word: "buffer", pos: "n.", translation: "缓冲区；缓冲", phonetic: "ˈbʌfər" },
  { word: "cache", pos: "n.", translation: "缓存；高速缓存", phonetic: "kæʃ" },
  { word: "queue", pos: "n.", translation: "队列；排队", phonetic: "kjuː" },
  { word: "stack", pos: "n.", translation: "栈；堆栈", phonetic: "stæk" },
  { word: "heap", pos: "n.", translation: "堆；堆内存", phonetic: "hiːp" },
  { word: "pointer", pos: "n.", translation: "指针；指示器", phonetic: "ˈpɔɪntər" },
  { word: "reference", pos: "n.", translation: "引用；参考", phonetic: "ˈrefrəns" },
  { word: "garbage", pos: "n.", translation: "垃圾；无用数据", phonetic: "ˈɡɑːrbɪdʒ" },
  { word: "collection", pos: "n.", translation: "收集；集合", phonetic: "kəˈlekʃn" },
  { word: "iterator", pos: "n.", translation: "迭代器", phonetic: "ˈɪtəreɪtər" },
  { word: "generator", pos: "n.", translation: "生成器；发生器", phonetic: "ˈdʒenəreɪtər" },
  { word: "callback", pos: "n.", translation: "回调；回调函数", phonetic: "ˈkɔːlbæk" },
  { word: "promise", pos: "n.", translation: "承诺；Promise 异步对象", phonetic: "ˈprɒmɪs" },
  { word: "stream", pos: "n.", translation: "流；数据流", phonetic: "striːm" },
  { word: "pipeline", pos: "n.", translation: "管道；流水线", phonetic: "ˈpaɪplaɪn" },
  { word: "middleware", pos: "n.", translation: "中间件", phonetic: "ˈmɪdlweər" },
  { word: "boilerplate", pos: "n.", translation: "样板代码；模板", phonetic: "ˈbɔɪlərpleɪt" },
  { word: "syntax", pos: "n.", translation: "语法；句法", phonetic: "ˈsɪntæks" },
  { word: "semantic", pos: "a.", translation: "语义的", phonetic: "sɪˈmæntɪk" },
  { word: "pragma", pos: "n.", translation: "编译指示；语用", phonetic: "ˈpræɡmə" },
  { word: "literal", pos: "n.", translation: "字面量；字面值", phonetic: "ˈlɪtərəl" },
  { word: "variable", pos: "n.", translation: "变量；可变的", phonetic: "ˈveəriəbl" },
  { word: "constant", pos: "n.", translation: "常量；常数", phonetic: "ˈkɒnstənt" },
  { word: "scope", pos: "n.", translation: "作用域；范围", phonetic: "skəʊp" },
  { word: "closure", pos: "n.", translation: "闭包；关闭", phonetic: "ˈkləʊʒər" },
  { word: "recursion", pos: "n.", translation: "递归；递归调用", phonetic: "rɪˈkɜːrʒn" },
  { word: "iteration", pos: "n.", translation: "迭代；循环", phonetic: "ˌɪtəˈreɪʃn" },

  // ── Web / 后端 ──
  { word: "endpoint", pos: "n.", translation: "端点；API 端点", phonetic: "ˈendpɔɪnt" },
  { word: "payload", pos: "n.", translation: "有效载荷；请求体", phonetic: "ˈpeɪləʊd" },
  { word: "header", pos: "n.", translation: "请求头；标头", phonetic: "ˈhedər" },
  { word: "cookie", pos: "n.", translation: "Cookie；小甜饼", phonetic: "ˈkʊki" },
  { word: "session", pos: "n.", translation: "会话；一次会话", phonetic: "ˈseʃn" },
  { word: "token", pos: "n.", translation: "令牌；凭证", phonetic: "ˈtəʊkən" },
  { word: "credential", pos: "n.", translation: "凭证；证书", phonetic: "krəˈdenʃl" },
  { word: "authenticate", pos: "vt.", translation: "认证；鉴权", phonetic: "ɔːˈθentɪkeɪt" },
  { word: "authorize", pos: "vt.", translation: "授权；批准", phonetic: "ˈɔːθəraɪz" },
  { word: "encrypt", pos: "vt.", translation: "加密", phonetic: "ɪnˈkrɪpt" },
  { word: "decrypt", pos: "vt.", translation: "解密", phonetic: "diːˈkrɪpt" },
  { word: "hash", pos: "n.", translation: "哈希；散列", phonetic: "hæʃ" },
  { word: "salt", pos: "n.", translation: "盐值（加密）", phonetic: "sɔːlt" },
  { word: "certificate", pos: "n.", translation: "证书；凭证", phonetic: "səˈtɪfɪkət" },
  { word: "origin", pos: "n.", translation: "源；来源", phonetic: "ˈɒrɪdʒɪn" },
  { word: "cors", pos: "n.", translation: "跨域资源共享", phonetic: "kɔːrs" },
  { word: "webhook", pos: "n.", translation: "Webhook；回调钩子", phonetic: "ˈwebhʊk" },
  { word: "GraphQL", pos: "n.", translation: "GraphQL 查询语言", phonetic: "ɡræf kju əl" },
  { word: "serializer", pos: "n.", translation: "序列化器", phonetic: "ˈsɪəriəlaɪzər" },
  { word: "deserialize", pos: "vt.", translation: "反序列化", phonetic: "diːˈsɪəriəlaɪz" },
  { word: "schema", pos: "n.", translation: "模式；数据模式", phonetic: "ˈskiːmə" },
  { word: "migration", pos: "n.", translation: "迁移；数据库迁移", phonetic: "maɪˈɡreɪʃn" },
  { word: "shard", pos: "n.", translation: "分片；数据分片", phonetic: "ʃɑːrd" },
  { word: "replica", pos: "n.", translation: "副本；复本", phonetic: "ˈreplɪkə" },
  { word: "latency", pos: "n.", translation: "延迟；响应时间", phonetic: "ˈleɪtənsi" },
  { word: "throughput", pos: "n.", translation: "吞吐量；吞吐率", phonetic: "ˈθruːpʊt" },
  { word: "bandwidth", pos: "n.", translation: "带宽；频宽", phonetic: "ˈbændwɪdθ" },

  // ── 数据 / AI / 机器学习 ──
  { word: "dataset", pos: "n.", translation: "数据集", phonetic: "ˈdeɪtəset" },
  { word: "tensor", pos: "n.", translation: "张量", phonetic: "ˈtensɔːr" },
  { word: "gradient", pos: "n.", translation: "梯度；梯度向量", phonetic: "ˈɡreɪdiənt" },
  { word: "backpropagation", pos: "n.", translation: "反向传播", phonetic: "ˌbækprɒpəˈɡeɪʃn" },
  { word: "optimization", pos: "n.", translation: "优化；最优化", phonetic: "ˌɒptɪmaɪˈzeɪʃn" },
  { word: "regularization", pos: "n.", translation: "正则化", phonetic: "ˌreɡjuləraɪˈzeɪʃn" },
  { word: "normalization", pos: "n.", translation: "归一化；标准化", phonetic: "ˌnɔːməlaɪˈzeɪʃn" },
  { word: "embedding", pos: "n.", translation: "嵌入；嵌入表示", phonetic: "ɪmˈbedɪŋ" },
  { word: "vector", pos: "n.", translation: "向量；矢量", phonetic: "ˈvektər" },
  { word: "matrix", pos: "n.", translation: "矩阵", phonetic: "ˈmeɪtrɪks" },
  { word: "dimension", pos: "n.", translation: "维度；维", phonetic: "daɪˈmenʃn" },
  { word: "feature", pos: "n.", translation: "特征；功能", phonetic: "ˈfiːtʃər" },
  { word: "label", pos: "n.", translation: "标签；标注", phonetic: "ˈleɪbl" },
  { word: "inference", pos: "n.", translation: "推理；推断", phonetic: "ˈɪnfərəns" },
  { word: "training", pos: "n.", translation: "训练；模型训练", phonetic: "ˈtreɪnɪŋ" },
  { word: "fine-tuning", pos: "n.", translation: "微调；精调", phonetic: "ˌfaɪnˈtjuːnɪŋ" },
  { word: "pretrain", pos: "vt.", translation: "预训练", phonetic: "priːˈtreɪn" },
  { word: "checkpoint", pos: "n.", translation: "检查点；模型存档", phonetic: "ˈtʃekpɔɪnt" },
  { word: "epoch", pos: "n.", translation: "轮次；训练轮", phonetic: "ˈiːpɒk" },
  { word: "batch", pos: "n.", translation: "批次；批", phonetic: "bætʃ" },
  { word: "loss", pos: "n.", translation: "损失；损失值", phonetic: "lɒs" },
  { word: "accuracy", pos: "n.", translation: "准确率；精度", phonetic: "ˈækjərəsi" },
  { word: "precision", pos: "n.", translation: "精确率；精度", phonetic: "prɪˈsɪʒn" },
  { word: "recall", pos: "n.", translation: "召回率；召回", phonetic: "rɪˈkɔːl" },
  { word: "overfitting", pos: "n.", translation: "过拟合", phonetic: "ˌəʊvərˈfɪtɪŋ" },
  { word: "underfitting", pos: "n.", translation: "欠拟合", phonetic: "ˌʌndərˈfɪtɪŋ" },
  { word: "classifier", pos: "n.", translation: "分类器", phonetic: "ˈklæsɪfaɪər" },
  { word: "regression", pos: "n.", translation: "回归；回归分析", phonetic: "rɪˈɡreʃn" },
  { word: "clustering", pos: "n.", translation: "聚类", phonetic: "ˈklʌstərɪŋ" },
  { word: "reinforcement", pos: "n.", translation: "强化；强化学习", phonetic: "ˌriːɪnˈfɔːrsmənt" },
  { word: "supervised", pos: "a.", translation: "有监督的", phonetic: "ˈsuːpəvaɪzd" },
  { word: "unsupervised", pos: "a.", translation: "无监督的", phonetic: "ˌʌnsuːpəvaɪzd" },
  { word: "neural", pos: "a.", translation: "神经的", phonetic: "ˈnjʊərəl" },
  { word: "neuron", pos: "n.", translation: "神经元", phonetic: "ˈnjʊərɒn" },
  { word: "perceptron", pos: "n.", translation: "感知器", phonetic: "pəˈseptrɒn" },
  { word: "activation", pos: "n.", translation: "激活；激活函数", phonetic: "ˌæktɪˈveɪʃn" },
  { word: "sigmoid", pos: "n.", translation: "S 型函数；sigmoid", phonetic: "ˈsɪɡmɔɪd" },
  { word: "softmax", pos: "n.", translation: "softmax 归一化", phonetic: "sɒftmæks" },
  { word: "attention", pos: "n.", translation: "注意力；注意力机制", phonetic: "əˈtenʃn" },
  { word: "transformer", pos: "n.", translation: "Transformer 架构", phonetic: "trænsˈfɔːrmər" },
  { word: "encoder", pos: "n.", translation: "编码器", phonetic: "ɪnˈkəʊdər" },
  { word: "decoder", pos: "n.", translation: "解码器", phonetic: "diːˈkəʊdər" },
  { word: "tokenization", pos: "n.", translation: "分词；标记化", phonetic: "ˌtəʊkənaɪˈzeɪʃn" },
  { word: "tokenizer", pos: "n.", translation: "分词器", phonetic: "ˈtəʊkənaɪzər" },
  { word: "prompt", pos: "n.", translation: "提示词；提示", phonetic: "prɒmpt" },
  { word: "context", pos: "n.", translation: "上下文；语境", phonetic: "ˈkɒntekst" },
  { word: "contextual", pos: "a.", translation: "上下文的；语境的", phonetic: "kənˈtekstʃuəl" },
  { word: "hallucination", pos: "n.", translation: "幻觉；模型幻觉", phonetic: "həˌluːsɪˈneɪʃn" },
  { word: "alignment", pos: "n.", translation: "对齐；价值对齐", phonetic: "əˈlaɪnmənt" },
  { word: "grounding", pos: "n.", translation: "接地；事实依据", phonetic: "ˈɡraʊndɪŋ" },
  { word: "guardrail", pos: "n.", translation: "护栏；安全护栏", phonetic: "ˈɡɑːrdreɪl" },
  { word: "rag", pos: "n.", translation: "检索增强生成", phonetic: "ræɡ" },
  { word: "agent", pos: "n.", translation: "智能体；代理", phonetic: "ˈeɪdʒənt" },
  { word: "agentic", pos: "a.", translation: "智能体的；自主的", phonetic: "eɪˈdʒentɪk" },
  { word: "multimodal", pos: "a.", translation: "多模态的", phonetic: "ˌmʌltiˈməʊdl" },
  { word: "diffusion", pos: "n.", translation: "扩散；扩散模型", phonetic: "dɪˈfjuːʒn" },
  { word: "generative", pos: "a.", translation: "生成的；生成式的", phonetic: "ˈdʒenərətɪv" },
  { word: "parameter", pos: "n.", translation: "参数；参量", phonetic: "pəˈræmɪtər" },
  { word: "hyperparameter", pos: "n.", translation: "超参数", phonetic: "ˌhaɪpərˈpærəmɪtər" },
  { word: "quantization", pos: "n.", translation: "量化；模型量化", phonetic: "ˌkwɒntaɪˈzeɪʃn" },
  { word: "distillation", pos: "n.", translation: "蒸馏；知识蒸馏", phonetic: "ˌdɪstɪˈleɪʃn" },
  { word: "pruning", pos: "n.", translation: "剪枝；模型剪枝", phonetic: "ˈpruːnɪŋ" },
  { word: "benchmark", pos: "n.", translation: "基准测试；基准", phonetic: "ˈbentʃmɑːrk" },
  { word: "eval", pos: "n.", translation: "评测；评估", phonetic: "ɪˈvæl" },
  { word: "context window", pos: "n.", translation: "上下文窗口", phonetic: "ˈkɒntekst ˈwɪndəʊ" },
  { word: "few-shot", pos: "a.", translation: "少样本的", phonetic: "fjuː ʃɒt" },
  { word: "zero-shot", pos: "a.", translation: "零样本的", phonetic: "ˈzɪərəʊ ʃɒt" },
  { word: "chain-of-thought", pos: "n.", translation: "思维链", phonetic: "tʃeɪn əv θɔːt" },
  { word: "tooling", pos: "n.", translation: "工具链；工具", phonetic: "ˈtuːlɪŋ" },
  { word: "orchestrate", pos: "vt.", translation: "编排；统一调度", phonetic: "ˈɔːkɪstreɪt" },
  { word: "orchestration", pos: "n.", translation: "编排；调度", phonetic: "ˌɔːkɪˈstreɪʃn" },
  { word: "latency", pos: "n.", translation: "延迟", phonetic: "ˈleɪtənsi" },
  { word: "observability", pos: "n.", translation: "可观测性", phonetic: "əbˌzɜːvəˈbɪləti" },
  { word: "telemetry", pos: "n.", translation: "遥测；遥测数据", phonetic: "təˈlemətri" },
  { word: "idempotent", pos: "a.", translation: "幂等的", phonetic: "ˌaɪdəmˈpəʊtnt" },
  { word: "atomic", pos: "a.", translation: "原子的；原子性", phonetic: "əˈtɒmɪk" },
  { word: "immutable", pos: "a.", translation: "不可变的", phonetic: "ɪˈmjuːtəbl" },
  { word: "stateless", pos: "a.", translation: "无状态的", phonetic: "ˈsteɪtləs" },
  { word: "stateful", pos: "a.", translation: "有状态的", phonetic: "ˈsteɪtfl" },
];

const CHUNK_SIZE = 100;
const publicDir = path.join(process.cwd(), "public");
const bookDir = path.join(publicDir, "books", "dev-core");

// 去重
const seen = new Set();
const unique = WORDS.filter((w) => {
  const k = w.word.toLowerCase();
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

// 写 chunk 文件
fs.mkdirSync(bookDir, { recursive: true });
const chunks = [];
for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
  const slice = unique.slice(i, i + CHUNK_SIZE).map((w, j) => ({
    word: w.word,
    pos: w.pos,
    translation: w.translation,
    frequency: 9000 - (i + j),
    ...(w.phonetic ? { phonetic: w.phonetic } : {}),
  }));
  const name = `chunk-${String(i / CHUNK_SIZE).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(bookDir, name), JSON.stringify(slice), "utf8");
  chunks.push(name);
}

// 写 index.json
const indexJson = {
  id: "dev-core",
  name: "程序员 & AI 工作英语",
  description:
    "覆盖编程通用、Web/后端、数据/AI/大语言模型最新术语，适合开发者阅读英文文档与技术交流",
  dailyNew: 15,
  sources: [
    { level: "T2", name: "WordFlow curated" },
    { level: "T3", name: "developer glossary" },
  ],
  sliced: true,
  wordCount: unique.length,
  chunkSize: CHUNK_SIZE,
  chunkCount: chunks.length,
  chunks,
};
fs.writeFileSync(
  path.join(bookDir, "index.json"),
  JSON.stringify(indexJson, null, 2),
  "utf8"
);

// 合并写入 dict 切片（DictEntry 格式，便于词条页展示富数据）
const dictRoot = path.join(publicDir, "dict-data");
for (const w of unique) {
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
    frequency: 5000,
    tags: ["dev", "ai"],
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
  }
  fs.writeFileSync(slicePath, JSON.stringify(arr), "utf8");
}

console.log(`[dev-core] ${unique.length} words, ${chunks.length} chunks, dict slices updated`);
