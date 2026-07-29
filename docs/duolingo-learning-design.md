# WordFlow × 多邻国：产品设计与技术实现方案

> 调研多邻国（Duolingo）最新产品形态，筛选出**性价比高、成本低、契合 WordFlow 本地优先 + 单人学习 + 查词即背词定位**的特性，给出可落地的产品设计与技术方案。
>
> 设计视角：乔布斯（产品哲学 / 取舍 / 情绪）
> 技术视角：卡帕西（系统简洁 / 本地优先 / 可验证 / 不过度工程）

---

## 一、调研总结：多邻国为什么让人"上瘾"

多邻国 2025 年营收突破 10 亿美元，DAU 5650 万，月活 1.37 亿。它的成功不在内容深度，而在**用游戏化机制制造行为成瘾**——一场数字版斯金纳箱实验。核心机制拆解：

| 机制 | 心理学原理 | 实测效果 |
|------|------------|----------|
| **连胜 Streak** | 损失规避（lose aversion） | iOS 小部件让承诺度 +60% |
| **连胜保护 Streak Freeze** | 给"沉没成本"一个出口 | 高危用户流失率 -21% |
| **XP + 等级** | 进度可视化 + 目标梯度效应 | 主动看排行榜的用户每周多完成 40% 课程 |
| **联赛 Leagues**（青铜→钻石 10 级） | 社会认同 + 竞争 | 课程完成率 +25% |
| **每日任务 Daily Quests** | 短期可达成目标 | DAU +25% |
| **徽章 Achievements** | 收集欲 + 完成 bias | 课程完成率 +30% |
| **宝箱 Treasure Chest** | 变比率奖励（斯金纳箱） | 完成率 +15% |
| **吉祥物 Duo + 角色** | 拟人化共情 | 委屈 Duo 让次日留存 +23% |
| **通知组合**（routine + save） | 多动机钩子轮换 | 新用户留存 +2%（KDD 论文） |

多邻国的产品哲学可以浓缩成一句话：

> **"夸用户 → 让用户自我感觉很棒 → 更愿意学"**
> 游戏化最强的闭环不是功能闭环，而是**用户成就感递增的闭环**。

它有几个反常识的设计原则特别值得 WordFlow 借鉴：

1. **More is Less**：宁可多几个页面、多几句夸奖，也要让每一步决策都轻松。多邻国的新人引导有近 20 个页面，反而提升了通过率——因为每一步都很轻。
2. **永远关注情绪 > 学习效果**：读错了不纠音、不重读，"你能开口就已经很牛"。降低负反馈比提升准确度更重要。
3. **通知钩住动机，不钩功能**：每条推送都指向用户已经投入情感的东西（连胜/排名/朋友），而不是"打开 App"这种空话。
4. **角色组合 > 单一吉祥物**：Lily 的毒舌、Oscar 的日记体、Duo 的委屈——一个角色组合轮换，避免单一钩子疲劳。

---

## 二、WordFlow 现状对比

WordFlow 已有的好底子：

| 已有能力 | 对应多邻国机制 | 评价 |
|----------|----------------|------|
| Streak（当前 + 最长） | 连胜 | ✓ 有基础，但缺保护机制 |
| GitHub 风格热力图 | — | ✓ 比多邻国更直观 |
| FSRS v5 间隔重复 | — | ✓ 算法层比多邻国 SM-2 更强 |
| 常错词自动统计 | — | ✓ 多邻国没有 |
| 完成页情感激励文案 | 夸夸系统 | ✓ 雏形已有，但场景单一 |
| 用户画像（CEFR/日均新词/偏好时段） | — | ✓ 数据已有，未用于激励 |
| PWA 通知 | 推送 | ✓ 通道已通，但内容单一 |
| AI 助手 | Video Call / Role Play | ✓ 通道已通，未与学习闭环结合 |
| OnboardingDialog | 新人引导 | △ 只有选词书，缺动机/目标 |
| 刷题模式 | — | ✓ 多邻国没有的强项 |

WordFlow 缺失的（与多邻国相比）：

