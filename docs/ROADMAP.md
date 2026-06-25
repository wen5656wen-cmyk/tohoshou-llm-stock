# TOHOSHOU AI — Roadmap

**Version:** v12.4.0
**Updated:** 2026-06-25

---

## Completed (v9.x – v12.x)

| Version | Feature |
|---------|---------|
| v9.0 | 完全移除推送系统（LINE + 企业微信）；清理所有孤立 chat/notification 代码 |
| v10.x | Backtest Pipeline（7d/30d/90d 回测 + TOPIX 基准对比 + BacktestError 记录） |
| v10.x | `/admin/verify` 生产校验中心（8 模块 + 部署历史 DeploymentLog） |
| v11.0 | AI Portfolio Engine（DailyRecommendation Top10 自动建仓，SVG 收益曲线，TOPIX ETF 基准） |
| v11.1 | 「我的自选组合」Tab 接入真实 WatchList 数据，调仓建议 |
| v11.2 | 新闻同步僵尸 Job 修复：2h 超时守卫 + cron 假✅修正 |
| v12.0 | TOHOSHOU AI Decision Engine v1.0 — 六大铁律安全框架 |
| v12.1 | No Look-Ahead Bias 完整实施（tradeEffectiveDate 过滤）；Version Snapshot 写入 DailyRecommendation |
| v12.2 | 新闻同步 Worker 化（`scripts/sync-news.ts`），pm2 restart 不再杀死同步 |
| v12.3 | `maxDrawdown` 算法（返回负值 number，0 = 无数据）；Screener 卡片样式对齐 Watchlist；Hard Block Phase 2 基础链路；文档同步至 v12.3 |
| v12.4 | Hard Block Phase 2 データ接入完了：`sync-hard-block-status.ts`（J-Quants 退市検出 + DailyPrice 停牌検出）；3只退市株 Hard Block 登録 |

---

## P0 — Critical

*None.*

---

## P1 — High Priority

*None.*

---

## P2 — Medium Priority

| # | Feature | Notes |
|---|---------|-------|
| P2-1 | Screener 补充 `week52Pct` / `volumeRatio` 字段 | 与 Watchlist 数据层保持完全一致 |
| P2-2 | `maxDrawdown` 滚动算法优化 | 当前为简单 peak-to-trough；可改为时间窗口限制（如最近 90 日） |
| P2-3 | Backtest 趋势图积累数据（7D 回测满足后显示） | 已自动生成，无需干预 |
| P2-4 | `/admin/verify` 自动刷新（5 min 轮询或 WebSocket） | 当前需手动刷新 |
| P2-5 | en-US 股票名 fallback 补全 | `seed-all-chinese-names.ts` 类似脚本，从 Yahoo Finance 拉英文名 |

---

## P3 — Low Priority / Future

| # | Feature | Notes |
|---|---------|-------|
| P3-1 | Dividend 日历页面 | 从 Dividend 表生成，按月展示除权日 |
| P3-2 | Sector Rotation 热力图 | 按行业聚合收益率，按周期颜色显示 |
| P3-3 | 铁律六 Shadow Mode 激活 | TOHOSHOU_MODEL_VERSION 从 "disabled" 切换为实际模型 |
| P3-4 | Deployment History CI 集成 | GitHub Actions → 自动 POST `/api/admin/deployments` |

---

## Architecture Milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| 5维评分系统 (v7.x) | ✅ Done | tech/fund/flow/news/global |
| Adaptive 风格评分 (v7.5) | ✅ Done | 6 种股票风格权重 |
| GPT Rerank 覆盖 (v8.x) | ✅ Done | Top 500 每日 GPT 排名 |
| Backtest Pipeline (v10.x) | ✅ Done | 7d/30d/90d 真实交易日回测 |
| AI Portfolio Engine (v11.x) | ✅ Done | DailyRecommendation Top10 自动建仓 |
| TOHOSHOU AI Decision Engine (v12.0) | ✅ Done | 六大铁律安全框架 |
| Hard Block Phase 2 数据接入 | ✅ Done | `sync-hard-block-status.ts`；3只退市株 Hard Block 登録 |
| User Auth System | ❌ Not planned | Internal tool only |
