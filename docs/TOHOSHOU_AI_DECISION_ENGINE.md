# TOHOSHOU AI Decision Engine v1.0

> 版本：v1.0 · 生效日期：2026-06-25 · 状态：基础框架已落地

---

## 概述

TOHOSHOU AI 决策引擎是评分计算链路的安全治理层，确保推荐结果可信、可追溯、抗漂移。共六大铁律，全部在代码和数据库层面强制执行。

---

## 六大铁律

### 铁律一：No Look-Ahead Bias（时间规则）

**禁止用"未来"信息影响"当天"推荐。**

所有 `News` 记录新增字段：
- `tradeEffectiveDate DATE` — 该新闻最早可被用于交易决策的 JST 日历日

计算规则：
```
publishedAt <= 当天 15:00 JST (= UTC 06:00)  → tradeEffectiveDate = 当天（如为节假日则顺延）
publishedAt >  当天 15:00 JST                → tradeEffectiveDate = 下一交易日
周末 / 日本国假日                              → 顺延至下一交易日
```

实现：`lib/safety-rules.ts` → `calcTradeEffectiveDate(publishedAt: Date)`

**TODO（待实施）：** `compute-scores.ts` 的 `recentNews` 查询加入 `tradeEffectiveDate <= recommendationDate` 过滤，彻底防止前瞻偏差。当前基础框架已写入字段，过滤逻辑待 Phase 2 实施。

---

### 铁律二：Normalization（标准化）

**LLM 禁止直接输出任意 impact 分数，只能输出标准 ImpactLevel。**

```
ImpactLevel     sigmaImpact
VERY_NEGATIVE       -2
NEGATIVE            -1
SLIGHT_NEGATIVE    -0.5
NEUTRAL              0
SLIGHT_POSITIVE     0.5
POSITIVE             1
VERY_POSITIVE        2
```

实现：`lib/safety-rules.ts` → `impactLevelToSigma(level: ImpactLevel)`

系统内部再将 `sigmaImpact` 映射为评分调整量，防止 LLM 幻觉直接影响量化信号。

---

### 铁律三：Confidence Guard（置信度守卫）

**数据不足时，自动降级评级，禁止产生虚假高置信评分。**

五个维度：

| 字段 | 含义 | 计算基础 |
|------|------|----------|
| `ruleConfidence` | 规则输入完整度 | priceCount + financial + globalMarket + institutionalFlow |
| `newsConfidence` | 新闻数据质量 | 30天内新闻数量 + 最新新闻时效 |
| `industryConfidence` | 行业数据完整度 | 是否有 sector/industry 字段 |
| `modelConfidence` | TOHOSHOU 模型置信度 | 当前 = 0（Shadow Mode） |
| `overallConfidence` | 综合置信度（0-100） | 加权均值 |

评级上限规则：
```
overallConfidence < 60 → STRONG_BUY 降为 BUY
overallConfidence < 40 → 最高 WATCH
```

实现：`lib/safety-rules.ts` → `computeConfidence()` + `applyConfidenceGuard()`

---

### 铁律四：Risk Override（风险熔断）

**特殊风险事件可强制覆盖评分，无论总分多高。**

```
riskOverride = NONE        → 不影响
riskOverride = SOFT_BLOCK  → STRONG_BUY→BUY，BUY→WATCH
riskOverride = HARD_BLOCK  → 封顶 WATCH（退市/停牌/制裁触发）
```

当前自动触发条件（基础框架）：
- `return20d < -30%` → SOFT_BLOCK（暴跌风险）
- `highRiskFlag && rsi14 > 88` → SOFT_BLOCK

HARD_BLOCK 触发条件（Phase 2，需外部数据源）：
- 退市预警 / 长期停牌 / 制裁名单 / 流动性严重异常

实现：`lib/safety-rules.ts` → `computeRiskOverride()` + `applyRiskOverride()`

---

### 铁律五：Version Freeze（版本冻结）

**每次 StockScore / DailyRecommendation 快照必须记录引擎版本。**

| 字段 | 当前值 |
|------|--------|
| `ruleEngineVersion` | `v1.0` |
| `globalEventEngineVersion` | `v0.1` |
| `scoringSchemaVersion` | `v1.0` |
| `tohoshouModelVersion` | `disabled` |
| `llmModelVersion` | `gpt-4o-mini`（读取 env.OPENAI_MODEL） |

