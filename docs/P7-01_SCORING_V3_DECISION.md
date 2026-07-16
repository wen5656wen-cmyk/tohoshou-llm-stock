# P7-01 Scoring V3 去留裁决（Decision Review）

> 只读分析，未改任何代码 / 未部署 / 未动数据库。日期 2026-07-16。基线 v17.92.0。
> 所有结论基于当前仓库真实代码与调用链，逐条引用文件行号。

---

## 1. 生产真正在用的评分引擎 = V2（唯一）

**完整调用链（实测引用）：**

```
[Cron 06:00 JST · cron-scheduler.ts]
  └─ sync-all-prices.ts (Phase2 内嵌链)
       └─ scripts/compute-scores.ts
            ├─ import calcAiScore from "../lib/ai-score.ts"   ← compute-scores.ts:18
            ├─ calcAiScore(input)                              ← compute-scores.ts:315
            │    (5维: technical30/fundamental25/moneyFlow20/news15/global10
            │     → adaptiveScore = classifyStockStyle + computeAdaptiveScore)
            └─ 写入 prisma.stockScore (StockScore.adaptiveScore = 主排序键)
                 │
                 ▼
       └─ scripts/rerank-top500.ts (读 StockScore.adaptiveScore Top500)
            └─ finalScore = adaptiveScore×0.7 + gptScore×0.3 → 写 DailyRecommendation / GPTScore
                 │
                 ▼
  下游全部消费 StockScore.adaptiveScore（V2）：
    generate-strategy-recommendations.ts / day-strategy / swing / long
    generate-ai-top-picks.ts (AI五选) · generate-closing-decision.ts (收盘决策)
    paper-broker.ts (模拟盘) · generate-daily-ai-watchlist.ts (关注池)

[API]  /api/stocks/[symbol]/intelligence · /api/screener · /api/indicators
       /api/ai-scores · /api/admin/* ...  → 全部读 StockScore（V2）
[页面] / · /strategy · /admin/* · /watchlist/daily ... → 全部展示 StockScore（V2）
```

**关键事实**：
- `scripts/compute-scores.ts` 的 import（第 14–19 行）**只引用 `lib/ai-score.ts`**，**完全不 import** `scoring-v3` / `scoring-engine` / `adaptiveScoreV3`。
- grep 确认：`rerank-top500 / generate-strategy-recommendations / day-strategy / generate-ai-top-picks / generate-closing-decision / paper-broker` 对 V3 **0 处引用**。
- **V3 与生产 100% 隔离。**

---

## 2. Scoring V3 当前状态

**作为「Shadow 研究引擎」：完成度 ≈ 95%。作为「可上线的生产引擎」：完成度 ≈ 40%。**

### 已完成模块（全部真实存在，737 行 lib）
| 模块 | 文件 | 作用 |
|---|---|---|
| 主引擎 | `lib/scoring-v3/score-v3.ts`(162) | 7 维横截面百分位加权 + 排名 + 评级 |
| 动态权重 | `dynamic-weight.ts`(62) | 因子质量×regime基准→今日权重，上下限/归一/单日±5%限幅 |
| 市场门控 | `regime-gate.ts`(40) | BULL/SIDEWAYS/BEAR 基准权重 + 风险倍率 |
| 风险层 | `risk-adjustment.ts`(56) | 波动/流动/财报缺失/数据质量 负向扣分 [-15,0] |
| 因子质量 | `factor-quality.ts`(69) | coverage/discrimination/freshness/RankIC → 质量分 q |
| 解释 | `explain.ts`(58) | 自然语言归因 |
| 标定引擎 | `calibration/`(6文件,265) | 动态阈值评级 + Confidence + Quality + Readiness Gate |
| 冻结配置 | `freeze.ts`(25) | Shadow Freeze 期定义 |
| Shadow 脚本 | `compute-score-v3-shadow.ts`(166) | 每日算 V3 只写影子表 |
| 回测/回放/评审 | `backtest-score-v3 / replay-score-v3 / gen-v3-final-review` | 验证工具 |
| API×4 | `/api/scoring-v3/{shadow,calibration,freeze,backtest}` | 只读展示 |
| 页面×3 | ScoreV3Panel / CalibrationPanel / FreezeMonitorPanel | 研究中心 tab |
| 表×2 | `AdaptiveScoreV3Shadow` / `AdaptiveScoreV3Calibration` | 影子落库 |

