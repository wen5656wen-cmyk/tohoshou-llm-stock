# Swing / Long Activation Plan

> **状态：设计文档（DESIGN ONLY）。本文件不改任何代码、不部署、不改 Cron、不改策略逻辑、不写数据。**
> Trading Architecture V1 保持 **FROZEN**。Swing/Long 自动运行的开启属 **Strategy Activation**（功能开启），
> 应在 **Phase 7 / v18.x** 与其他解锁条件统一进行，不在维护/Bug-fix 范畴内执行。
>
> 关联：`docs/Trading-Architecture.md`、`docs/Module-Responsibility.md`、CHANGELOG v17.24.0（Day Trade T+1 修复）、
> v17.29.0（T3 P1 审计，本问题被记录为 P0-1 并定性为 Strategy Activation）。
> 版本：v1.0 · 起草日：2026-07-02

---

## 1. 当前问题：Swing/Long 因 T 日无收盘价，cron 空跑

**现象（生产已证实）**：`scripts/swing-strategy.ts` 与 `scripts/long-strategy.ts` 在自动模式下每个交易日都提前 return，从不开仓/平仓/写 Snapshot/CapitalLog。

**机制**：
- 自动模式 `runDate = 最新 StrategyRecommendation.tradeDate`（swing:111-124 / long:104-119）。
- `generate-strategy-recommendations.ts` 在 **T 日 07:30** 生成 SR，`tradeDate = jstDate() = T`（gen-recs:179）。
- Cron 在 **T 日 16:35（Swing）/ 16:40（Long）** 触发（`cron-scheduler.ts:270/279`）。
- 引擎随即执行 `dailyPrice.count({ date: runDate = T })`（swing:139 / long:134），若为 0 → `🚫 No DailyPrice ... not yet synced` 提前 return。
- **但 T 日收盘价要到 T+1 06:00 JST 才由 `sync-all-prices` 同步入库**（市场 15:00 收盘，J-Quants 次晨才可取）。故 16:35/16:40 时 `priceCount(T) === 0` 恒成立。

**生产日志佐证**：
```
2026-07-02 15:35 🚫 No DailyPrice data for 2026-07-02 — not yet synced   (Swing)
2026-07-02 15:40 🚫 No DailyPrice for 2026-07-02 — not yet synced        (Long)
2026-06-30 15:30/35/40 同样跳过
```

**当前 06-26 / 07-01 的持仓数据来自会话内手动 `--date` 运行，并非自动 cron 产物。** 无人值守时两条策略线（Swing ¥40M、Long ¥30M）处于死状态。

**旁证**：`data-health-guard` S2（三资金池初始化）对 Swing/Long 缺 CapitalLog 报 WARNING；`strategy-daily-validation` 的 `strategyOk` 因 `posTotal=0` 持续不达标。

---

## 2. 为什么这不是普通 Bug，而是策略激活

- **逻辑本身正确**：入场/出场规则、资金池、仓位计算均无错误，只是运行时序拿不到数据而空转。修复不是"改错"，而是**让两条已建成但从未真正跑起来的策略线开始产生交易**。
- **触及 FROZEN 架构行为**：一旦激活，Swing/Long 将每交易日真实开仓/平仓、改变持仓、改变资金池、改变回测/学习样本 —— 这是**生产交易行为的实质变化**，不是无副作用的缺陷修复。
- **与 Phase 7 解锁条件耦合**：Phase 7（AI Strategy Optimization）的开启门槛本就包含 `SWING≥30 平仓 / LONG≥20 平仓`。在架构冻结期人为激活会打乱"数据积累→评估→解锁"的既定节奏。
- **决策归属**：Day Trade 的 T+1 修复（v17.24.0）当时是修一条**已在运行**的线的故障；而 Swing/Long 从未自动运行过，让它们"开始运行"是产品/架构决策，非工程 Bug 判定。

> 结论：本项归类为 **Strategy Activation**，由 Phase 7 / v18.x 专项承接。维护类任务禁止"顺手激活"。

---

## 3. 推荐方案：T+1 07:30 使用最新完整 DailyPrice 结算/更新