- **连胜保护**：断签即清零，无任何缓冲，违反"降低负反馈"原则
- **每日任务**：用户每天只有"复习完"这一个目标，缺微小成就感
- **成就徽章**：学到 100 词、连签 7 天等里程碑无任何标记
- **回归机制**：断签后无任何挽留，硬重置
- **通知组合**：PWA 通知只有"该复习了"一类，未绑定动机
- **情绪化角色**：产品完全无人格，冷冰冰的工具感
- **XP / 等级**：学习量无统一计量，进度感弱

---

## 三、特性筛选矩阵

按 **价值 × 成本 × 契合度** 三维度筛选。WordFlow 的硬约束是：本地优先（IndexedDB）、单人学习（无社交后端）、免费无广告、查词即背词（不是课程型 App）。因此所有需要社交后端、重内容生产、与 SRS 学习闭环冲突的特性都被排除。

### Tier 1 —— 必做（高价值 / 低成本 / 强契合）

| 特性 | 价值 | 成本 | 契合理由 |
|------|------|------|----------|
| **连胜保护** | ★★★★★ | 极低 | 纯本地，单条 IndexedDB 记录；救场 N 次/周期 |
| **每日任务（3 个小目标）** | ★★★★★ | 低 | 复用现有 recordStudy 数据，纯本地计算 |
| **成就徽章系统** | ★★★★ | 低 | 基于已有 streak / card / accuracy 派生 |
| **回归挽留机制** | ★★★★ | 极低 | 断签后首启文案 + 重新起航任务 |
| **XP + 等级** | ★★★ | 低 | 把新学/复习/正确率统一折算成 XP，纯本地 |
| **通知组合升级** | ★★★★ | 低 | PWA 已通，只需丰富文案模板 + 触发时机 |

### Tier 2 —— 应做（中价值 / 中成本 / 良好契合）

| 特性 | 价值 | 成本 | 契合理由 |
|------|------|------|----------|
| **宝箱惊喜奖励** | ★★★ | 低 | 在复习流中随机掉落，变比率强化 |
| **角色化人格** | ★★★ | 中 | 一个轻量 SVG 吉祥物 + 通知语气分化 |
| **进度路径可视化** | ★★ | 中 | 词书进度条升级为节点路径（不是多邻国完整 winding road） |

### Tier 3 —— 不做（高成本或低契合）

| 特性 | 不做理由 |
|------|----------|
| **联赛 Leagues** | 需要社交后端 + 用户匹配，与"本地优先 + 单人"根本冲突 |
| **红心 Hearts** | WordFlow 是 SRS 复习不是答题闯关，扣命反而阻碍复习闭环 |
| **AI Video Call** | 成本高、对单词学习 ROI 低（多邻国用于口语会话） |
| **Stories / Podcasts** | 重内容生产，偏离"查词即背词"核心 |
| **完整 winding road** | 词书是线性列表，硬塞游戏化路径会破坏查词优先的信息架构 |

---

## 四、产品设计（乔布斯视角）

### 4.1 设计哲学：一句话定位

> **"不是把多邻国搬过来，而是把多邻国对'人'的理解，嫁接到 WordFlow 对'词'的理解上。"**

多邻国解决的是"人为什么不坚持"。WordFlow 解决的是"查过就忘"。两者的交集是**让每天的复习成为一件用户主动想做的事**，而不是算法派下来的任务单。

乔布斯会问的第一个问题：**"用户为什么要在第 30 天还打开 WordFlow？"** 不是因为 FSRS 算得准——那是工程师的自嗨。是因为**他不想让那条连胜断掉**，是因为**今天的 3 个小任务还差一个**，是因为**离下一个徽章只差 20 个词**。

所以我们不是在加功能，我们是在**给现有的优秀算法穿上一件让人愿意每天见的外衣**。

### 4.2 六个核心特性设计

#### 特性 1：连胜保护（Streak Freeze）

**目标**：把"断签 = 清零"的硬规则改成"断签 = 用一张保护券"。