### 未完成 / 缺失（这是为什么它「不能上线」）
1. **生产切换代码从未实现**：`lib/scoring-engine.ts` 第 8 行自注「本阶段生产链路 compute-scores/rerank-top500 不读取此标志」。`getScoringEngine()`/`isV3Active()` **无任何调用方**。→ 即使今天设 `SCORING_ENGINE=v3`，生产评分**不会有任何变化**（空开关）。
2. **前向验证证据不足**：就绪评审要求「≥1 周实盘 Shadow + 一段上行窗口回放」。历史回放（`V3_HISTORICAL_REPLAY_2026-07-03.md`）只有**单一回撤窗口**、且是「价格核心口径」（V3 的基本面/新闻/风险差异维度**未被历史验证**）。
3. **Freeze 到期最终评审从未产出**：`gen-v3-final-review.ts` 本应在 Freeze 结束（2026-07-10 周五 16:45 cron）生成 `docs/V3_FINAL_PRODUCTION_REVIEW.md`——**该文件在仓库中不存在**，reports 无 v3 json。决策被悬挂。
4. **就绪度未达标**：P3-T2 评审 68/100；叠加历史回放升至 ~82；标定引擎自算 Gate 到 Freeze 末约 85（B）。**始终 <90 上线线。**

### V3 优于 V2 之处（评审+回放实测）
- **可交易性**：V3 Top20 流动性 ~7×、市值 ~4×、更低波动(ATR 3.1<3.7)、行业分散（V2 Top20 竟 85% 集中情報通信，V3 6/3/3/2 分散）。
- **动态权重解决 V2 死穴**：`factor-quality.ts` 注释直指——V2「全球/资金/新闻区分度低」的维度会被自动降权（正是 P7-00 审计发现 V2 的 moneyFlow/news/global 45 分大量走中性兜底的问题）。
- **前向收益**：20 日历史回放 12 格中 **11 格 V3 ≥ V2**，Top20 T+1 日胜率 65% vs V2 50%。
- **风险层 + 市场门控**：V2 无显式风险扣分与 regime 权重切换。

---

## 3. 为什么至今没启用（真实原因，按权重排序）

| # | 原因 | 属于 | 证据 |
|---|---|---|---|
| 1 | **生产切换从未编码**（flag 是 stub） | 未完成 | scoring-engine.ts:8 自注；getScoringEngine 无调用方 |
| 2 | **验证停滞、就绪度未达 90** | 未完成/准确率 | 68→82→~85，始终 <90；缺上行窗口验证 |
| 3 | **Freeze 到期最终评审从未生成** | 历史/流程断档 | V3_FINAL_PRODUCTION_REVIEW.md 不存在 |
| 4 | **组织注意力转移**（V3 停摆 13 天） | 历史原因 | 末次 V3 commit bd631d9 = 2026-07-03；其后 v17.49→v17.92 全是 P5/P6/P7 别的工作 |
| 5 | **切换触碰冻结的评分核心/资金链路** | 兼容/风控 | 改 compute-scores 产出即触 P5 Runtime Freeze + 需 /review payment |

**判定：不是技术上被否决，也不是已正式放弃——是「工程未收尾 + 验证停滞 + 无主 13 天」的半途搁置。** 引擎设计健全、方向被评审认可（Grade B，非 D），但从未跨过上线门槛，也从未有人宣布废弃。

---

## 4. 若今天启用 V3，影响哪些模块

> 前提澄清：今天设 `SCORING_ENGINE=v3` **什么都不会变**（空开关，§2-未完成-1）。下表是「**真正把 V3 接入生产**（改 compute-scores 让 StockScore 承载 V3 分）」后的影响面。