**核心原则**：与 Day Trade v17.24.0 相同——**在 T+1 07:30、`await syncPricesPromise` 完成后，处理"最近一个已有完整收盘价的交易日"**，而不是在当天盘后处理当天。

**为什么是 T+1 07:30**：
- 该时刻 `sync-all-prices` 已完成，最近完整交易日 D（= 上一交易日）的 open/close 已在库。
- 与 Day Trade 结算挂在同一位置（07:30 `await syncPricesPromise` 之后），共享"价格就绪"保证。

**runDate 语义的修正**：
- 现状：`runDate = 最新 SR.tradeDate`（= 今天，价格未就绪）。
- 目标：`runDate = 最新且同时满足「有 SR」与「有 DailyPrice」的交易日`（= D，价格已就绪）。
- 同时引入**断点续跑**：处理所有 `SR 存在 且 DailyPrice 存在 且 无 StrategySnapshot` 的历史交易日，**严格按日期升序**逐日处理（见 §6）。

**多日持仓的特殊性（与 Day Trade 的关键区别）**：
- Day Trade 是当日开平（T 开 T 平），一天一结算即可。
- **Swing/Long 是多日持仓**：每交易日都要对现有 OPEN 仓 mark-to-market（用该日 close）并检查出场规则（止盈/止损/最长持仓/跌出 Top10/AI 分下降/评级下调），再决定是否新开仓（用该日 open）。
- 因此激活后必须**保证每个交易日恰好被处理一次、且按时间顺序**，否则持仓演进错乱。这是断点续跑必须"升序、逐日、幂等"的根本原因。

**引擎参数（现状，激活不改）**：

| | Swing | Long |
|---|---|---|
| 资金池 POOL_INITIAL | ¥40,000,000 | ¥30,000,000 |
| 单仓 POSITION_SIZE | ¥4,000,000（池/10） | ¥3,000,000（池/10） |
| 入场价 | 当日 `open` | 当日 `open` |
| 盯市/出场价 | 当日 `close` | 当日 `close` |
| 止盈 / 止损 | +8% / -5% | +20% / -10% |
| 最长持仓 | 20 日历天 | 90 日历天 |
| 入场条件 | 进入 Swing Top10 | STRONG_BUY + adaptiveScore≥75 + fundamentalScore≥18 + riskOverride=NONE |
| 额外出场 | 跌出 Top10 / AI 分下降 | AI 分 < 55 / 评级跌出 STRONG_BUY |

---

## 4. Swing 激活流程（每处理一个交易日 D）

1. **确定 D**：断点续跑挑出下一个待处理交易日 D（升序）。
2. **加载 SR(D)**：`StrategyRecommendation(SWING_TRADE, tradeDate=D, isTop10=true)`。若无 → 该日 `SKIPPED_NO_REC`，不处理（见 §7 No Look-Ahead）。
3. **加载 DailyPrice(D)**：open/close。若缺 → 该日 `SKIPPED_DATA_MISSING`，**持仓保持不动**，跳到下一日（见 §6）。
4. **加载现有 OPEN 持仓**（跨日携带，按 entryDate 升序）。
5. **出场处理**：对每个 OPEN 仓，用 D 的 close 计算 `retPct`、`holdingDays`，`exitReasonForSwing(retPct, holdDays, inTop10, aiScore)`：
   - `TAKE_PROFIT`(≥+8%) / `STOP_LOSS`(≤-5%) / `MAX_HOLD_DAYS`(≥20天) / `DROPPED_FROM_TOP10` / `AI_SCORE_DROP`。
   - 命中 → 平仓（exitPrice=D.close，写 exitReason、returnPct、alpha=retPct−TOPIX累计）。