**体验**：
- 每个用户默认持有 **1 张**连胜保护券，断签当天自动消耗，连胜不变。
- 每连续 7 天学习，自动补充 1 张（上限 2 张）。
- 统计页连胜卡片旁显示"🛡️ 保护券 ×N"。
- 断签后首启弹窗：不是冷冰冰的"连胜已重置"，而是
  > "昨天没来？没关系，连胜保住了（用了 1 张保护券）。今天继续，还差 X 天破纪录。"

**为什么这样设计**：多邻国的数据是保护券让高危用户流失 -21%。但多邻国保护券要花宝石买，WordFlow 没有货币系统——所以改成"时间换保护"，鼓励持续学习而非交易。这更纯粹，也更符合 WordFlow"不折腾"的承诺。

#### 特性 2：每日三任务（Daily Quests）

**目标**：把"复习完所有卡片"这个大目标，拆成 3 个小到不可能失败的目标，制造"再来一个"的冲动。

**三个任务设计**（每日 0 点本地重置）：
1. **复习 10 张卡片**（或今日队列的 50%，取小）—— 蔡格尼克效应，未完成会惦记
2. **答对 15 次**（评分 Good/Easy）—— 强化正反馈
3. **查 1 个新词并收藏** —— 把用户引导回首页核心闭环，不是只在复习页打转

**体验**：
- 首页"今日学习提醒"卡片下方，新增一行小进度：`🎯 2/3 · 复习 10 ✓ · 答对 15 (12) · 查词 ✓`
- 复习页顶部进度条旁，并列显示任务进度。
- 三任务全完成，弹出轻量庆祝（不是全屏弹窗，是顶部 toast）："今日三连完成 +30 XP"，并解锁一个微小宝箱（见特性 7）。

**为什么是这三个任务**：乔布斯会砍掉"学习 30 分钟"这种过程型任务——那是计时的自嗨。我们要的是**指向行为的任务**：复习（留存）、答对（质量）、查词（拉新）。每个任务都把用户推向产品的一个核心闭环。

#### 特性 3：成就徽章（Achievements）

**目标**：给长期学习一个可见的"勋章墙"，让用户回望时有获得感。

**徽章设计**（4 类，每类 3-4 级）：

| 类别 | 徽章示例 | 触发条件 |
|------|----------|----------|
| **坚持** | 7天 / 30天 / 100天 / 365天 连胜 | Streak 里程碑 |
| **积累** | 100 / 500 / 2000 / 5000 词入队 | card: 计数 |
| **精度** | 连续 7 天正确率 ≥ 90% | StudyLog 派生 |
| **探索** | 查过 50 / 200 / 1000 个不同词 | 搜索历史派生 |

**体验**：
- 统计页新增"成就"区块，未解锁的徽章灰显+解锁条件，已解锁的亮起+解锁日期。
- 解锁瞬间顶部 toast："🏅 解锁「积累 · 500 词」"。
- 不做炫耀分享——单人产品，自我满足足够。

**为什么这样设计**：徽章是多邻国 +30% 完成率的功臣。但多邻国的徽章有几十个，膨胀了。WordFlow 只做 16 个，每个都对应真实的学习行为，没有"分享到朋友圈"这种虚荣徽章。**少即是多。**

#### 特性 4：回归挽留（Comeback Mechanics）

**目标**：断签后不是惩罚，是重新起航的仪式。

**体验**：
- 断签 1-3 天后首启：连胜保护自动消耗（若有），无任何负面文案。
- 断签 ≥7 天后首启：不显示"你 X 天没来了"，而是
  > "欢迎回来。过去的连胜已经过去，但今天是一个新的开始。第一张卡片，就从这里。"
  并赠送 1 张连胜保护券（如果当前为 0）。
- 统计页最长连胜旁边新增一句："上一个巅峰是 N 天，这一次能超过吗？"

**为什么这样设计**：多邻国回归机制的核心是**不羞辱用户**。WordFlow 现在断签就清零，没有任何缓冲，是体验最大漏洞。回归用户的挽留 ROI 远高于拉新——他们已经认可过产品价值。

#### 特性 5：XP 与等级（统一计量）

**目标**：把新学/复习/正确率统一成一个数字，让"今天学了什么"变成"今天赚了多少 XP"。

