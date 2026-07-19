# TOHOSHOU AI — Roadmap

**Version:** v14.0.1  
**Updated:** 2026-06-26

---

## Completed (v9.x – v14.x)

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
| v12.3 | `maxDrawdown` 算法；Screener 卡片样式对齐 Watchlist；Hard Block Phase 2 基础链路 |
| v12.4 | Hard Block Phase 2 データ接入完了（J-Quants 退市+停牌检测） |
| v13.0–v13.6 | Architecture v2.3 冻结；Step 1–6 完整实施（BacktestPositionResult / feat_* / Mission Control / Learning Engine / Version & Experiment / Research Platform） |
| v13.7.1 | Stabilization Audit：P0 deploy 协议 + P1 fillRate fix + P2 pipeline stages |
| v14.0.0-IA | UI 信息架构重组：3 分组 Sidebar + 驾驶舱首页 + 9-Horizon 回测矩阵 + 学习报告页 + Portfolio 免责声明 |
| v14.0.1 | `/admin/learning-report` P0 运行时崩溃修复（components 类型 + gradeColor WARNING 支持） |

---

## 当前观测阶段（2026-06-26 起）

**Phase B: Observation Mode** — 等待 cron 验证

| 待验证项 | 预计时间 | 条件 |
|---------|---------|------|
| pipeline-runs.jsonl 生成 | 2026-06-27 ~07:30 JST | cron 首次成功 |
| feat_* 覆盖率 > 0% | 2026-06-27 ~10:00 JST | rerank-top500 写入新行 |
| Health Score ≥ 70/100 | 2026-06-27 ~13:00 JST | 全链路 SUCCESS |
| Learning Report integrityScore ≥ 75 | 2026-06-27 ~13:00 JST | pipeline 加分 |
| 5d horizon READY | 2026-07-05（约） | `HORIZON_CAL_DAYS["5d"]=9` |
| 30d horizon READY | 2026-08-09 | `HORIZON_CAL_DAYS["30d"]=46` |
| 90d horizon READY | 2026-11-03 | `HORIZON_CAL_DAYS["90d"]=132` |
| regressionDetection 可用 | 第 2 个 VersionSnapshot 生成后 | 需 ≥2 个同 schemaVersion |

---

## P0 — Critical

*None.*

---

## P1 — High Priority

| # | Item | 优先理由 |
|---|------|---------|
| P1-A | 2026-06-27 cron 完整验收（pipeline SUCCESS / feat_* / Health Score ≥70 / Learning Report） | cron 首次成功是 schema-v2.3 核心验证 |
| P1-B | 清除 `tohoshou-ai-daily-pipeline` 已停用 PM2 进程 | Race condition 风险（若意外启动） |

---

## P2 — Medium Priority

| # | Feature | Notes |
|---|---------|-------|
| P2-1 | Screener 补充 `week52Pct` / `volumeRatio` 字段 | 与 Watchlist 数据层保持完全一致 |
| P2-2 | `maxDrawdown` 滚动算法优化 | 当前为简单 peak-to-trough；可改为时间窗口限制 |
| P2-3 | Backtest 趋势图积累数据（7D 回测满足后显示） | 已自动生成，无需干预 |
| P2-4 | `/admin/verify` 自动刷新（5 min 轮询或 WebSocket） | 当前需手动刷新 |
| P2-5 | en-US 股票名 fallback 补全 | `seed-all-chinese-names.ts` 类似脚本，从 Yahoo Finance 拉英文名 |
| P2-6 | Learning Report DataReadiness 显示 `featureCoverage` 区块 | API 已返回此字段，页面尚未展示 |

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
| Hard Block Phase 2 数据接入 | ✅ Done | `sync-hard-block-status.ts` |
| Architecture v2.3 冻结 | ✅ Done | 2026-06-26；4 不可变决策；schema-v2.3 |
| Step 1: BacktestPositionResult | ✅ Done | 9-horizon 不可变真实收益记录 |
| Step 2: feat_* 特征快照 | ✅ Done | 30 个特征字段 CREATE-only，0% 覆盖率等待首次 cron |
| Step 3: Mission Control | ✅ Done | 10-stage pipeline 可见性 |
| Step 4: Learning Engine | ✅ Done | 确定性回测报告 + JSON 快照 |
| Step 5: Version & Experiment | ✅ Done | VersionSnapshot + ExperimentRun 全链路 |
| Step 6: Research Platform | ✅ Done | 只读分析研究平台 |
| UI 信息架构 v14.0.0-IA | ✅ Done | 3分组导航 + 驾驶舱 + 9-Horizon 矩阵 |
| Phase B: Cron 首次完整验证 | 🔄 进行中 | 预计 2026-06-27 13:00 JST |
| User Auth System | ❌ Not planned | Internal tool only |


---

## Deep Research（P17）路线

- ✅ Phase 1-4：架构/数据模型/Research Engine/AI 半导体 Golden Path/首页+产业详情+公司卡。
- ✅ Phase 6：知识图谱专业可视化（React Flow）。
- ✅ Track 1：Research Library / Review Center / Calendar / Dashboard / 统一调度基础设施。
- ✅ 收尾：只读联调 / 测试(32) / 性能 / Health 纳入 / 安全守卫 / 文档。
- ⏳ Track 2：强模型接入代码完成，待服务器 .env 配 ANTHROPIC_API_KEY + RESEARCH_STRONG_MODEL → Benchmark（AI HBM/医疗 + AI 半导体对种子）→ 达标。
- 🧊 **Phase 5 冻结**：达标前不生成其余八产业（AI HBM→数据中心→电力→光模块→机器人→自动驾驶→AI Agent→AI 医疗，逐条），首页续显「研究中」。
- 后续：AI 半导体 V2 强模型重跑（不覆盖 V1）→ Benchmark → 发布。