6. **新开仓**：SR(D) 中尚未持有的标的，`qty = floor(POSITION_SIZE / D.open / 100) * 100`；qty=0（买不起一手）→ 跳过该标的（不占用资金，参照 Day Trade `LOT_SIZE_TOO_SMALL` 语义）。
7. **资金池推进**：`cashBefore` 取 `logDate < D` 的最新 CapitalLog（P1-3 已修）；结算后写 CapitalLog(logDate=D)。
8. **写快照**：StrategySnapshot(snapshotDate=D) 作为该日完成标记（幂等键）。
9. **原子性**：TradeResult/Position 更新 + CapitalLog + Snapshot 应包进单个事务（参照 Day Trade P1-2 已实现的模式），全成或全滚。

---

## 5. Long 激活流程（每处理一个交易日 D）

与 Swing 同构，差异：
1. **入场筛选更严**：仅 `recommendationV2 = STRONG_BUY 且 adaptiveScore ≥ 75 且 fundamentalScore ≥ 18 且 riskOverride = NONE` 的标的进入候选（因此 LONG 每日候选常远少于 10，甚至为 0——这是设计,不是 Bug）。
2. **出场规则**：`exitReasonForLong(retPct, holdDays, aiScore, ratingIsStrongBuy)`：`TAKE_PROFIT`(≥+20%) / `STOP_LOSS`(≤-10%) / `MAX_HOLD_DAYS`(≥90天) / AI 分<55 / 评级跌出 STRONG_BUY。
3. **换仓频率低**：Long 不因短期波动频繁卖出，持仓可达 90 天。
4. 其余（DailyPrice(D)、盯市、资金池推进、快照、事务原子性）与 §4 一致。

---

## 6. 数据补跑规则

**升序、逐日、幂等、有界。**

1. **候选交易日**：`SR(strategyType, tradeDate=D) 存在` 且 `tradeDate < 今天(JST)` 且 `无 StrategySnapshot(snapshotDate=D)`。
2. **严格升序处理**：多日持仓的资金池与持仓状态逐日累积，必须从最早的待处理日开始，一天一天推进；**禁止乱序**（否则 CapitalLog 基数与持仓演进错乱）。
3. **幂等**：以 `StrategySnapshot(snapshotDate=D)` 是否存在为准（事务末尾写入的完成标记）。已有快照的日直接跳过，不重写。
4. **缺价日**：`DailyPrice(D)` 缺失（sync 缺口/节假日误标）→ 标 `SKIPPED_DATA_MISSING`，**持仓与资金池保持不动**，继续下一日。**禁止**用邻日价格代替或凭空平仓。
5. **无 SR 日**：`SR(D)` 缺失（如引擎上线前的历史日）→ `SKIPPED_NO_REC`，不处理该日（见 §7）。
6. **补跑上限（激活起点）**：激活时必然存在一段"从未处理过"的历史日积压。**必须设定明确的 `ACTIVATION_DATE`（激活生效日）作为处理起点**，只处理 `D ≥ ACTIVATION_DATE` 的交易日，避免把数周历史一次性"回放"成大量交易。
   - 现存 06-26/07-01 手动跑产生的 Swing/Long 持仓需先决策：**清零重来（推荐，干净起点）** 或 **保留并从其后续跑**。二选一必须在激活前明确，写入 CapitalLog 起始基数。
   - `slice(-N)` 式静默截断（Day Trade 现有 P2 缺陷）**不采用**；改用显式 `ACTIVATION_DATE` 下界，且对被跳过的更早日 `log()` 明示，不静默丢弃。

---

## 7. No Look-Ahead 规则

激活方案必须保持 `lib/safety-rules.ts` 铁律一（No Look-Ahead）不被破坏：

1. **决策仅用过去数据**：D 日的入场决策来自 `SR(D)`，而 `SR(D)` 由 D 日 07:30 依据 **D-1 及更早** 的 StockScore 生成（`sourceScoreDate = computedAt`）——决策发生在 D 开盘前，不含 D 当日或未来信息。
2. **入场价 = D.open，出场价 = D.close**：均为 D 当日真实成交价；我们只在 **D+1**（价格已定型后）"记账"这些已发生的交易，处理时点晚于交易日，但**决策所用信息严格早于交易发生时刻**。
3. **禁止反向重建缺失 SR**：`SR(D)` 缺失的历史日（如 2026-06-29，Recommendation 引擎上线前）**不得**用当前 StockScore 反推重建——StockScore 非按日版本化存储，事后重建等于用未来信息伪造过去决策。该类日永久 `SKIPPED_NO_REC`，可接受。
4. **`tradeEffectiveDate <= todayJST` 过滤** 在 SR 生成阶段已生效，激活不放宽。
5. **补跑只用 D 当日及更早价格**：处理 D 时严禁读取 D+1 及以后的 DailyPrice/GlobalMarket。