**XP 规则**（纯本地计算，无货币）：
- 新学 1 词：+10 XP
- 复习 1 词且 Good：+5 XP，Easy：+8 XP，Hard：+3 XP，Again：+1 XP
- 查词并收藏：+2 XP
- 完成每日三任务：+30 XP

**等级**（轻量，不喧宾夺主）：
- 5 级制：萌新 / 学徒 / 行家 / 达人 / 词神
- 升级阈值：100 / 500 / 2000 / 5000 / 10000 XP（累计）
- 等级显示在首页顶部 header 旁，一个小标签：`学徒 · 320 XP`

**为什么这样设计**：多邻国的 XP 系统复杂到有"15 分钟双倍 XP 组合"这种算计。WordFlow 不需要——我们不要用户为 XP 而刷，我们要的是**给已有学习行为一个可见的计量**。所以 XP 是只读的、派生的、不可消费的。它只回答一个问题："我在 WordFlow 上到底投入了多少？"

#### 特性 6：通知组合升级

**目标**：把 PWA 通知从"该复习了"升级为多动机钩子组合。

**两类通知**（沿用多邻国的 routine / save 模型）：

1. **Routine 通知**（习惯时段，用户上次活跃时段附近）：
   - 连胜型："今天的连胜还差 1 张卡片，3 分钟搞定。"
   - 任务型："今日三任务还差 1 个，来看看？"
   - 进度型："还差 20 个词解锁「积累 · 500」徽章。"

2. **Save 通知**（连胜即将断裂前 2 小时）：
   - "⚠️ 连续 N 天的连胜，今晚 24:00 前不复习就断了。"（仅当无保护券时）
   - 有保护券时则不发送 save 通知——保护券已经给了缓冲，再催就是骚扰。

**角色语气**（轻量，不做完整角色系统）：
- 通知署名固定为 "—— WordFlow"，但文案风格分化：
  - 温柔型："今天还没来呀，等你。"
  - 直接型："N 张卡片待复习，3 分钟。"
  - 挑战型："连胜 N 天，今晚见分晓。"
- 轮换发送，单用户一周内不重复同一风格。

**为什么这样设计**：多邻国 KDD 论文证明，通知内容用 bandit 算法优化能 +2% 新用户留存。WordFlow 不需要 bandit，但需要**通知绑定动机**这个核心原则。通知不是为了"打开 App"，是为了"不让用户失去他在意的东西"。

---

## 五、技术实现方案（卡帕西视角）

### 5.1 架构原则

卡帕西会反复强调的几条：

1. **本地优先不变**：所有新特性都在 IndexedDB（Dexie）里跑，不引入任何新的服务端依赖。Cloudflare Pages 仍是静态托管 + AI 路由。
2. **派生而非新增**：XP、徽章、任务进度全部从已有的 `StudyLog` / `WordCard` / 搜索历史派生，不维护冗余状态。
3. **纯函数 + 可测**：所有规则计算（XP 折算、徽章判定、连胜保护消耗）写成纯函数，复用现有 vitest 测试范式。
4. **不过度工程**：不引入状态机库、不引入事件总线、不引入新的持久层。复用现有的 `lib/storage/db.ts` + `lib/stats/streak-io.ts` 范式。
5. **可灰度**：新特性用 feature flag 包裹（localStorage 开关），默认开启但可一键关闭，方便回滚。

### 5.2 数据模型变更

所有变更都在现有 Dexie schema 内，通过新增 key 前缀实现，**不改 schema 版本**（保持向上兼容）。

```typescript
// lib/gamification/types.ts （新增）

/** 连胜保护券状态 */
interface StreakShieldState {
  shields: number;          // 当前持有数（上限 2）
  lastEarnedDate: string;   // YYYY-MM-DD，上次通过连签获得的时间
  lastUsedDate: string | null; // 上次消耗时间
}

/** 每日任务状态（每日重置） */
interface DailyQuestState {
  date: string;             // YYYY-MM-DD
  reviewed: number;         // 已复习张数
  correct: number;          // 已答对次数（Good/Easy）
  searched: boolean;        // 是否查词并收藏
  claimed: boolean;         // 是否领取了完成奖励
}

/** 徽章解锁记录 */
interface BadgeRecord {
  id: string;               // 如 "streak-30"
  unlockedAt: string;       // ISO 时间
}

/** XP 总账（只读派生 + 缓存） */
interface XpState {
  total: number;            // 累计 XP
  lastSyncedDate: string;   // 最近一次同步到 StudyLog 的日期
}
```

