# TOHOSHOU AI — Known Issues

**Version:** v12.4.0
**Updated:** 2026-06-25

---

## Active Issues

### P0 — Blocking (must fix before feature work)

*None.*

---

### P1 — High Priority

| ID | Description | Root Cause | File | Workaround |
|----|-------------|------------|------|------------|
| P1-1 | `gptRank=null` 可能在 rerank 后残留 | `rerank-top500.ts` 未完整运行或 GPT 速率限制 | `scripts/rerank-top500.ts` | `npm run rerank:top500`；`/admin/verify` 监控 |

---

### P2 — Medium Priority

| ID | Description | Root Cause | File |
|----|-------------|------------|------|
| P2-2 | en-US 股票显示名缺失 | `Stock.nameEn` 多数为 null，en-US 界面 fallback 到日文名 | `lib/company-name.ts` |
| P2-3 | Screener 无 `week52Pct` / `volumeRatio` 字段 | 指标行只有 RSI·MA·5D，与 Watchlist 相比缺少 52W 位置 | `app/api/screener/route.ts` |
| P2-4 | `week52Pct` 使用 Stock 表 `high52w/low52w`，J-Quants 同步滞后约一周 | J-Quants `high52w` 每周更新一次 | `app/api/watchlist/route.ts` |

---

### P3 — Low Priority

| ID | Description |
|----|-------------|
| P3-1 | `maxDrawdown` 在组合数据不足 2 天时显示 `0%`，而非明确的"数据不足"提示 |
| P3-2 | Backtest `update-backtest.ts` 需要首次 DailyRecommendation 日期起满 7 个交易日才能填充回测数据 |
| P3-4 | `/admin/verify` "Copy Acceptance Report" 中 BUILD 字段为 placeholder，未读取真实构建状态 |

---

## Recently Fixed

| Fixed | Version | Description |
|-------|---------|-------------|
| ✅ | v12.4.0 | Hard Block Phase 2 データ接入完了：`sync-hard-block-status.ts` により J-Quants 退市 + 停牌検出，3只退市株登録済 |
| ✅ | v12.3.0 | `maxDrawdown` 由 null 改为 number（数据不足返回 0，正常返回负值如 -3.25） |
| ✅ | v12.3.0 | Screener 桌面卡片对齐 Watchlist 紧凑风格（4列·Score+Badge·RSI·MA·5D 行） |
| ✅ | v12.3.0 | Hard Block Phase 2 基础链路：`isHardBlockedStock()` + Stock schema 字段 + compute-scores 接入 |
| ✅ | v12.2.0 | 新闻同步 Worker 化（`scripts/sync-news.ts`），pm2 restart 不再杀死同步进程 |
| ✅ | v12.1.0 | No Look-Ahead Bias 完整实施：`tradeEffectiveDate <= todayJST` 过滤 |
| ✅ | v12.1.0 | DailyRecommendation 写入 VERSION_SNAPSHOT 版本字段（铁律五闭环） |
| ✅ | v12.0.0 | 六大铁律安全框架（Confidence Guard / Risk Override / Version Freeze / Shadow Mode） |
| ✅ | v11.2.0 | 僵尸 SyncJob 修复：2h 超时自动 FAILED + cron 假✅修正 |

---

## Data / Environment

| Item | Status |
|------|--------|
| `healthAllowRec` | true — 系统正常接受推荐 |
| `BacktestResult TOP10` | 等待首批 DailyRecommendation 满 7 个交易日后自动填充 |
| `Stock.isDelisted` 等 Hard Block 字段 | 已建表并接入数据：3714 ACTIVE / 3 DELISTED（2686.T, 7922.T, 6403.T）/ 0 HALTED |
| `GlobalMarket` | 每日 05:30 JST cron 自动同步 |