---

## 8. Health / Mission Control / Validation 变更

**无需新增数据库表或字段。** 激活后既有观测项会"活起来"，另建议少量增量：

- **data-health-guard**：
  - S2（三资金池初始化）：Swing/Long 开始有 CapitalLog → 由 WARNING 转 PASS。
  - S11–S15（Swing）/ S16–S20（Long）：持仓开始流动，检查变得有意义（S13/S18 CRITICAL：CLOSED 仓必须有 exitPrice）。
  - **建议新增（可选）**：Swing/Long "最近完整交易日已处理" 新鲜度检查（对齐 Day Trade 的 T+1 结算检查），检测激活后是否出现停跑。属新增检查，不改既有阈值。
- **strategy-daily-validation**：`strategyOk`（依赖 `posTotal`）将开始达标；Phase 7 就绪进度（SWING≥30 平仓 / LONG≥20 平仓）开始累积。
- **Mission Control（`app/api/admin/mission-control/route.ts`）**：
  - 若采纳"移到 07:30 T+1"，需同步更新 `STEP_DEFS` 中 Swing/Long 的调度时间描述（从 16:35/16:40 改为 07:30+），否则 Pipeline 展示与实际不符。
  - `strategyExecutions` 将显示 Swing/Long 真实每日执行，不再长期"跳过/无数据"。
- **CLAUDE.md / project memory**：更新"Cron 架构说明"与 P0-1 记录状态（从 FROZEN-记录 → 已激活）。

---

## 9. 风险评估

| 风险 | 等级 | 说明 / 缓解 |
|---|---|---|
| 改 `cron-scheduler.ts` 需重启 tohoshou-cron | 中 | node-cron 内存注册，必须重启才生效；仅在 07:30–14:00 JST（rerank 窗口）之外执行，`pm2 list` 核对 restart 计数。 |
| 激活时历史积压"回放"成批量交易 | 高 | 用显式 `ACTIVATION_DATE` 下界（§6）；先决策现存手动持仓清零/保留；干净起点最稳。 |
| 多日持仓乱序处理污染资金池/持仓 | 中 | 断点续跑严格升序 + 幂等（快照）；P1-3（logDate 排序）已修，为此提供基础。 |
| 结算中途崩溃留半成品 | 中 | 事务原子化（参照 Day Trade P1-2 已实现）；幂等键用事务末尾的 Snapshot。 |
| 与 07:30 现有流水线争用/延长窗口 | 低 | Swing/Long 处理量小（≤10 仓），排在 day-strategy 之后、gen-recs 前后皆可；耗时秒级。 |
| Long 候选常为空被误判故障 | 低 | STRONG_BUY 严格筛选下 Long 每日 0 候选是正常；Health/Validation 不得因 0 新开仓报错。 |
| 打乱 Phase 7 数据积累节奏 | 中 | 正因如此本方案建议随 Phase 7 一并开启，而非提前。 |
| Mission Control/文档与实际调度不一致 | 低 | 激活时同步更新 STEP_DEFS 与文档（§8）。 |

---

## 10. 是否建议立刻执行

**不建议立刻执行。** 理由：

1. **架构冻结**：Trading Architecture V1 目前 FROZEN，用户已明确将 Swing/Long 激活归入 Phase 7 / v18.x 统一开启。
2. **属激活非修复**：见 §2，这是产品/架构决策，不应在维护窗口"顺手"完成。
3. **需前置决策**：`ACTIVATION_DATE` 起点、现存手动持仓清零 vs 保留、资金池起始基数——这些必须先拍板。
4. **需协同变更**：cron 调度、Mission Control STEP_DEFS、Health 新鲜度检查、文档，成体系一起改更安全。

