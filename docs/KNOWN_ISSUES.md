# TOHOSHOU AI — Known Issues

**Version:** v14.0.1  
**Updated:** 2026-06-26

---

## Active Issues

### P0 — Blocking (must fix before feature work)

*None.*

---

### P1 — High Priority

| ID | Description | Root Cause | File | Workaround |
|----|-------------|------------|------|------------|
| P1-001 | `gptRank=null` 可能在 rerank 后残留 | `rerank-top500.ts` 未完整运行或 GPT 速率限制 | `scripts/rerank-top500.ts` | `npm run rerank:top500`；`/admin/verify` 监控 |
| P1-002 | pipeline-runs.jsonl 不存在 → Pipeline stages 全 NEVER_RUN → Health Score 45/100 | cron 尚未成功运行（schema-v2.3 启动于 2026-06-26，首次 cron 完成前正常） | `scripts/rerank-top500.ts` → `logs/pipeline-runs.jsonl` | 等待 2026-06-27 07:30 JST cron 完成后自愈 |
| P1-003 | feat_* 覆盖率 0%（604 条 DailyRecommendation 均无 feat_* 数据） | 当前行在 Step 2 部署前创建，feat_* 只在 CREATE 时写入不回填 | `scripts/rerank-top500.ts` | 下次 cron 运行后新建行将含 feat_* |

---

### P2 — Medium Priority

| ID | Description | Root Cause | File |
|----|-------------|------------|------|
| P2-020 | `GlobalMarket.topix` 点位序列在 **2026-03-30 有量纲断裂**（3827→376.4，指数→ETF代理，topixChange=−90.16%），污染任何跨期 TOPIX 超额收益（含既有 `AlphaFactorReport.meanExcess` 恒 +15% 假象）。**P6-T10 修复尝试（`scripts/repair-topix.ts`）：重取 1306.T 真实 adjClose 发现其自身在 2026-04-01 仍跳变（ETF 拆股，Yahoo 未一致复权）→ 无法得到连续真实序列 → 自动 FALLBACK 至等权宇宙 benchmark（Platform Report 每日记录 `topixStatus=BROKEN / benchmarkMode=UNIVERSE`）。** 因子级 Alpha 用等权宇宙基准不受影响。待 Yahoo 复权修正或换 TOPIX 现货源后可重跑 `npm run repair-topix -- --apply`。 | 数据源在断点切换代理标的 + ETF 拆股未复权 | `GlobalMarket` 表 · `scripts/fetch-global-market.ts` · `scripts/repair-topix.ts` |
| P2-001 | en-US 股票显示名缺失 | `Stock.nameEn` 多数为 null，en-US 界面 fallback 到日文名 | `lib/company-name.ts` |
| P2-002 | Screener 无 `week52Pct` / `volumeRatio` 字段 | 指标行只有 RSI·MA·5D，与 Watchlist 相比缺少 52W 位置 | `app/api/screener/route.ts` |
| P2-003 | `week52Pct` 使用 Stock 表 `high52w/low52w`，J-Quants 同步滞后约一周 | J-Quants `high52w` 每周更新一次 | `app/api/watchlist/route.ts` |
| P2-004 | learning-report `missingDataSummary.1d.fillRate = 186.89%` | 2026-06-26 13:31 JST 手动生成的报告使用旧脚本（fix 部署前），旧公式 `filled/fillable`；新公式已部署 | `scripts/generate-learning-report.ts` | 下次 cron 生成新报告后自愈 |
| P2-005 | 1d/3d winRate 初步数据 < 50%（1d=43.78%, 3d=42.39%） | 仅 4 个 cohort dates（2026-06-23~26），统计不显著；需 ≥20 个交易日 | `scripts/update-backtest.ts` | 属设计预期，非错误；等待数据积累 |
| P2-011 | `tohoshou-ai-daily-pipeline` PM2 进程存在但已 stopped | 已被 tohoshou-cron 取代，risk：若意外启动将导致 double compute-scores + rerank race condition | `ecosystem.config.js` | 已 stopped，低风险；建议下次维护窗口清除 |

---

### P3 — Low Priority

| ID | Description |
|----|-------------|
| P3-001 | `maxDrawdown` 在组合数据不足 2 天时显示 `0%`，而非明确的"数据不足"提示 |
| P3-002 | `/admin/verify` "Copy Acceptance Report" 中 BUILD 字段为 placeholder，未读取真实构建状态 |
| P3-003 | learning-report `handleDraftSave` 调用链中 `doSubmit` 为 async，footer onClick 未 await（已知）— loading spinner 可能不显示 |
| P3-004 | 1d/3d 回测 winRate < 50%（43.78%/42.39%）属统计不显著阶段，Learning Report 已写入说明 |

---

## Recently Fixed

| Fixed | Version | Description |
|-------|---------|-------------|
| ✅ | v17.84.1 | Health Guard CHECK S33 (`day_trade_result_recent_coverage`) 每周一假 CRITICAL：DAY_TRADE 推荐在周末/祝日预生成但永不结算，旧逻辑把周末算作「连续缺失」→ 接入 JPX 交易日历跳过非交易日（`lib/trading-calendar/coverage.ts` + 9/9 测试） |
| ✅ | v14.0.1 | `/admin/learning-report` 运行时崩溃：`dataIntegrity.components` 渲染对象为 React child → 修复类型声明 + render 提取 `.score` |
| ✅ | v14.0.1 | `gradeColor()` 接受 `"WARNING"` 返回 yellow（API 实际返回值） |
| ✅ | v13.7.1 | deploy 协议：lib/ + scripts/ rsync 补入标准流程（修复 2026-06-26 cron P0 失败） |
| ✅ | v13.7.1 | fillRate > 100% bug：改为 `filled/total*100`（正确分母） |
| ✅ | v13.7.1 | Mission Control 缺少 2 个 pipeline stages（update-ai-signal-stats, generate-learning-report） |
| ✅ | v14.0.0-IA | Sidebar 重组为 3 分组 12 条目；新增 learning-report / versions / experiments / mission-control 页面入口 |
| ✅ | v12.4.0 | Hard Block Phase 2：`sync-hard-block-status.ts`（J-Quants 退市+停牌检测，3只退市株已登记） |
| ✅ | v12.3.0 | `maxDrawdown` 由 null 改为 number |
| ✅ | v12.0.0 | TOHOSHOU AI Decision Engine v1.0 — 六大铁律安全框架 |

---

## Data / Environment

| Item | Status |
|------|--------|
| `healthAllowRec` | true — 系统正常接受推荐 |
| Architecture schema | `schema-v2.3`，启动日 2026-06-26 |
| Pipeline | 全 NEVER_RUN（cron 首次完成前）；预计 2026-06-27 ~13:00 JST 后转为 SUCCESS |
| feat_* 覆盖率 | 0%（604 条均无）；下次 cron 后新行将有数据 |
| DailyPrice | FRESH（days=1，2026-06-25） |
| BacktestResult | 1d=1069 filled / 3d=493 filled / 5d-90d=PENDING（设计预期） |
| GlobalMarket | 每日 05:30 JST cron 自动同步 |
| VersionSnapshot | 当前仅 1 个（20260626-v7.7），regressionDetection=INSUFFICIENT_DATA（需 ≥2） |
| `tohoshou-ai-daily-pipeline` | stopped（已停用，保留待清除） |