**存储位置**（复用现有 key 前缀范式）：

| 数据 | Key | 说明 |
|------|-----|------|
| 连胜保护 | `gamification:shield` | 单条记录 |
| 每日任务 | `gamification:quests:{YYYY-MM-DD}` | 按日分片，旧的可清理 |
| 徽章解锁 | `gamification:badge:{badgeId}` | 每个徽章一条 |
| XP 缓存 | `gamification:xp` | 单条，可从 StudyLog 重算 |

### 5.3 核心模块划分

```
lib/gamification/                    （新增目录）
  ├── types.ts                       # 类型定义
  ├── shield.ts                      # 连胜保护：消耗 / 补充 / 查询（纯函数 + IO）
  ├── daily-quests.ts                # 每日任务：状态机 / 进度更新 / 完成判定
  ├── badges.ts                      # 徽章：规则表 / 判定 / 解锁记录
  ├── xp.ts                          # XP：折算规则 / 等级映射 / 增量计算
  ├── notifications.ts               # 通知组合：模板池 / 触发时机 / 风格轮换
  └── __tests__/
      ├── shield.test.ts
      ├── daily-quests.test.ts
      ├── badges.test.ts
      ├── xp.test.ts
      └── notifications.test.ts
```

### 5.4 关键算法实现

#### 5.4.1 连胜保护消耗逻辑