版本升级规则：
- Schema 变更 → 升级 `scoringSchemaVersion`
- 评分算法变更 → 升级 `ruleEngineVersion`
- 海外事件引擎上线 → 升级 `globalEventEngineVersion`
- TOHOSHOU MODEL 启用 → 更新 `tohoshouModelVersion`

实现：`lib/safety-rules.ts` → `VERSION_SNAPSHOT` 常量对象

---

### 铁律六：Shadow Mode（影子模式）

**TOHOSHOU AI 自研模型后台运行，生产权重为 0，不影响正式推荐。**

当前状态：`TOHOSHOU_MODEL_VERSION = "disabled"`

字段预留（StockScore）：
- `shadowModelScore Float?`
- `shadowRecommendation String?`
- `shadowRank Int?`
- `shadowGeneratedAt DateTime?`

启用条件：充分回测验证后，由人工将 `TOHOSHOU_MODEL_VERSION` 从 `disabled` 改为具体版本号，同时调整 `overallConfidence` 权重中的 `modelConfidence` 比例（当前为 0.05，实际权重因 modelConfidence=0 而归零）。

---

## 同步防僵尸（SyncJob Stale Guard）

> 非六大铁律，但属于数据链路可靠性保证，同批落地。

**问题：** Next.js 后台 `async` 任务在 `pm2 restart` 时被杀，SyncJob 卡死 RUNNING，后续所有同步假 ✅。

**解决方案（v11.2.0 已实施）：**
- `POST /api/sync/news` 对 > 2h 的 RUNNING job 自动 FAILED（`staleAutoFailed: true`）
- cron 解析 JSON 响应：`skipped → ⚠️ SKIPPED`，`staleAutoFailed → ⚠️ STALE_RESET`，成功 → `✅ 完成`

**已知 P1：** pm2 restart 会杀死 Next.js 后台 async。长期修复方案：将新闻同步移入独立 worker 进程。

---

## 数据库变更（v12.0）

### StockScore（新增字段）

```prisma
ruleConfidence     Float?
newsConfidence     Float?
industryConfidence Float?
modelConfidence    Float?
overallConfidence  Float?
riskOverride       String?   @default("NONE")
ruleEngineVersion        String?
globalEventEngineVersion String?
llmModelVersion          String?
tohoshouModelVersion     String?
scoringSchemaVersion     String?
shadowModelScore         Float?
shadowRecommendation     String?
shadowRank               Int?
shadowGeneratedAt        DateTime?
```

### DailyRecommendation（新增字段）

```prisma
overallConfidence        Float?
riskOverride             String?
ruleEngineVersion        String?
globalEventEngineVersion String?
llmModelVersion          String?
scoringSchemaVersion     String?
```

### News（新增字段）

```prisma
tradeEffectiveDate DateTime? @db.Date
```

---

## Phase 2 路线图

| 功能 | 状态 |
|------|------|
| News tradeEffectiveDate 字段写入 | ✅ v12.0 |
| compute-scores 按 tradeEffectiveDate 过滤新闻 | ⏳ Phase 2 |
| HARD_BLOCK 外部数据源（退市/停牌） | ⏳ Phase 2 |
| 海外财报新闻 → JP 半导体行业联动 | ⏳ Phase 2 |
| TOHOSHOU MODEL shadow score 生成 | ⏳ Phase 3 |
| DailyRecommendation 版本字段写入 | ⏳ Phase 2（需改 rerank-top500.ts） |

---

## 实现文件

| 文件 | 作用 |
|------|------|
| `lib/safety-rules.ts` | 六大铁律核心实现（ImpactLevel/Confidence/RiskOverride/Version/Shadow） |
| `scripts/compute-scores.ts` | Pass 1 计算 confidence/riskOverride；Pass 2 应用 guard |
| `app/api/sync/news/route.ts` | 写入 tradeEffectiveDate + 2h stale guard |
| `scripts/cron-scheduler.ts` | cron 正确区分 skipped / stale / success |
| `components/AISafetyPanel.tsx` | Admin 验证页安全规范面板 |
| `prisma/schema.prisma` | Schema 扩展（12个新字段） |