| 模块 | 影响 | 机制 |
|---|---|---|
| **AI Score** | 🔴 根本改变 | adaptiveScore(绝对0-100) → scoreV3(横截面百分位加权)，分数量纲与分布完全不同 |
| **Daily Recommendation** | 🔴 重构 | rerank 读 adaptiveScore Top500 排序被 scoreV3 重排；STRONG_BUY 从 V2 的 ~2 只 → V3 的 ~155 只（未标定）/~30-50（标定后） |
| **AI 五选** | 🔴 变 | compose 读 StockScore.adaptiveScore + AlphaScore，候选池与 composite 全变 |
| **收盘决策** | 🔴 变 | 读 StockScore 排名做候选池 Top150 + 组合，输入源改变 |
| **Paper Broker** | 🔴 间接变 | 镜像三策略持仓，策略选股基于评分→仓位全变 |
| **策略中心(Day/Swing/Long)** | 🔴 变 | 三策略读 StockScore 分数与评级门槛 |
| **每日关注池** | 🔴 变 | 读 STRONG_BUY/BUY，评级口径变→池子成员变 |
| **回测** | 🟡 断层 | 历史 BacktestPositionResult 基于 V2 评分，V3 上线后新旧不可比，需重建基线 |
| **学习报告** | 🟡 变 | 基于推荐前向收益，样本口径切换 |
| **percentileRank / recommendationV2 / opportunityScore** | 🔴 变 | 均由 adaptiveScore 派生 |
| **GPTScore/rerank** | 🟡 权重壳不变但输入变 | finalScore=score×0.7+gpt×0.3 的 score 由 V2→V3 |

**结论：几乎全站评分下游都会被重构。这是一次「换心脏」级改动，且落在 P5 Runtime Freeze + 资金链路锁定区，按项目规则须走 /review payment + 一键回滚预案。**

---

## 5. V2 vs V3 六维评分（1-10，10 最好）

| 维度 | V2 | V3 | 依据 |
|---|---|---|---|
| **准确率(可交易性/前向)** | 6 | **8** | 回放 11/12 胜、日胜率 65%>50%、Top20 流动性7×/分散；但证据仅单一回撤窗口、缺上行验证 |
| **速度/性能** | **8** | 7 | V2 单趟计算；V3 多一层横截面百分位+质量+标定，Shadow 实测秒级，非瓶颈但更重 |
| **维护成本** | **8** | 4 | V2 单文件 calcAiScore；V3 = 13 lib + 4 script + 4 API + 3 面板 + 2 表 + 标定 6 文件，面大 |
| **代码复杂度** | **8** | 5 | V2 直观固定权重；V3 动态权重×质量×regime×限幅×标定，理解门槛高 |
| **未来扩展性** | 5 | **9** | V3 因子质量自动降权 + regime 门控 + 风险层，加新因子天然适配；V2 加维度要手改权重 |
| **生产稳定性** | **9** | 4 | V2 已跑数月、健康 CRITICAL=0；V3 从未在生产跑过 1 天、切换代码未写、就绪 <90 |
| **合计** | **44** | 37 | V2 胜在「已验证/低成本/稳」，V3 胜在「设计/可交易性/扩展」 |

**一句话**：V3 是**设计更好的引擎**（尤其修复了 V2 中性兜底与单一行业霸榜的死穴），但 V2 是**当前唯一被生产验证、低维护、稳定**的引擎。

---

## 6. 长期保留两套评分的风险（实测已在发生）