**执行时机建议**：Phase 7 启动、且满足既有解锁条件（DAY≥100 成交 / SWING≥30 平仓 / LONG≥20 平仓 / Grade / 连续 30 日 CRITICAL=0）时，作为 Phase 7 的首个子任务执行本方案。

> 注：Phase 7 的 SWING/LONG 平仓门槛本身依赖两线产生真实平仓——存在"先激活积累、再评估解锁"的先后关系。建议 Phase 7 明确：先激活（走本方案）→ 积累 N 个交易日 → 再评估其余门槛。

---

## 11. 最终执行指令草案（Phase 7 执行时使用，本次不执行）

> 以下为激活时的**代码改动 + 部署 + 验证清单**草案，供 Phase 7 专项参照。本次 T4 仅出文档，不动其中任何一步。

**A. 前置决策（拍板后写入实现）**
- [ ] 确定 `ACTIVATION_DATE`（如 Phase 7 启动日）。
- [ ] 决定现存 Swing/Long 手动持仓：清零重来 / 保留续跑；确定各池起始资金基数。

**B. 代码改动（scripts/，逻辑参数不改）**
- [ ] `swing-strategy.ts` / `long-strategy.ts` 自动模式 `runDate` 改为"最新且有 DailyPrice 的交易日"，并实现**升序、逐日、幂等、以 `ACTIVATION_DATE` 为下界**的断点续跑（复用 Day Trade catch-up 模式）。
- [ ] 缺价日 `SKIPPED_DATA_MISSING`（持仓不动）、无 SR 日 `SKIPPED_NO_REC`。
- [ ] 结算写入包 `$transaction`，幂等键用 `StrategySnapshot`（对齐 Day Trade P1-2）。
- [ ] `cron-scheduler.ts`：删除 16:35/16:40 触发，改为 07:30 `await syncPricesPromise` 之后、紧随 `day-strategy.ts` 调用 swing/long（保持 day→swing→long 顺序避免共享表竞争）。

**C. 观测同步**
- [ ] `mission-control` STEP_DEFS 更新 Swing/Long 调度时间。
- [ ] （可选）`data-health-guard` 增加 Swing/Long T+1 处理新鲜度检查。
- [ ] 更新 `docs/Trading-Architecture.md`、CLAUDE.md「Cron 架构」、memory P0-1 状态。

**D. 部署（遵循 CLAUDE.md Deploy Sequence）**
```bash
npm run build                         # exit 0
npm run health:data                   # CRITICAL=0
rsync .next/ + lib/ + scripts/        # 标准同步
pm2 restart tohoshou-web --update-env
pm2 restart tohoshou-cron --update-env   # cron-scheduler 改动必须，且避开 07:30–14:00 JST
pm2 list                              # 核对 restart 计数 +1
POST /api/admin/deployments           # 记录部署
```

**E. 验证**
- [ ] 手动跑一次 `swing-strategy` / `long-strategy`（auto）：确认从 `ACTIVATION_DATE` 起逐日处理、幂等（重跑 Already-settled 不重写）。
- [ ] `health:data` CRITICAL=0；S2/S11–S20 正常；Swing CLOSED 仓有 exitPrice。
- [ ] Strategy Center `/strategy`、Mission Control 显示 Swing/Long 真实每日执行。
- [ ] 连续观察 3 个交易日 cron 自动运行日志无 `No DailyPrice ... not yet synced` 空跑。
- [ ] Phase 7 就绪进度（SWING/LONG 平仓计数）开始累积。

**F. 回滚**
- [ ] 保留激活前 commit 作为回滚锚点；如异常，`git revert` + 重新 rsync + 重启 web/cron，并按需清理 `ACTIVATION_DATE` 之后误写的 Position/Snapshot/CapitalLog。

---

## 变更记录
- v1.0（2026-07-02）：初稿。基于 T3 P1 审计（v17.29.0）对 swing/long/day-strategy/cron-scheduler 的逐行核实。设计定稿、未改任何代码。