连胜保护的消耗发生在 `recordStudy` 写入 Streak 之前。修改 [lib/stats/streak-io.ts](file:///workspace/lib/stats/streak-io.ts) 的 `recordStudy` 流程：

```typescript
// lib/gamification/shield.ts
export function shouldConsumeShield(
  prevStreak: StreakState | undefined,
  today: string,
  shield: StreakShieldState
): boolean {
  if (!prevStreak) return false;
  if (prevStreak.lastReviewDate === today) return false;
  const gap = daysBetween(prevStreak.lastReviewDate, today);
  // 间隔 1 天且明天才补：消耗保护券保住连胜
  return gap === 1 && shield.shields > 0;
}

// 补充规则：连签 7 天 +1，上限 2
export function maybeEarnShield(
  streak: StreakState,
  shield: StreakShieldState,
  today: string
): StreakShieldState {
  if (streak.currentStreak > 0 && streak.currentStreak % 7 === 0) {
    if (shield.lastEarnedDate !== today && shield.shields < 2) {
      return { ...shield, shields: shield.shields + 1, lastEarnedDate: today };
    }
  }
  return shield;
}
```

**关键**：保护券只在"隔 1 天"时生效，隔 ≥2 天不消耗（因为多邻国也是单日保护）。这样规则简单、可测、无歧义。

#### 5.4.2 每日任务进度钩子

任务进度不是新的写入点，而是**订阅现有的学习事件**。在 [review-session.ts](file:///workspace/lib/review/review-session.ts) 的 `submitReview` 和首页 `handlePick`（收藏）后，调用 gamification 更新：

```typescript
// lib/gamification/daily-quests.ts
export function bumpReviewQuest(
  state: DailyQuestState,
  rating: Rating
): DailyQuestState {
  return {
    ...state,
    reviewed: state.reviewed + 1,
    correct: state.correct + (rating === "Good" || rating === "Easy" ? 1 : 0),
  };
}

export function isQuestComplete(state: DailyQuestState): boolean {
  return (
    state.reviewed >= 10 &&
    state.correct >= 15 &&
    state.searched
  );
}
```

**任务目标值的来源**：复习 10 张 = `min(10, todayQueue.length * 0.5)`，避免队列只有 3 张时任务永远完不成。这是卡帕西式的边界处理——不假设用户场景。

#### 5.4.3 徽章判定（派生 + 增量）

徽章不做实时监听，而是**在关键事件后批量判定未解锁的徽章**。触发时机：
- `recordStudy` 完成后（streak 类、精度类）
- `addFavorite` 后（积累类）
- 搜索后（探索类）

```typescript
// lib/gamification/badges.ts
export const BADGE_RULES: BadgeRule[] = [
  { id: "streak-7",  category: "streak",   name: "一周之约",  check: (s) => s.streak.currentStreak >= 7 },
  { id: "streak-30", category: "streak",   name: "月度坚持",  check: (s) => s.streak.currentStreak >= 30 },
  { id: "streak-100",category: "streak",   name: "百日不辍",  check: (s) => s.streak.currentStreak >= 100 },
  { id: "vocab-100", category: "vocab",    name: "百词斩",    check: (s) => s.totalCards >= 100 },
  { id: "vocab-500", category: "vocab",    name: "词汇猎人",  check: (s) => s.totalCards >= 500 },
  { id: "accuracy-7",category: "accuracy", name: "精准七日",  check: (s) => s.last7DaysAccuracy >= 0.9 && s.consecutiveQualifiedDays >= 7 },
  // ...
];

export async function evaluateBadges(ctx: BadgeContext): Promise<BadgeRecord[]> {
  const unlocked = await listItemsByPrefix<BadgeRecord>("gamification:badge:");
  const unlockedIds = new Set(unlocked.map((b) => b.id));
  const newlyUnlocked: BadgeRecord[] = [];
  for (const rule of BADGE_RULES) {
    if (unlockedIds.has(rule.id)) continue;
    if (rule.check(ctx)) {
      const record: BadgeRecord = { id: rule.id, unlockedAt: new Date().toISOString() };
      await putItem(`gamification:badge:${rule.id}`, record);
      newlyUnlocked.push(record);
    }
  }
  return newlyUnlocked;
}
```

**为什么不在每次 setState 时判定**：徽章判定需要聚合数据（总卡片数、7 天正确率），频繁调用会重复 IO。卡帕西原则：**只在状态变更点判定，且只判定未解锁的**。

#### 5.4.4 XP 折算（纯函数）

XP 完全派生，可从 StudyLog 全量重算（用于首次迁移或缓存损坏）：

```typescript
// lib/gamification/xp.ts
export function xpFromStudyLog(log: StudyLog): number {
  // 估算：新学 10/词，复习 Good 5 / Easy 8 / Hard 3 / Again 1
  // StudyLog 没有 rating 分布，只有 correctCount，用保守估算
  const reviewXp = log.correctCount * 5 + (log.reviewCount - log.correctCount) * 1;
  return log.newCount * 10 + reviewXp;
}

export function levelFromXp(total: number): Level {
  const levels = [
    { name: "萌新",  min: 0,     max: 100 },
    { name: "学徒",  min: 100,   max: 500 },
    { name: "行家",  min: 500,   max: 2000 },
    { name: "达人",  min: 2000,  max: 5000 },
    { name: "词神",  min: 5000,  max: Infinity },
  ];
  return levels.find((l) => total >= l.min && total < l.max)!;
}
```

**增量更新**：日常使用时，在 `submitReview` 后调用 `addXp(delta)`，只写增量到 `gamification:xp`。首次启用时从 `listStudyLogs()` 全量重算一次。

#### 5.4.5 通知组合调度

复用现有 [notification-settings.ts](file:///workspace/lib/pwa/notification-settings.ts) 的 PWA 通道，扩展内容层：

```typescript
// lib/gamification/notifications.ts
export type NotificationMotive = "streak" | "quest" | "badge" | "comeback";
export type NotificationTone = "gentle" | "direct" | "challenge";

interface NotificationTemplate {
  motive: NotificationMotive;
  tone: NotificationTone;
  build: (ctx: NotificationContext) => { title: string; body: string };
}

export const TEMPLATES: NotificationTemplate[] = [
  {
    motive: "streak", tone: "challenge",
    build: (c) => ({
      title: `${c.streakDays} 天连胜，今晚见分晓`,
      body: `24:00 前不复习就断了。${c.dueCount} 张卡片，3 分钟。`,
    }),
  },
  {
    motive: "quest", tone: "direct",
    build: (c) => ({
      title: "今日三任务还差 1 个",
      body: `已完成 ${c.questDone}/3，来看一眼？`,
    }),
  },
  // ...
];

/** 选模板：save 优先级 > routine；同优先级内轮换 tone 避免疲劳 */
export function pickTemplate(ctx: NotificationContext, lastTone: NotificationTone): NotificationTemplate {
  const eligible = TEMPLATES.filter((t) => t.motive === ctx.motive);
  const rotated = eligible.filter((t) => t.tone !== lastTone);
  return (rotated.length > 0 ? rotated : eligible)[0];
}
```

**触发时机**：
- Routine 通知：用户设定的学习时段前 30 分钟，由 Service Worker 定时触发。
- Save 通知：每日 22:00 检查——若今日未学习且无保护券且连胜 ≥3，发一次。

**不引入 bandit 算法**：多邻国的 bandit 是为亿级用户优化模板池。WordFlow 单用户场景下，简单的 tone 轮换 + 规则触发就足够，引入 bandit 是过度工程。

### 5.5 与现有代码的集成点

| 现有文件 | 集成方式 | 改动量 |
|----------|----------|--------|
| [lib/stats/streak-io.ts](file:///workspace/lib/stats/streak-io.ts) `recordStudy` | 在写入 Streak 前调用 `shouldConsumeShield`，若消耗则 `streak.currentStreak` 不重置 | +15 行 |
| [lib/review/review-session.ts](file:///workspace/lib/review/review-session.ts) `submitReview` | 末尾调用 `bumpReviewQuest` + `addXp` + `evaluateBadges` | +5 行（调用） |
| [lib/review/favorite.ts](file:///workspace/lib/review/favorite.ts) `addFavorite` | 末尾调用 `markSearchedQuest` + `addXp(2)` + `evaluateBadges` | +3 行 |
| [app/page.tsx](file:///workspace/app/page.tsx) | 首页 header 加 XP/等级小标签；今日提醒卡片加任务进度行 | +30 行 JSX |
| [app/review/page.tsx](file:///workspace/app/review/page.tsx) | 复习完成时调用 `claimDailyQuests`；顶部进度条加任务行 | +20 行 |
| [app/stats/page.tsx](file:///workspace/app/stats/page.tsx) | 新增"成就"区块；连胜卡片加保护券显示；新增 XP/等级卡 | +60 行 JSX |
| [lib/pwa/notification-settings.ts](file:///workspace/lib/pwa/notification-settings.ts) | 扩展通知内容生成，调用 `pickTemplate` | +20 行 |
| [app/onboarding-dialog.tsx](file:///workspace/app/onboarding-dialog.tsx) | 选词书后追加 2 步：动机问题 + 每日目标（5/10/15 词） | +40 行 |

**总改动量**：约 200 行新逻辑 + 200 行 UI，全部在现有文件内扩展，无新依赖。

### 5.6 测试策略

复用现有 vitest 范式，每个新模块配纯函数测试：

```typescript
// lib/gamification/__tests__/shield.test.ts
describe("shouldConsumeShield", () => {
  it("隔 1 天且有券 → 消耗", () => { /* ... */ });
  it("隔 1 天无券 → 不消耗（连胜重置）", () => { /* ... */ });
  it("隔 2 天 → 不消耗（保护券不跨多日）", () => { /* ... */ });
  it("同日复习 → 不消耗", () => { /* ... */ });
});

describe("maybeEarnShield", () => {
  it("连胜到 7 天且未领过 → +1", () => { /* ... */ });
  it("已有 2 张 → 不再增加", () => { /* ... */ });
  it("同一天重复触发 → 只 +1 一次", () => { /* ... */ });
});
```

**回归保护**：现有 `streak.test.ts` / `fsrs-scheduler.test.ts` 必须全绿，确保游戏化层不污染算法层。

### 5.7 性能与边界

- **徽章判定频率**：每次 `submitReview` 后判定一次，但只查未解锁徽章（≤16 个），纯内存计算，O(1)。
- **XP 增量写入**：每次评分 +1 次 IndexedDB put，单条 < 100 字节，可忽略。
- **每日任务重置**：首次访问时检查 `gamification:quests:{today}` 是否存在，不存在则创建，O(1)。
- **离线场景**：所有逻辑纯本地，PWA 已支持离线，游戏化层不引入任何网络请求。
- **数据迁移**：老用户首次启用时，XP 从 `listStudyLogs()` 全量重算一次（约 100 条日志，<10ms）；徽章从现有数据判定一次。

### 5.8 实施顺序（建议 3 个 PR）

1. **PR1：连胜保护 + 回归挽留**（最高 ROI，独立可上线）
   - `lib/gamification/shield.ts` + `streak-io.ts` 集成 + 统计页 UI + onboarding 补券
   - 验证：断签后连胜不重置、保护券自动补充

2. **PR2：每日任务 + XP + 徽章**（核心激励闭环）
   - `daily-quests.ts` + `xp.ts` + `badges.ts` + 首页/复习页/统计页 UI
   - 验证：三任务完成、XP 累积、徽章解锁 toast

3. **PR3：通知组合升级 + onboarding 扩展**（留存强化）
   - `notifications.ts` + PWA 集成 + onboarding 动机/目标步骤
   - 验证：通知按动机触发、tone 轮换、新用户引导完整

每个 PR 独立可回滚（feature flag），不阻塞主分支。

---

## 六、预期效果与衡量

参照多邻国公开数据，WordFlow 落地这套方案后的**可衡量目标**（3 个月内）：

| 指标 | 现状（推测） | 目标 | 对应机制 |
|------|--------------|------|----------|
| 次日留存 | — | +15% | 连胜保护 + 回归挽留 |
| 7 日留存 | — | +20% | 每日任务 + XP 累积 |
| 日均复习卡片数 | — | +30% | 每日任务 + 宝箱 |
| 断签后回归率 | — | +25% | 回归挽留 + 赠券 |
| 通知打开率 | — | +40% | 动机绑定 + tone 轮换 |

**衡量方式**：所有数据本地记录（StudyLog 已有），无需埋点后端。在统计页可加一个"对比上月"的轻量看板，让用户自己也看到进步——这本身又是一个激励。

---

## 七、不做什么（同样重要）

乔布斯说"我为没做的事骄傲"。这份方案明确**不做**的事：

- **不做联赛/排行榜**：与本地优先 + 单人定位根本冲突，强行做会变成"为社交而社交"。
- **不做红心/生命值**：WordFlow 是 SRS 复习，不是闯关答题。扣命会阻碍复习闭环，违背产品本质。
- **不做虚拟货币/商店**：增加系统复杂度，且无消费场景。保护券用时间换，不用货币买——更纯粹。
- **不做完整游戏化路径**：词书是线性列表，硬塞 winding road 会破坏查词优先的信息架构。
- **不做 AI Video Call**：成本高，对单词学习 ROI 低。AI 助手已能覆盖"问这个词怎么用"的需求。
- **不做炫耀分享**：单人产品，自我满足足够。分享会引入社交压力，违背"不折腾"承诺。

每一个"不做"都是为了保护 WordFlow 的核心：**查词即背词，本地优先，免费无广告，不折腾**。游戏化是手段，不是目的。

---

## 附：调研来源

- 多邻国 KDD 2020 论文《A Sleeping, Recovering Bandit Algorithm for Optimizing Recurring Notifications》
- Duolingo Duocon 2025 官方公告（LinkedIn 集成、Chess PvP、Video Call 扩展）
- Duolingo 2025 年度回顾（172 个新课程、Score、Stories、DuoRadio）
- Deconstruct of Fun - Duolingo Notifications 拆解
- Orizon - Duolingo Gamification Secrets（streak +60%、XP +40%、badges +30%）
- 多邻国产品哲学分析（夸夸闭环、More is Less、情绪 > 效果）