| 风险 | 说明 | 当前证据 |
|---|---|---|
| **代码漂移** | V2 持续演进（v17.49→92），V3 停在 07-03，二者假设逐渐脱节 | V3 已停摆 13 天，落后 40+ 版本 |
| **无主搁置** | Freeze 到期无人产出最终评审、无人决策 | V3_FINAL_PRODUCTION_REVIEW.md 至今不存在 |
| **Claude/开发改错** | 两套评分 + 空开关 `SCORING_ENGINE`，未来极易误判「哪套在生产」而改错文件 | 本次审计前，memory 与文档均需澄清「flag 是 stub」 |
| **重复计算/资源** | 每日 10:15 cron 跑 V3 Shadow + backtest + replay，纯为一个未启用引擎耗算力 | 4 个 V3 cron 每交易日运行 |
| **维护税** | 每次改 StockScore 字段/schema/因子，都要顺带考虑 V3 是否同步 | 表 AdaptiveScoreV3Shadow 与 StockScore 并行 |
| **认知负担** | 研究中心 3 个 V3 tab 长期展示一个不会上线的引擎，误导「已在用」 | ScoreV3/Calibration/Freeze 面板仍在导航 |
| **伪就绪** | backtest API 读的 `reports/score-v3-backtest.json` 不存在 → 面板空/半死 | reports 无 v3 json |

---

## 7. 最终建议（三选一）

### 🅰️ 升级 V3（条件性 A）—— 本裁决的推荐

**推荐 A：把 V3 收尾上线，逐步替换 V2。但设硬性前置门槛，达不到即转 B。**

**理由（基于代码事实）：**
1. V3 是**被评审认定方向正确（Grade B，非 D）的更优引擎**，且**恰好修复 P7-00 审计发现的 V2 核心缺陷**——V2 有 45 分（moneyFlow/news/global）大量走中性兜底、Top20 竟 85% 单一行业；V3 的因子质量降权 + 风险层 + regime 门控直接对症。
2. **正面前向证据已存在**（11/12 胜、日胜率 65%），且**最难的 P0（评级阈值重标定）已经建好**（calibration 引擎）。
3. 剩余工作**有界**：补上行窗口回放 + 编写生产切换 + 重跑最终评审。删掉一个 95% 完成、设计更优、证据正面的引擎，浪费大于收尾成本。
4. **删除是不可逆的**；条件性上线保留了「达标才切、不达标一键回滚 v2」的安全性。

**唯一转 B 的条件**：若**无人认领**未来 2-3 周的重验证收尾，或补测显示 V3 在**上行窗口不能跑赢 V2**（只会抗跌不会捕涨）——则立即执行 B，停止漂移。**长期挂着当 Shadow 是最差选项，本裁决明确否决现状。**

### 🅱️ 备选：彻底废弃（见 §9 清单）
若决策者判断「没有 owner、不想碰冻结的评分核心、V2 够用」——则 B 是诚实且正确的，优于继续无主搁置。

---

## 8. 若升级（A）— 路线 / 工作量 / 风险 / 需几个 P

**预计 3 个 P：**

**P7-02 · 重验证收尾（低风险，不碰生产）**
- 补一段**上行窗口**历史回放（扩展 replay-score-v3 到上涨区间），证明 V3 不只抗跌也能捕涨
- 让 Freeze 最终评审真正产出（跑 gen-v3-final-review，落 `V3_FINAL_PRODUCTION_REVIEW.md`）
- 补 `reports/score-v3-backtest.json`（backtest 面板当前空）
- **门槛**：Readiness ≥ 90 且上行窗口 V3 ≥ V2。**未过则转 B。**
- 工作量：~1 个开发日；风险：低（纯只读研究层）

**P7-03 · 生产切换编码（高风险，走 /review payment）**
- 改 `compute-scores.ts`：当 `SCORING_ENGINE=v3` 时用 V3 产出写 StockScore（把空开关变实开关）
- 决定 adaptiveScore 与 scoreV3 的承载方式（替换 or 双写并行灰度）
- 下游评级门槛（rerank/策略/五选/收盘）适配 V3 评级口径
- **必须**：一键回滚（改回 v2 即恢复）+ 灰度（先 shadow 对比再切）
- 工作量：~2-3 开发日；风险：**高**（触 P5 Runtime Freeze + 资金链路，须 /review payment + 回滚预案）

**P7-04 · 切换 + 观察 + 清退 V2 残留**
- 设 `SCORING_ENGINE=v3` → 监控 24-72h（Health CRITICAL=0 / 推荐分布合理 / 无回归）
- 稳定后重建回测基线；异常即回滚
- 观察期满，清理 V2 专有死字段（StockScore.rawScore 等）
- 工作量：~1-2 开发日 + 观察期；风险：中（有回滚兜底）

