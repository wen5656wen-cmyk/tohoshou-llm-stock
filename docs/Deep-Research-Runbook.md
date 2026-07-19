# Deep Research · 运行手册 / Provider 配置 / Benchmark 操作 / 回滚（P17）

> 配套：`Deep-Research-Provider-Architecture.md`（Provider+Capability 架构图）、`Deep-Research-Scheduler.md`（调度架构+Job 流程图）。
> 单一 Research Engine 服务九产业；**Phase 5 冻结**——Anthropic Benchmark 达标前不生成其余八产业，首页续显「研究中」。

## 1. 页面与 API 地图

| 页面 | 路由 | 主 API |
|---|---|---|
| 深度研究首页 | `/deep-research` | `GET /api/research/industries` |
| 产业详情 | `/deep-research/[industryKey]` | `GET /api/research/industry/[key]` · `GET /api/research/graph/[key]` |
| 公司深度卡 | （产业详情内弹窗） | `GET /api/research/company/[key]` |
| 研究库 | `/deep-research/library` | `GET /api/research/library` · `GET /api/research/version/[id]` |
| 审核中心 | `/deep-research/review` | `GET /api/research/review` · `POST /api/research/review`🔒 |
| 研究日历 | `/deep-research/calendar` | `GET /api/research/calendar` |
| 运营看板 | `/deep-research/dashboard` | `GET /api/research/dashboard`🔒 |

🔒 = 受 `ADMIN_TOKEN` opt-in 守卫（`lib/admin-auth.ts`）：未设 ADMIN_TOKEN 则放行；设了则需 `x-admin-token` 头或 `?token=`。前端从 `localStorage.llmstock_admin_token` 取。
所有读 API 只读现有 `StockScore/Stock/Yahoo`，**禁复制评分**；**任何响应不含密钥**（Dashboard 仅返回 provider/model 名 + 已配置布尔）。

## 2. Provider 配置手册（服务器 `/opt/tohoshou/.env`）

> **禁写死模型/密钥**；模型只由 env 决定，升级只改 env。密钥仅服务器 .env，禁打印/日志/Git/聊天。

```
RESEARCH_PROVIDER=anthropic          # openai | anthropic | seed
RESEARCH_STRONG_MODEL=<模型ID>        # 深研主力，如 claude-opus-4-8（建议）；仅在此配置
RESEARCH_DAILY_MODEL=<模型ID>         # 每日增量（可较轻，如 claude-sonnet-5）
RESEARCH_MODEL=<模型ID>               # 默认/OpenAI 路径
ANTHROPIC_API_KEY=<key>              # 仅服务器 .env
OPENAI_API_KEY=<key>
```

配置后重启：`pm2 restart tohoshou-web --update-env`（cron 用到再 restart tohoshou-cron）。
自检可用性（不生成、不花钱）：`npx tsx scripts/research/benchmark.ts --providers=anthropic --industry=AI_HBM`（无 key→优雅跳过并指明配置位置）。
能力位由 Provider 暴露（`supportsThinking/WebSearch/StructuredOutput/Vision/ToolUse/LongContext`），Engine 依此自动启用 thinking/web search；Web Search 为可选能力非强依赖。

## 3. Benchmark 操作手册

```
# 三产业（AI 半导体对人工核验种子真值 · AI HBM · AI 医疗），同 schema/审核口径
npx tsx scripts/research/benchmark.ts --providers=anthropic,openai
npx tsx scripts/research/benchmark.ts --industry=AI_HBM      # 单产业
# 报告落 reports/research-benchmark-*.json（自动指标）；人审项(可验证率/关系准确率/可发布率)→ Review Center 终判
```

**合格门槛**（达标前禁 Phase 5 批量）：重大 Claim 证据覆盖 ≥95% · 无证据确定 Claim=0 · 股票代码错误=0 · 事实幻觉=0 · Schema=100% · 边重复<2% · 人审可发布≥85%。
达标后：选质量最佳且成本可接受者作 `RESEARCH_STRONG_MODEL`，逐产业进入 Phase 5（AI HBM→数据中心→电力→光模块→机器人→自动驾驶→AI Agent→AI 医疗），每条过质量门再进下一条；LLM 结果先 `AI_RESEARCHED`，人审 APPROVE 才 `PUBLISHED`。

### 模型重跑（AI 半导体 V2，收尾后执行）
1. Feature Freeze。2. 强模型重跑 AI 半导体 → 生成 **V2 AI_RESEARCHED**（**不覆盖 V1**，版本永久保留）。3. 与 Seed V1 Benchmark。4. Review。5. 达标 APPROVE 发布 V2。6. 再定是否逐产业 Phase 5。

## 4. 测试与 Health

- 测试：`npm run test:research`（11 领域 32 用例：schema/无证据阻断/provider 能力/diff/review 流转/scheduler 幂等/advisory 锁并发/retry/timeout/failure 隔离/stocklink 只读；throwaway 自动清理）。
- Health：`npm run health:data` 含 10 项 DR 检查（Scheduler/Failed Jobs/Pending Review/Evidence Coverage/Stale Research/Provider Config/Last Daily·Weekly·Trigger），**全 WARNING/INFO**；**Anthropic 未配置→NOT_CONFIGURED/WARNING，绝不 CRITICAL**。

## 5. 调度（统一，禁重复实现）

`lib/research/scheduler.ts` `runResearchJob(spec, work)`：pg advisory 分布式锁 · Retry · Timeout · 幂等 · dry-run · Job History(ResearchJob) · 失败隔离。Benchmark/Daily/Weekly/Trigger 共用。详见 `Deep-Research-Scheduler.md`。

## 6. 回滚手册

**代码回滚**（页面/API/lib）：
```
git log --oneline | grep deep-research        # 找目标 commit
git revert <hash>  或  git checkout <good-hash> -- <文件>
npm run build && npm run health:data          # CRITICAL 必须 0
rsync .next/ + lib/ + scripts/ 到服务器; pm2 restart tohoshou-web --update-env
```
**数据回滚**（研究版本，永不物理删除）：版本永久保留，回滚=把目标版本 `status` 置回 `PUBLISHED`、错误版本置 `REJECTED`（经 Review Center 或直接改 `ResearchVersion.status`）。**AI 半导体 V1 为黄金基线，禁覆盖/禁删**。
**Provider 回退**：改 `.env` 的 `RESEARCH_PROVIDER`/`RESEARCH_STRONG_MODEL` 即切换/降级；`runWithFallback` 支持 strong 失败降级 fallback。
**依赖回滚**：`@xyflow/react`/`@anthropic-ai/sdk` 为附加依赖，移除只影响 Deep Research（KG 图/Anthropic provider），不影响评分/交易。
**Schema**：本阶段 Deep Research 无 DB 结构变更（复用既有 research_* 表）；如需回滚早期结构见 git `prisma/schema.prisma` 历史。

## 7. Known Issues / 边界

- 强模型 Benchmark 未跑（待 `.env` 配 ANTHROPIC_API_KEY + RESEARCH_STRONG_MODEL）；Phase 5 冻结中。
- 规模测试当前受数据限制（仅 14 家 AI 半导体）；50/100 家于 Phase 5 补充产业后验证（设计已批量化 Promise.all/groupBy/fetchQuotesBatch，无 N+1）。
- Benchmark source pack 目前为空占位（接强模型/填证据源前基准仅验证管线，不作数）。
- Mission 集成冻结（不映射 user_holdings），公司卡显 Coming Soon。
- KG 为 client 渲染（`@xyflow/react`，dynamic ssr:false）。