**总计 ~3 个 P、4-6 开发日 + 1-2 周观察。最大风险 = P7-03 触碰冻结评分核心，须显式授权 + 回滚。**

---

## 9. 若废弃（B）— 可删除清单（逐项）

> 均为「先在生产核对无隐藏消费者后再删」。删除 = 一个独立清理 P，纯移除不涉资金逻辑。

**文件 / lib（13）**：`lib/scoring-v3/` 全目录（score-v3/dynamic-weight/regime-gate/risk-adjustment/factor-quality/explain/freeze + calibration/6 文件）；`lib/scoring-engine.ts`（含空开关 getScoringEngine/isV3Active/isV3CalibrationOn，确认无其它引用后）

**脚本（4）**：`compute-score-v3-shadow.ts` · `backtest-score-v3.ts` · `replay-score-v3.ts` · `gen-v3-final-review.ts`

**API（4）**：`app/api/scoring-v3/{shadow,calibration,freeze,backtest}/route.ts`

**页面/组件（3+导航）**：`components/research/{ScoreV3Panel,CalibrationPanel,FreezeMonitorPanel}.tsx` + 研究中心对应 tab 注册（lib/routes / research tab 定义）

**Cron（4 注册，须重启 tohoshou-cron）**：cron-scheduler.ts 第 339/340/346/352 行——10:15 compute-score-v3-shadow + backtest-score-v3、10:35 replay-score-v3、周五 16:45 gen-v3-final-review

**数据库表（2，需 prisma db push，走数据库变更审批）**：`AdaptiveScoreV3Shadow`（schema 1693）· `AdaptiveScoreV3Calibration`（schema 1721）

**环境变量（2）**：`SCORING_ENGINE` · `V3_CALIBRATION`（本就未在 .env/ecosystem 设置，删代码即可）

**文档（2-3）**：`docs/V3_HISTORICAL_REPLAY_2026-07-03.md` · `docs/V3_PRODUCTION_READINESS_REVIEW.md`（可归档保留作决策记录）；`V3_FINAL_PRODUCTION_REVIEW.md` 本不存在

> ⚠️ 注意区分：`StockScore.shadowModelScore/shadowRecommendation/shadowRank`（schema 内标 "TOHOSHOU shadow, not used"）是**另一套更早的影子字段，非 V3**，不在本清单内（属 P7-00 的独立字段清理项）。

---

## 10.《Scoring V3 最终裁决》

```
当前生产评分：
  V2 — lib/ai-score.ts::calcAiScore（adaptiveScore 为主排序键）
  由 scripts/compute-scores.ts 每日 06:00/07:30 JST 计算写入 StockScore
  全站推荐/五选/收盘/策略/Paper 下游 100% 消费 V2；V3 与生产完全隔离

建议：
  ▶ 升级 V3（条件性 A）

理由：
  V3 是被评审认定方向正确（Grade B）、且恰好修复 V2 已知死穴
  （中性兜底 45 分、Top20 单一行业 85%）的更优引擎；前向证据正面
  （11/12 胜、日胜率 65%），最难的评级阈值重标定 P0 已建好，剩余
  工作有界（补上行窗口 + 编写切换 + 最终评审）。删除一个 95% 完成、
  设计更优、证据正面的引擎，浪费大于收尾成本。

  但当前「长期挂 Shadow、无主 13 天、Freeze 评审从未产出」是最差状态，
  本裁决明确否决维持现状。故 A 附硬条件：
    · 立即指定 owner 走 P7-02 重验证（~1 日，纯只读）
    · Readiness ≥ 90 且【上行窗口】V3 ≥ V2 → 进 P7-03 生产切换（/review payment + 回滚）
    · 若无 owner 认领 或 上行窗口未跑赢 → 立即转 B 彻底删除（§9），停止漂移

  三选一定位：不选「纯保留 V2」（等于放任漂移），不选「无条件删除」
  （丢弃更优引擎太可惜）→ 选「时限性升级，达不到即删」。
```
