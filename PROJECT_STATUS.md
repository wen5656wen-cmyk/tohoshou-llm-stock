# PROJECT_STATUS.md — TOHOSHOU AI 日本股票AI分析系统

> **最后更新：** 2026-07-03（P3-T3 V3 Calibration Engine 评分标定 Shadow）
> **版本：** v17.48.0（P3-T3 V3 标定引擎 Shadow-only；基线 `v2.0.0-universe-stable` 生产完全不变）
> **生产域名：** https://aitohoshou.com（唯一生产验收域名，禁止使用 tohoshou.com）
> **下次启动继续位置：** [→ 见最下方 NEXT SESSION](#next-session)

## ⭐ 最新版本速览（v17.48.0 — 2026-07-03）

**P3-T3 V3 Calibration Engine（评分标定，Shadow-only，生产零改动）**
- 修复 P3-T2 P0 阻断项：V3 固定阈值致 STRONG_BUY 155只(5.1%)过宽 → 改**每日按分布+市场状态动态阈值**。
- `lib/scoring-v3/calibration/`(6模块)：distribution(分布/分位)/threshold(动态阈值,目标桶 SB~1%·BUY~5%·HOLD~25%·WATCH~60%,BULL宽BEAR严)/confidence(0–100可信度)/quality(维度覆盖+综合质量)/rating(为什么是某评级)/calibration(编排+Readiness Gate)。`lib/scoring-engine.ts` Feature Flag `V3_CALIBRATION`(默认ON)。
- `AdaptiveScoreV3Shadow` 加 confidence/qualityScore/calibrated；新表 `AdaptiveScoreV3Calibration`(每日阈值/分布/Confidence/Quality/SB统计/Readiness/历史)。compute 集成标定,cron 10:15 每日跑。
- **实测:SB 155→47(5.1%→1.53%)修复**;阈值 SB≥84.4;Confidence均值84.3(高3056/中1/低12);Quality 94.8%;**Readiness 76.8/Grade B(未达90暂缓,剩余缺口=前向证据仅1-2日需累积1周)**。
- API `/api/scoring-v3/calibration`+`/shadow`增Confidence;AI研究中心新增Tab「V3 Calibration」(Readiness Gate/阈值/分布/Confidence/Quality/SB统计/历史/CSV)。
- 验收:**V2完全不变**(SB2/BUY21/HOLD391/WATCH1494/AVOID1161,DR500,GPT/Portfolio未动);tsc/build exit0;health CRITICAL=0;未切v3。deployment #101,commit见CHANGELOG。**Readiness 未达90→暂缓上线,继续Shadow累积前向证据。**

## ⭐ 上一版本速览（v17.47.0 — 2026-07-03）

**P3-T1 Adaptive Score V3 Pro（动态评分引擎，Shadow-only，不影响生产）**
- 解决 V2「全球/资金/新闻区分度低」：动态权重替代固定权重，先 Shadow 验证。**全球维度移除**（V2 中对排名零贡献）、**资金改用个股级数据**（AlphaFactor 量比/放量/流动性，弃市场级 InstitutionalFlow）、**新闻无事件不给常数分**。
- 引擎 `lib/scoring-v3/`（6模块）：regime-gate（状态门控，不加分只调权重+风险倍率）/ factor-quality（覆盖率·区分度·新鲜度·RankIC→低质量自动降权）/ dynamic-weight（min·max·归一化·单日±5%限幅）/ risk-adjustment（-15..0）/ score-v3（7维主引擎）/ explain（中文解释）。`lib/scoring-engine.ts` Feature Flag `SCORING_ENGINE=v2|v3`（默认v2，一键回滚，本阶段生产不读取）。
- 新表 `AdaptiveScoreV3Shadow`；`scripts/compute-score-v3-shadow.ts`（只写Shadow，3069只/BULL/动态权重技术41.4·基本面18.3·Alpha22.6·新闻7.5·资金10.2%）；`scripts/backtest-score-v3.ts`（V2/Alpha/Fusion/V3 对比→reports/score-v3-backtest.json，Top20/20日：180日 V3 45.55%≈V2 44.82%略优、30日 V3 -3.59% 比 V2 -4.61% 抗跌）；cron 10:15 每日跑。
- API `/api/scoring-v3/shadow` + `/api/scoring-v3/backtest`；AI研究中心新增 Tab「V3动态评分」（动态权重/回测对比/排名/风险扣分/V2对比/中文解释/CSV）；数据更新中心加 V3。
- 验收：**V2 完全不变**（StockScore SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR 500、GPT/Portfolio 未动）；V3 Shadow 3069/Backtest 108 正常；tsc/build exit0；health CRITICAL=0；tab 200。deployment #100，commit 见 CHANGELOG。
- **周一决策点**：据 V3 Shadow 连续验证 + Backtest 决定是否 `SCORING_ENGINE=v3`（需人工确认+一键回滚）。

## ⭐ 上一版本速览（v17.46.0 — 2026-07-03）

**P2-T7 UI/UX 统一 + P2-T8 数据更新时间中心（仅前端，不改算法/DB/API返回值/Cron）**
- **统一 Tab 标题**：综合驾驶舱/Alpha因子库/因子分析/影子评分（Alpha）/Alpha策略回测/市场状态/AI融合策略研究。
- **统一页头 `components/research/PanelHeader.tsx`**：标题+中文说明+阶段/数据日期/计算时间/股票数量/数据状态+右侧「最后更新：YYYY-MM-DD HH:mm·正常/偏旧/超时」;移除 Phase/Admin/computed/date/as-of/shadow;时间统一 JST YYYY-MM-DD HH:mm。
- **术语 Tooltip**(TERM_TIPS):ATR/IC/Rank IC/夏普比率/Alpha/市场宽度/波动率/RS/量比。统一按钮/表格/颜色规范。
- **综合驾驶舱新增**:①数据更新时间卡(9模块 Universe/AI综合评分/Alpha因子/因子分析/影子评分/Alpha回测/市场状态/融合策略/新闻,自动读 computedAt,状态色<24h绿/24-48h黄/>48h红,新闻18:00前显示等待今日更新)②顶部提示(今日研究数据全部最新/X超48h未更新)③当前推荐策略(BULL/SIDEWAYS/BEAR 最优融合比例+正式推荐仍100%正式评分说明)。
- **聚合API `/api/admin/research-overview` 新增** moduleUpdates/dataHint/recommendedStrategy(全读产物 computedAt,不手写)。
- 验证:tsc/build exit0;health CRITICAL=0;research-overview 实测9模块全绿/dataHint全最新/推荐策略正确;6tab 200;API返回值不变;功能100%一致。仅rsync .next+重启web。deployment #99,commit 见 CHANGELOG。

## ⭐ 上一版本速览（v17.45.0 — 2026-07-03）

**P2-T6 AI研究中心全面汉化（UI Only）**
- 7 个 Tab 全部页面/按钮/表头/统计项/提示文案统一中文,保留缩写 ATR/RS/IC/Rank IC/RSI/TOPIX/CSV。**仅改前端显示文案**,禁改算法/DB/Prisma/Cron/API 返回值。
- 6 个 `components/research/*Panel.tsx` 汉化(综合 Tab 已中文):Alpha因子(表头相对强弱/波动率%/距离52周…)、因子分析(有效/一般/较弱/胜率/未来收益/夏普/前后20%)、Alpha评分(百分位/主要贡献因子/AI综合评分/AI评级/推荐排名/推荐等级/影子评分说明)、Alpha回测(正式评分/影子评分/融合比较/累计收益/年化/夏普/最大回撤/样本数)、市场状态(当前市场状态/趋势/市场宽度/波动率/牛市震荡熊市)、融合策略研究(最佳融合比例/最佳融合方案/不同权重夏普)。所有 Loading/Empty/Placeholder 中文,CSV 按钮统一「导出CSV」。
- **纯显示层**:对 API 枚举值(ratingLabel/factor/regime/View)加 display 映射翻译(RATING_ZH/FACTOR_ZH/RZH/VLABEL),**不改 API 返回值**;实测 API 仍返回英文原值(factor:ATR/ratingLabel:Effective)。字体颜色布局功能不变。
- 验证:tsc/build exit0;health CRITICAL=0;6 tab+6 API 全200;**API 返回值不变**;功能100%一致。仅rsync .next+重启web(无schema/cron)。deployment #98,commit 见 CHANGELOG。

## ⭐ 上一版本速览（v17.44.0 — 2026-07-03）

**P2-T5.1 AI研究中心「综合」老板驾驶舱（Boss Dashboard）**
- 升级综合 Tab 为老板驾驶舱(第一屏无滚动),后6 Tab 不变,原研究分析保留在下方。纯 UI/只读聚合,不改任何算法。
- **聚合 API `/api/admin/research-overview`**(只读)一次返回全部。**`components/research/BossDashboard.tsx`**(深色,与首页一致):①当前市场(🟢牛🟡震🔴熊+Trend/Breadth/Vol,读MarketRegime)②AI评分(SB/Buy/Hold/Watch/Avoid,与AI选股一致)③Alpha状态(已计算数/最新/Shadow)④Fusion状态(Prod Running/Alpha Shadow/Fusion Research/Paper Running-Stopped)⑤今日摘要(市场/Prod SB·Buy/Alpha数/研究模式/Shadow 30·90·180日跑赢·落后)⑥系统健康(Health/CRITICAL/WARNING/Cron/DB/API,读health报告)+Universe(总/启用/排除/自动/人工/数据质量/低流动)+研究结论(自动读Backtest生成:Alpha短周期优/Production中长期稳/建议继续Shadow)+今日时间线(05:00~22:00 11节点✅⏳❌)。
- 验证:tsc/build exit0;health CRITICAL=0;API 实测全区块正确(BULL/SB2 Buy21/Universe/Alpha3058/Shadow 30跑赢90·180落后/结论/时间线9-11 done);/admin/research 200;**纯UI生产完全不变**。仅rsync .next+重启web(无schema/cron)。deployment #97。

## ⭐ 上一版本速览（v17.43.0 — 2026-07-03）

**P2-T5 AI 研究中心（Research Center）整合**
- 现有「研究分析」`/admin/research` 升级为「AI 研究中心」,7 个中文 Tab:①综合(原内容原样保留,含内部5子tab)②Alpha因子(原/alpha)③因子分析(/alpha/report)④Alpha评分（影子评分）(/alpha/score)⑤Alpha回测(/alpha/backtest)⑥市场状态(/market-regime)⑦融合策略研究(/fusion/report)。Tab 切换不跳页。
- 6 原页逻辑抽为 `components/research/*Panel.tsx`(中文 H1);研究页原组件改名 `OverviewTab`+新增顶层 `ResearchCenterPage` Tab 壳(读 ?tab= via window.location);6 原页改 client 重定向到 `/admin/research?tab=<key>`(消除孤立页);SystemDashboard 6 入口改指 research?tab(/fusion/paper 独立保留)。
- 验证:tsc/build exit0;health CRITICAL=0;/admin/research 200 + 7 中文 tab 渲染;6 重定向路由+API 均 200;**纯 UI 重组,生产推荐/评分/Portfolio 完全不变**。仅 rsync .next+重启 web(无 schema/cron 变更)。deployment #96,commit 见 CHANGELOG。

## ⭐ 上一版本速览（v17.42.0 — 2026-07-03）

**P2-T4 Fusion Paper Trading（三策略前向纸面交易，只读，不改正式推荐）**
- **三策略**：PRODUCTION(真实 DailyRecommendation Top by gptRank,只读消费)、ALPHA(AlphaScore 复合分重建 Top)、FUSION(regime 自适应 w·Alpha+(1-w)·Prod,w=当日 regime 已搜索最优权重)。
- **`scripts/fusion-paper-trade.ts`**(绝不改官方推荐/StockScore/Portfolio):每 entry 日生成三套 Top10/20,记录 entryClose+未来 1/3/5/10/20 日真实收益,幂等,cron **10:00 JST** 每日跑累积。Bootstrap:初始 entry=DailyRec 已有收盘的 11 天(06-20~07-02)。
- **新表 FusionPaperPick**;**API `/api/fusion/paper`**(三策略×周期 均收益/胜率/n+最新持仓);**页面 `/fusion/paper`**(Top10/20 切换+对比表+持仓+CSV);Dashboard ◎入口。
- **生产100%一致(指纹吻合)**：ΣadaptiveScore146778、SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR500、Portfolio#11/9、compute-scores未跑;health CRITICAL=0;6个alpha slots(08:45/09:00/09:15/09:30/09:45/10:00);810 pick-rows/11 entry dates。
- **早期观察(样本小周期短)**:Top20 5d Production−3.28%(win53.6%)/Alpha−1.33%/**Fusion−0.80%最优**;10/20d 待未来2-4周累积。**待累积充分后再决定是否接入正式评分。**

## ⭐ 上一版本速览（v17.41.0 — 2026-07-03）

**P2-T3 Adaptive Fusion Engine（Market Regime Research，只读研究）**
- **`lib/market-regime/`**（各独立）：trend(TOPIX MA20/60/120→trendScore)、volatility(实现波动率年化%)、breadth(%高于MA20)、regime(0.55·trend+0.45·breadth,高波动risk-off→BULL/SIDEWAYS/BEAR)。
- **`scripts/research-fusion.ts`**（绝不读写生产表）：每日分类→MarketRegime(149行,分布BULL62/SIDE22/BEAR65,当前BULL);从DailyPrice重建Alpha/Prod组合按regime分组,**网格搜索w∈{0..1}最优融合(目标Sharpe)**→RegimeFusionResult(3行)。cron **09:45 JST**。
- **API** `/api/regime`+`/api/fusion/report`;**页面** `/market-regime`(时间线/分布/CSV)+`/fusion/report`(每regime Prod/Alpha/Best-Fused+最优比例+网格/CSV);Dashboard ◱⚗入口。
- **生产100%一致(指纹吻合)**：ΣadaptiveScore146778、SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR500、Portfolio#11/9、compute-scores未跑;health CRITICAL=0;5个alpha slots(08:45/09:00/09:15/09:30/09:45)。
- **关键发现(数据搜索,目标Sharpe)**：BULL 0/100(Prod1.73/Alpha2.25)、SIDEWAYS 0/100、**BEAR 20/80(融合Sharpe3.24>Prod1.53>Alpha1.86,协同增效)**。窗口(25-11~26-06)强上行无持续熊市,「BEAR」多为高波动回调。
- **Phase 2B正式融合必须建于本研究搜索结果之上,禁止凭经验设融合比例。**

## ⭐ 上一版本速览（v17.40.0 — 2026-07-03）

**P2-T2 Shadow Validation Engine（Alpha Shadow Backtest，只读验证）**
- **方法**：DailyRecommendation 仅12天无前瞻数据、production 分数不可历史重建→**两分数均从 DailyPrice 重建**：AlphaScore(Analytics 加权6因子 z-composite) vs Production(动量核心 z(ret20)+z(ret60),透明标注)。每as-of日截面z→排名→Top10/20/50等权→持有5/10/20日→前瞻收益(385,144观测)。
- **统计(`lib/alpha/backtest.ts`)**：累计收益/Alpha(年化超额)/Sharpe/最大回撤/胜率/年化/样本数。
- **新表 AlphaBacktestResult(54行)**；`backtest-shadow.ts`(绝不读写生产表);cron **09:30 JST**。**API `/api/alpha/backtest?period=`**;**页面 `/alpha/backtest`**(Production/Shadow/Overlay 切换+周期+矩阵+CSV);Dashboard ⚖入口。
- **生产100%一致(指纹吻合)**：ΣadaptiveScore146778、SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR500、Portfolio#11/9、compute-scores未跑；health CRITICAL=0;4个alpha cron slots(08:45/09:00/09:15/09:30)。
- **关键发现(Top20/20d累计)**：30d Prod−4.61%/Alpha+1.55%(Alpha胜);90d Prod+14.49%/Alpha+9.77%(Alpha输);180d Prod+44.82%/Alpha+25.27%(Alpha输)→**Alpha 未全面优于动量,短周期占优/中长周期在强动量牛市跑输,Phase2融合须审慎禁盲目上线。**
- **READ-ONLY:回测仅重建历史比较,生产不受影响。**

## ⭐ 上一版本速览（v17.39.0 — 2026-07-03）

**P2-T1 Alpha Engine 2.0 — Phase 2A（Alpha Score Shadow Mode，不接入 AI Score）**
- **权重(`lib/alpha/score.ts`)**：源 AlphaFactorReport(默认period30)，Rank IC 主(70%)+Sharpe 辅(30%)归一化，方向=sign(RankIC)自动识别(ATR 负 IC→低波动因子反向)，|IC|<0.01 排除。实测:Dist52wHigh+35.9%/ATR−33.0%/AvgTurnover+16.7%/RS+7.8%/VolExp−6.5%/VolRatio0%。
- **打分(`compute-alpha-score.ts`,仅aiEnabled,不写StockScore)**：最新AlphaFactor截面z-score(turnover先log10)→composite=Σdir·z·w→alphaScore=clamp(50+10·composite,0,100)+rank+percentile+factorBreakdown JSON。cron 09:15。
- **新表 AlphaScore**(SHADOW ONLY);**API `/api/alpha/score`**(排名+vs AI Score+vs DailyRecommendation+权重);**页面 `/alpha/score`**(排名/因子贡献/对比/CSV);Dashboard 入口 ⚡Factors/★Analytics/◈Score。
- **生产完全不变(指纹吻合)**：ΣadaptiveScore146778、SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR500、Portfolio#11/9、compute-scores未跑；AlphaScore 3058行;health CRITICAL=0。
- 影子分化:#1 6522.T Alpha60.84 vs AI47/WATCH;8306(MUFG)Alpha60.44 vs AI46/WATCH——AlphaScore(动量/低波动/流动性)与AI Score明显不同,供Phase2融合参考。
- **SHADOW ONLY:绝不接入 AdaptiveScore/GPT Rank/DailyRec/Portfolio。**

## ⭐ 上一版本速览（v17.38.0 — 2026-07-03）

**P2-T1 Alpha Engine 2.0 — Phase 1.5（Alpha Analytics，只读因子有效性统计）**
- **方法**：因子是价格确定性函数，从 DailyPrice 历史按 as-of 日期重算因子+前瞻收益做因子回测（385,144 观测，as-of 2025-11-25…2026-06-08）。
- **`lib/alpha/analytics/`**（各独立）：forward-return、information-coefficient(IC/Rank IC)、rank-analysis(Top/Bottom 20%)、factor-performance(mean/win/std/sharpe)、report(编排+星级 by |RankIC|)。
- **周期 7/30/90/180（默认30）**；6 因子×每因子：样本数/前瞻收益(5·10·20日)/胜率(top20%)/超额收益/IC/Rank IC/Top20%·Bottom20%/Sharpe/★1-5。
- **新表 AlphaFactorReport(24行)**；`compute-alpha-analytics.ts`(绝不读写 StockScore/DR/Portfolio)；cron **09:00 JST**。
- **API** `/api/alpha/report?period=`；**页面 `/alpha/report`**(因子卡+星级+周期切换+CSV 导出)；Dashboard 管理员入口。
- **生产完全不变(指纹吻合)**：ΣadaptiveScore146778、SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR500、Portfolio#11/9、compute-scores 未跑；health CRITICAL=0。
- 示例30d：Dist52wHigh★5(RankIC0.147/Sharpe1.91)、ATR★5(-0.142低波动异象)、AvgTurnover★5(0.068/win51.2%)、RS★3、VolExp★2、VolRatio★1。
- **Phase 2 必须建立在 Analytics 统计之上，禁止凭经验改评分权重。**

## ⭐ 上一版本速览（v17.37.0 — 2026-07-03）

**P2-T1 Alpha Engine 2.0 — Phase 1（Alpha Factors，纯新增数据层）**
- **`lib/alpha/`**（每因子独立互不耦合）：relative-strength(RS5/20/60 vs TOPIX)、atr(ATR14/ATR%)、new-high(Dist52wHigh/Low)、liquidity(AvgTurnover20)、volume-ratio(VolR5/20/VolExpDays)、event-factor(Buyback/DividendRaise/GuidanceRaise/TDnet — Phase1 仅接口返 null)、index(编排)。
- **新表 `AlphaFactor`**（严格附加，不被评分/推荐消费）；`scripts/compute-alpha-factors.ts`（读 DailyPrice/GlobalMarket/Stock，绝不读写 StockScore/DR/Portfolio）；cron **08:45 JST** slot。
- **API** `/api/alpha/[symbol]` + `/api/alpha`（列表）；**调试页 `/alpha`**（排序/搜索/CSV 导出，管理员）。
- **生产完全不变（指纹逐字段吻合）**：Σ adaptiveScore 146778 不变、SB2/BUY21/HOLD391/WATCH1494/AVOID1161 全同、DR 500、Portfolio#11/9、compute-scores 未重跑；AlphaFactor 新增 3069 行；health CRITICAL=0。
- **Phase 2 才允许据历史统计调评分权重**；Phase 1 仅数据层。

## 🔒 P2-T0 封版基线（2026-07-03 Production Baseline）

**基线文档：** [docs/BASELINE_2026-07-03.md](docs/BASELINE_2026-07-03.md) · **Git Tag：** `v2.0.0-universe-stable`

| 里程碑 | 状态 |
|--------|------|
| P1-T1 Universe Filter（aiEnabled/excludeReason + 手动开关 + 评分流程过滤）| ✅ |
| P1-T2 Universe Guard（自动排除规则 + 手动优先 + provenance）| ✅ |
| P2-T0 Data Rebuild（全量重建评分/排名/推荐，与新 universe 一致）| ✅ |
| Cron Guard Active（05:00 JST `update-ai-universe` 已注册并激活）| ✅ |

**基线数据：** Universe 3719（Enabled **3070** / Excluded **649**：AUTO 645 / MANUAL 1 / SYSTEM 3）·
评级分布 StrongBuy 2 / Buy 21 / Hold 391 / Watch 1494 / Avoid 1161（scored 3069）· DR today 500 ·
Health **CRITICAL=0** · 下一基线：P2-T1。

## ⭐ 最新版本速览（v17.36.0 — 2026-07-03）

**紧急修复：恢复 8198.T 到 AI 评分池（受保护关注股）**
- 8198.T 状态：`aiEnabled=true / source=MANUAL / rule=MANUAL_INCLUDE_WATCHLIST / excludeReason=null`。Guard 跳过 source=MANUAL → 永不排除。
- **Admin enable 升级**：手动加入始终写 source=MANUAL（受保护）；原 AUTO/SYSTEM→保留 rule 作 override 警告，否则 rule=MANUAL_INCLUDE_WATCHLIST。
- **/api/indicators + /stocks**：watchlist 纳入股即使未进 top-500 也追加到列表（isWatchlist + ★），保证 /stocks 可搜到。
- **rerank 永久修复**：Step 8 upsert 前删当日不在 top-N 的 DR 行（根治 re-run stale DR 重复 gptRank）。
- 验证：health CRITICAL=0；Enabled 3071/Excluded 648；8198.T 有 StockScore(adp40/rank2266)、/api/stocks 搜到、/api/indicators 含、guard 再跑 skipped(MANUAL)=1 不排除；DR 500 连续无重复。

## ⭐ 上一版本速览（v17.35.0 — 2026-07-03）

## ⭐ 最新版本速览（v17.35.0 — 2026-07-03）

**P2-T0 Universe 重建（Rebuild After Universe Guard）**：T1/T2 改变 universe 后全量重建评分/排名/推荐。
- **修复 BUG**：今晨 rerank 早于 guard 排除→今日 DR 含 92 / GPTScore 含 193 / StrategyRec 含 17 已排除股票。根因：股票离开 universe 时当日 DR+GPTScore 未清理。**修复**：`compute-scores.ts` 排除 purge 块新增删 excluded 的全部 GPTScore + 当日 DR（历史 DR 不动）。
- **重建**：compute-scores → rerank:top500(49min,500 DR) → 修复后重跑 compute-scores(清 193 GPT+92 DR) → portfolio snapshot#10 → strategy recs 重生成。
- **验证全绿**：health CRITICAL=0；Enabled 3070/Excluded 649；StockScore excludedWithScore=0；DR 500 excluded=0 rank 1..500 连续；GPTScore excluded=0；Portfolio 8 持仓 excluded=0；StrategyRec excluded=0；Dashboard 强烈推荐3/推荐21 刷新；API/页面 200。
- 仅 scripts/compute-scores.ts 变更，rsync 生效，无需重启 web/cron。

## ⭐ 上一版本速览（v17.34.0 — 2026-07-03）

## ⭐ 最新版本速览（v17.34.0 — 2026-07-03）

**P1-T2 AI Universe Guard（自动排除规则）**：`scripts/update-ai-universe.ts` 定期识别不适合 AI 评分的股票。
- **新字段**：`Stock.aiExcludeSource`(MANUAL/AUTO/SYSTEM) / `aiExcludeRule`(命中规则,兼作覆盖 warning) / `aiExcludeUpdatedAt`。
- **规则**：DELISTED/SUSPENDED(SYSTEM)、ETF/ETN/REIT/PREFERRED 名称匹配、DATA_QUALITY(近30日bar<10)、LOW_TURNOVER(近30日日均成交额<¥5M) — 均 AUTO。规则在 `lib/ai-universe.ts classifyAutoExclude`。
- **手动优先(LOCKED)**：`source=MANUAL` 永不被 guard 触碰；手动 re-enable AUTO 股票→`override:true`+保留 rule 作 warning，guard 跳过；AUTO/SYSTEM 排除自愈(不再命中→自动 re-enable)。
- **即时生效**：新排除者 `$transaction` 内 purge StockScore（同 T1）；cron 05:00 JST(compute-scores 前)。
- **生产结果**：648 自动排除(639 低流动性/3 退市/3 REIT/3 数据质量)，Enabled 3070。
- **阈值可调**：`AI_UNIVERSE_MIN_TURNOVER_JPY`(默认¥5M) / `AI_UNIVERSE_MIN_BARS_30D`(默认10)。
- ⚠️ **待办**：`cron-scheduler.ts` 已加 05:00 slot，但需在 14:00 JST 后 `pm2 restart tohoshou-cron --update-env` 激活自动触发（本次因 rerank 窗口未重启 cron）。

## ⭐ 上一版本速览（v17.33.0 — 2026-07-03）

**P1-T1 AI 评分股票池（Universe Filter）**：`Stock.aiEnabled`(默认 true)+`excludeReason`(原因代码) 建立可维护股票池。
- **中枢过滤**：`compute-scores.ts` 仅处理 `aiEnabled=true`，并清理被排除股票残留 StockScore；下游 rerank/gpt/ai-scores/sync-news/strategy-recs/portfolio/backtest 读 StockScore 自动继承，零改动。
- **后台**：`POST /api/admin/stocks/[symbol]/ai-universe`（disable 时 `$transaction` 内删 StockScore 即时生效）；`/stocks/[symbol]` 顶部控制卡【加入/移出 AI 评分】+ 原因下拉。
- **列表**：`/stocks` 池筛选（全部/AI评分/已排除，默认 AI评分）；`/api/indicators` 每行带 aiEnabled/excludeReason + 追加已排除行。
- **Health**：新增 Universe Size / Enabled / Excluded 三项 INFO。**Dashboard**：AI 评分池 启用/排除 统计卡。
- **8198.T**（マックスバリュ東海）默认排除，原因 `LOW_GROWTH`（成长性不足）。
- 原因代码：`LOW_LIQUIDITY/LOW_GROWTH/POOR_DATA/ETF/REIT/PREFERRED/DELISTED/MANUAL/OTHER`（存代码，i18n 映射标签，见 `lib/ai-universe.ts`）。

---

## 一、系统概况

| 项目 | 详情 |
|------|------|
| 域名 | https://aitohoshou.com |
| 服务器 | 8.209.247.68（阿里云）|
| SSH | `ssh root@8.209.247.68`，密码：Wen565656 |
| 应用目录（生产）| `/opt/tohoshou/` |
| 本地目录 | `/Users/wenzhiyong/llm-stock/` |
| 本地 DB | PostgreSQL Docker `localhost:15432` / DB: `llm_stock` |
| 生产 DB | PostgreSQL `127.0.0.1:5432` / DB: `llm_stock` / user: tohoshou |
| PM2 进程 | `tohoshou-web`（port 3000）+ `tohoshou-cron` |

---

## 二、部署命令（每次必须完整执行）

### 标准部署（前端/API 改动）
```bash
npm run build
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "pm2 restart tohoshou-web --update-env"
```

### Schema 变更（改了 prisma/schema.prisma）
```bash
npx prisma generate
npm run build
sshpass -p 'Wen565656' scp prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx prisma db push --accept-data-loss && npx prisma generate && pm2 restart tohoshou-web --update-env"
```

### Script/Lib 变更（改了 scripts/ 或 lib/）
```bash
sshpass -p 'Wen565656' rsync -avz scripts/ root@8.209.247.68:/opt/tohoshou/scripts/
sshpass -p 'Wen565656' rsync -avz lib/ root@8.209.247.68:/opt/tohoshou/lib/
```

### ⚠️ .env 规则
- `rsync .next/` **不会** 覆盖 .env（只有 `rsync ./` 整个目录才会）
- 确认：`DATABASE_URL="postgresql://tohoshou:123456@127.0.0.1:5432/llm_stock"`
- 确认：`APP_URL=https://aitohoshou.com`

### 重算 AI 评分
```bash
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts 2>&1 | tail -20"
```

### 快速健康检查
```bash
curl -s "https://aitohoshou.com/api/sync/status" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('realCount:', d['summary']['realCount'], '/', len(d['sources']))
for s in d['sources']: print(f'  {s[\"id\"]}: {s[\"status\"]}')
"
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 'pm2 list'
```

---

## 三、数据库现状（2026-06-22 生产）

| 表 | 条目数 | 状态 |
|----|--------|------|
| Stock | **3,717** | ✅ TSE 全量，中文名 100% 覆盖（核验：2026-06-24）|
| DailyPrice | **7,912,513+** | ✅ 最新 2026-06-23，adjClose 100% 覆盖 |
| Financial | **35,986** | ✅ J-Quants 财报 |
| StockScore | **3,714** | ✅ v8.1 阈值，dividendScore + shortSellingSource 全量（核验：2026-06-24）|
| Disclosure | **4,691+** | ✅ TDnet REAL |
| News | **1,590+** | ✅ Kabutan |
| GlobalMarket | **1** | ✅ 最新 2026-06-23 |
| InstitutionalFlow | **216** | ✅ jquants_investor_types |
| ShortSellingRatio | **2** | ✅ 2026-06-19，38.8%，jpx_real |
| Dividend | **32,315** | ✅ 3,693只，最新2026年 |
| AITheme | **109** | ✅ v8.1：14分类，84只，39核心（CHIP_DESIGN 6只）|
| DailyRecommendation | **1,572+（4日期）** | ✅ 2026-06-24:500(today)，2026-06-23:500✅(已修复，原550)，2026-06-20:500，2026-06-22:72(补填) |
| BacktestResult | **0** | 🟡 WAITING_PRICE：latestPriceDate=2026-06-23，等待7交易日窗口自动填充 |
| BacktestError | **0** | ✅ 正常，无错误 |

---

## 四、数据库 Schema 完整结构

### 核心评分表：StockScore（symbol @id）

```
adaptiveScore      Float?    动态权重归一化分 0-100 ← 主评分字段
technicalScore     Int?      0-30
fundamentalScore   Int?      0-25
moneyFlowScore     Int?      0-20
newsSentimentScore Int?      0-15
globalTrendScore   Int?      0-10
totalScore         Int?      0-100（向后兼容）
stockStyle         String?   VALUE_DEFENSIVE | GROWTH_MOMENTUM | QUALITY_COMPOUNDER
                              | SPECULATIVE_MOMENTUM | CYCLICAL_EXPORTER | DOMESTIC_DEFENSIVE
highRiskFlag       Boolean   @default(false)
percentileRank     Float?    全市场百分位（越低越好，1=前1%）
marketRank         Int?      绝对排名（1=最佳）
recommendationV2   String?   ★STRONG_BUY|BUY|HOLD|WATCH|AVOID（双门槛）
opportunityScore   Float?    综合机会分 0-100
dividendScore      Int?      配当质量分 0-10 (v7.8)
scoreSource        String?   REAL | PARTIAL | FALLBACK
latestClose        Float?    最新收盘价（未复权，仅展示）
latestDate         String?   最新价格日期（YYYY-MM-DD）
[indexes: adaptiveScore DESC, recommendationV2, percentileRank, computedAt DESC]
```

### AITheme（symbol+theme 复合唯一键）

```
(symbol, theme) @@unique[symbol_theme]
supplyChainLayer  String?  UPSTREAM|MIDSTREAM|DOWNSTREAM|INFRASTRUCTURE|APPLICATION
importanceScore   Int      1-10
isCore            Boolean  @default(false)
14主题：CHIP_DESIGN|SEMI_EQUIPMENT|TEST_EQUIPMENT|CHIP_MATERIAL|HBM_PACKAGING|
        SENSOR_PRECISION|SERVER_DC|NETWORK|ROBOT_AUTO|SOFTWARE_CLOUD|
        INTERNET_PLATFORM|MEDICAL_LIFE|SECURITY_VISION|POWER_INFRA
```

### 其他关键表
```
DailyPrice   (symbol, date) @unique — adjClose 用于计算，close 用于展示
Financial    (stockId, fiscalYear, quarter) @unique
Dividend     (symbol, year, quarter) @unique — yieldRate:% / payoutRatio:0-1
ShortSellingRatio (date, market) @unique — source: jpx_real | FALLBACK
GlobalMarket  date @db.Date @unique
InstitutionalFlow (date, investorType, market) @unique [date_investorType_market]
UserAiSettings userId @unique — aiEnabled/mode/strictRealData
```

完整 Schema：`prisma/schema.prisma`

---

## 五、TOHOSHOU AI 评分体系 v8.1（封版）

### 双门槛评级（recommendationV2）
```
STRONG_BUY：adaptiveScore ≥75 AND percentileRank ≤5%
BUY：        adaptiveScore ≥70 AND percentileRank ≤15%
HOLD：       adaptiveScore ≥60
WATCH：      adaptiveScore ≥45
AVOID：      adaptiveScore <45
```

### 评分分布（2026-06-21 生产，3714只）
| 评级 | 数量 |
|------|------|
| STRONG_BUY | 5（Reskill 291A/量化研究/日本M&A/阿特拉埃/Land）|
| BUY | ~30 |
| 市场温度 | COLD ❄️ |

### Cron 调度（Asia/Tokyo）
```
05:30 每日    → fetch-global-market.ts
06:00 每日    → sync-all-prices.ts
07:00 工作日  → fetch-tdnet.ts
07:00/12/18/22 → Kabutan 新闻
07:30 每日    → compute-scores.ts → data-health-guard.ts（自动守卫）
08:30 每日    → daily-ai-pipeline.ts（含 Step 8: update-backtest --all，自动回测填充）
18:30 工作日  → fetch-short-selling-ratio.ts
周五 16:30    → fetch-jquants-investor-types.ts
周一 07:15    → fetch-jquants-investor-types.ts（备份）
22:00 每日    → sync-stock-meta.ts
22:30 每日    → fetch-dividend-history.ts
```

> **回测自动化**：每日 08:30 JST `daily-ai-pipeline` Step 8 固定执行 `update-backtest --all`（10分钟超时），**无需人工干预**。

---

## 六、v8.3 UX 设计规范（已落地，2026-06-21）

> **这是全站 UI 规范，修改任何页面必须遵守**

### 评级色彩系统（`lib/rec-config.ts` 单一真相来源）
```typescript
// 所有页面/组件 import from "@/lib/rec-config"，禁止本地定义 REC_CFG
STRONG_BUY: emerald-600 / bg-emerald-50 / border-emerald-200
BUY:        blue-600    / bg-blue-50    / border-blue-200
HOLD:       slate-500   / bg-slate-100  / border-slate-200
WATCH:      amber-500   / bg-amber-50   / border-amber-200
AVOID:      red-500     / bg-red-50     / border-red-200

// 核心工具函数
getRec(key)                    // 返回 { label, bg, text, border, solid, color, glow }
returnColorClass(val)          // val>=0 → text-emerald-600, val<0 → text-red-500
fmtPct(val, decimals=2)        // "+25.32%" / "-25.32%"
fmtJpy(val)                    // "¥1,234,567"
```

### 排版规范
```
h1 页面标题：     text-[32px] font-bold leading-tight
股票名称：         text-[15px] font-bold
当前股价：         text-[36px] font-extrabold tabular-nums
卡片数字：         text-2xl font-bold tabular-nums
评级 Badge：       text-[11px] font-semibold
描述文字：         text-xs font-medium text-slate-500
```

### 布局规范
```
卡片圆角：         rounded-2xl（全站统一，禁止 rounded-xl / rounded-lg 用于卡片）
卡片内边距：       p-4
卡片间距：         gap-4
卡片阴影：         shadow-sm
Tab 容器：         bg-slate-100 rounded-xl p-1（内部 rounded-lg）
```

### 颜色规范
```
涨跌色：           国际惯例 green=涨 red=跌（禁止日本惯例 red=涨 blue=跌）
涨跌格式：         "+25.32%" / "-25.32%"（含符号，2位小数，禁止 ▲▼）
```

### 英文标签（已统一）
```
评级：       STRONG BUY / BUY / HOLD / WATCH / AVOID
52周高低：   52W High / 52W Low
指标列名：   Tech / Fund / Flow / News / Global
评分列名：   Adaptive / Percentile / Opportunity
MA趋势：     Bullish / Strong / Neutral / Weak / Bearish
```

---

## 七、已完成功能（完整历史）

### v10.1.1 — Backtest 完全自动化封版（2026-06-22，commit def9fc0）✅
- [x] `BacktestError` 模型：NO_DAILY_PRICE / NO_ENTRY_PRICE / NO_EXIT_PRICE 错误追踪
- [x] `scripts/update-backtest.ts` v10.1.1：错误追踪 + batch createMany + FORCE 清除旧错误
- [x] `scripts/daily-ai-pipeline.ts` Step 8：固定 `--all`，超时 10min，每日自动填充
- [x] `GET /api/backtest/health`：fillRate7d/30d/90d + status(HEALTHY/WAITING_PRICE/PARTIAL/FAILED) + recentErrors
- [x] `/sync` Backtest 健康卡片：状态badge(🟢/🟡/🔴) + fill rates + 最新价格日
- **当前状态**：WAITING_PRICE（latestPriceDate=2026-06-19，等待 2026-06-23 周一开盘后价格同步，下次 pipeline 自动填充）

### v10.1 — Backtest 真实交易日入场/出场+组合+基准（2026-06-22，commit 9e2bbb5）✅
- [x] Entry = 次交易日开盘价（无未来函数），Exit = 严格第N交易日 adjClose??close
- [x] TOP5/TOP10/TOP20/ALL 等权组合统计
- [x] Nikkei225/TOPIX 同期基准对比，alpha 超额收益
- [x] `GET /api/backtest/summary` 新结构：portfolios 嵌套 + benchmark 字段
- [x] `/backtest` 页面：组合对比表 + benchmark 列
- [x] 修复：Prisma 7 生产 DB 列名为 camelCase，raw SQL 需引用带引号的列名

### v10.0 — Backtest MVP + finalScore 70/30 公式（2026-06-21）✅
- [x] `DailyRecommendation` 模型：每日保存 Top500 快照
- [x] `BacktestResult` 模型：per cohort × horizon 聚合统计
- [x] `scripts/update-backtest.ts`：price7d/30d/90d 填充 + 聚合
- [x] `GET /api/backtest/summary` + `/backtest` 页面（三语言）
- [x] `finalScore = adaptiveScore×0.7 + gptScore×0.3`

### v8.3 — 全局 UX 统一（2026-06-21，commit 61ebe8d）
- [x] `lib/rec-config.ts` — 新建，评级色彩/工具函数单一真相来源
- [x] `components/RecommendationBadge.tsx` — 使用 getRec()，英文标签
- [x] `components/StockMobileCard.tsx` — green/red，rounded-2xl，英文标签
- [x] `app/page.tsx` — 英文表头，无 emoji 排名，emerald BUY 卡片
- [x] `app/ai-picks/page.tsx` — 移除本地 REC_CFG，getRec()
- [x] `app/screener/page.tsx` — 英文分布 chips，英文列标题
- [x] `app/stocks/page.tsx` — green=up，英文表头，rounded-2xl
- [x] `app/stocks/[symbol]/page.tsx` — 股价 36px，"52W High/Low"，getRec()，所有色修正
- [x] `app/sync/page.tsx` — Data Health 卡片大字体 CRITICAL/WARNING/PASS
- [x] `app/ai-theme/page.tsx` — getRec()，ReturnBadge green/red，rounded-2xl
- [x] `app/ai-theme/[theme]/page.tsx` — 同上

### v8.2.4 — Data Health Guard（2026-06-21，commit b1faeb3）
- [x] `scripts/data-health-guard.ts` — 20项检查，CRITICAL→exit 1
- [x] `app/api/health/status/route.ts` — 健康报告 API
- [x] `scripts/cron-scheduler.ts` — 07:30 compute-scores 后自动触发

### v8.2.3 — Global Data Integrity Audit（9/9 全部通过）
- [x] `scripts/audit-data-integrity.ts` — 只读审计脚本
- [x] 结论：adjClose 100% 覆盖，split contamination=0，STRONG_BUY 合规 5/5

### v8.2.2 — adjClose 价格修复（432只拆股污染→0）
- [x] `lib/indicators.ts` — effectiveClose()，adjClose 优先
- [x] `scripts/compute-scores.ts` — 全链路传递 adjClose
- [x] 展示用 close，计算用 adjClose??close

### v8.1 — STRONG_BUY 阈值放宽 + CHIP_DESIGN 扩充
- [x] STRONG_BUY ≥75 AND ≤5%（旧：≥78 AND ≤2%）
- [x] BUY percentileRank ≤15%（旧：≤10%）
- [x] CHIP_DESIGN 3只→6只

### v8.0 — AI产业链地图（14分类，供应链可视化）

### v7.9.3 — AI System Control（START/STOP/RESET/STATUS）

### v7.9.2 — GPT Intent Engine（12意图，DB-only 回答）

### v7.8 — 空売り比率 + 配当スコア

### v7.7 — 双门槛评级 + 市场温度

---

## 八、API 路由一览

| 端点 | 说明 |
|------|------|
| `GET /api/sync/status` | 11个数据源综合状态 |
| `POST /api/sync/scores` | 触发 compute-scores |
| `POST /api/sync/global-market` | 触发 fetch-global-market |
| `GET /api/market-stats` | 市场温度 + BUY分布 + TOP列表 |
| `GET /api/ai-scores?mode=top\|opportunity\|high_risk` | AI推荐列表 |
| `GET /api/screener` | 全市场筛选（q=关键字，sort=字段，limit=200）|
| `GET /api/ai-theme` | AI产业链地图（14主题）|
| `GET /api/ai-theme/[theme]` | 单主题产业链详情（byLayer）|
| `GET /api/stocks/[symbol]/ai-score` | 个股AI评分 |
| `GET /api/health/status` | Data Health Guard 最新报告 |
| `GET /api/backtest/summary` | 回测汇总（cohorts + portfolios + winners/losers）|
| `GET /api/backtest/health` | 回测健康状态（fillRate + status + recentErrors）|
| `GET /api/backtest/trend` | 回测历史趋势（多 cohort × horizon 折线数据）|
| `GET /api/admin/verify` | 生产健康检查（8模块，事实来源）|
| `GET /api/admin/deployments` | 部署历史（事实来源）|
| `POST /api/admin/deployments` | 写入部署记录（每次部署必须调用）|
| `GET /api/realtime-market` | 实时行情缓存（watchlist/portfolio 用）|
| `GET /api/watchlist` | 自选股列表（含评分）|

---

## 九、关键文件索引

### 设计规范
```
lib/rec-config.ts           ← ★ v8.3 评级色彩/工具函数单一真相来源（所有页面从此 import）
```

### 核心 Lib
```
lib/ai-score.ts             ← 评分引擎（calcDividendScore）
lib/market-temperature.ts   ← MarketTemperature 计算
lib/app-url.ts              ← stockUrl/screenerUrl/aiThemeUrl（APP_URL 优先）
lib/prisma.ts               ← Prisma singleton（PrismaPg adapter 必须）
lib/rec-config.ts           ← ★ 评级色彩/工具函数单一真相来源（所有页面从此 import）
lib/trading-action.ts       ← 交易动作标签（getTradingActionLabel）
lib/company-name.ts         ← getPrimaryName/getSecondaryName（三语言）
lib/indicators.ts           ← MA/RSI/MACD（effectiveClose = adjClose??close）
lib/openai.ts               ← pins to api.openai.com（防止 OPENAI_BASE_URL 劫持）
```

### 关键脚本
```
scripts/compute-scores.ts           ← 双 Pass 全量评分（每日 07:30 JST）
scripts/data-health-guard.ts        ← 每日 20项健康守卫（v8.2.4）
scripts/audit-data-integrity.ts     ← 只读全量审计（v8.2.3）
scripts/seed-ai-themes.ts           ← AI产业链 109条数据
scripts/cron-scheduler.ts           ← 全部 cron 定时任务
```

---

## 十、已安装依赖（完整）

### 生产依赖
```
next: 16.2.9                ← App Router；Route Params 必须 await params
react: 19.2.4
react-dom: 19.2.4
@prisma/client: ^7.8.0      ← 必须用 PrismaPg adapter
@prisma/adapter-pg: ^7.8.0
prisma: ^7.8.0
pg: ^8.22.0
yahoo-finance2: ^3.15.3     ← v3：必须 new YahooFinance()；VIX 用 yf.quote()
openai: ^6.44.0
node-cron: ^4.4.1
node-html-parser: ^7.1.0    ← Kabutan/TDnet 爬虫
axios: ^1.18.0
dayjs: ^1.11.21
zod: ^4.4.3
xlsx: ^0.18.5
```

### 开发依赖
```
tailwindcss: ^4             ← @import "tailwindcss"，无 tailwind.config.js
@tailwindcss/postcss: ^4
typescript: ^5
eslint: ^9 + eslint-config-next: 16.2.9
@types/node: ^20 / @types/react: ^19 / @types/react-dom: ^19
@types/node-cron: ^3.0.11 / @types/pg: ^8.20.0
```

### 生产服务器系统包
```
poppler-utils   # pdftotext，用于解析 JPX 空売り比率 PDF
# 验证：which pdftotext → /usr/bin/pdftotext
```

### npm scripts 完整列表
```bash
npm run dev                         # 开发服务器（port 3000）
npm run build                       # 生产构建
npx tsc --noEmit                    # 类型检查
npm run compute-scores              # 全量重算 AI 评分
npm run fetch-global-market         # Yahoo Finance → GlobalMarket
npm run fetch-short-selling         # JPX PDF → ShortSellingRatio
npm run fetch-dividend-history      # J-Quants → Dividend
npm run fetch-institutional-flow    # J-Quants → InstitutionalFlow
npm run sync-meta                   # 同步股票元数据
npm run sync-prices-recent          # 同步最近价格
npm run seed:ai-themes              # 重置 AITheme（109条）
npm run health:data                 # 运行数据健康守卫（20项检查）
npm run audit:data                  # 运行全量数据完整性审计
npm run update-backtest             # 填充未填充的 backtest cohorts（普通模式）
npm run update-backtest:force       # 强制重填所有 cohorts（--all）— pipeline 每日自动执行此命令
npm run cron                        # 启动 cron 调度器
```

---

## 十一、关键代码规则（新 Claude 必读）

### Prisma 初始化（必须用 adapter）
```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
// scripts/ 中直接实例化；API routes 用 lib/prisma.ts singleton
```

### Next.js 16 Route Params（必须 await）
```typescript
// 服务端 API Route：
export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
}
// 客户端组件（"use client"）：
import { useParams } from "next/navigation";
const params = useParams();
```

### scripts/ 路径规则
```typescript
import { prisma } from "../lib/prisma";   // ✅ 相对路径
import { prisma } from "@/lib/prisma";    // ❌ scripts 不支持 @/ 别名
```

### UX 规则（v8.3 封版）
```typescript
// 禁止在任何页面本地定义 REC_CFG，必须从 lib/rec-config.ts 导入
import { getRec, returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";
// 禁止 text-[#e74c3c] / text-[#2980b9]（旧日本惯例色），禁止 ▲▼ 符号
// 禁止 rounded-xl 用于卡片（统一 rounded-2xl）
```

### 价格字段规则（v8.2.2）
```
展示用：close（未复权原始价格）
计算用：adjClose ?? close（复权优先）
DailyPrice 查询必须 orderBy: { date: "desc" }, take: 300（与 compute-scores 一致）
```

### 日期处理
```typescript
const date = new Date(Date.UTC(year, month - 1, day)); // ✅ 避免 CST 时区偏移
```

---

## 十二、已知问题（核验：2026-06-24）

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P2 | GPT nullRank=283 | 283只股票 gptRank=null，需在生产运行 `npm run rerank:top500`；不阻断推荐（WARNING 非 CRITICAL）|
| ✅ ~~P2~~ | ~~DailyRecommendation 2026-06-23 = 550条~~ | **已修复 2026-06-24**：删除50条重复低分记录，count=500，gptRank 1-500 唯一，Deployment id=7 |
| P3 | Portfolio 页面功能未实现 | schema 存在，页面基本为空 |
| P3 | ShortSellingRatio 时区 bug | 2026-06-18 数据行冗余（无运行时影响）|
| P3 | 本地 DB schema drift | dividendScore、ShortSellingRatio.market 列本地未迁移，不影响生产 |


---

<a name="next-session"></a>
## NEXT SESSION — 下次启动继续位置

### 当前状态（2026-06-24 生产核验，事实来源：/api/admin/verify + psql）

| 项目 | 值 | 来源 |
|------|---|------|
| 生产 commit | `3a3ed1f`（docs）/ `73d253e`（功能） | git log |
| Production Ready | ✅ true | /api/admin/verify |
| CRITICAL | 0 | /api/admin/verify |
| WARNING | 4（非阻断） | /api/admin/verify |
| DailyRec today (JST) | 500（2026-06-24）| /api/admin/verify |
| GPT nullRank | 283（P2 WARNING）| /api/admin/verify + DB |
| Backtest status | WAITING_PRICE | /api/backtest/health |
| latestPriceDate | 2026-06-23 | /api/backtest/health |
| 最新部署 | id:6，`73d253e`，2026-06-23 16:08 JST | /api/admin/deployments |
| 异常数据 | ~~2026-06-23 DailyRec=550~~ → **已修复，=500** | psql |

### 即将到来的自动事件
```
每日 06:00 JST → sync-all-prices（同步价格）
每日 07:30 JST → compute-scores → data-health-guard
每日 08:30 JST → daily-ai-pipeline（Step 8: update-backtest --all）
                 → 当 2026-06-24+7交易日价格可用时，backtest 开始填充
```

### 需要排查的问题（P2）
1. **GPT nullRank=283**：在生产运行 `npx tsx scripts/rerank-top500.ts` 补全排名
2. ~~**DailyRecommendation 2026-06-23=550**~~ → **已修复 2026-06-24**（DELETE 50条重复低分记录，Deployment id=7）

### 生产快速核验命令
```bash
# 生产健康（事实来源）
curl -s https://aitohoshou.com/api/admin/verify | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('ready:', d['ready'], '| blockingIssues:', len(d['blockingIssues']), '| warnings:', len(d['warnings']))
"

# 回测状态
curl -s https://aitohoshou.com/api/backtest/health

# 最新部署
curl -s https://aitohoshou.com/api/admin/deployments | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('total:', d['total'], '| latest:', d['rows'][0]['commitHash'], d['rows'][0]['summary'][:50])
"

# DailyRec 分布（生产 DB）
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "PGPASSWORD=123456 psql -h 127.0.0.1 -U tohoshou -d llm_stock -c \
  'SELECT date::date, COUNT(*) FROM daily_recommendations GROUP BY date ORDER BY date DESC LIMIT 5;'"
```

### 下次可优先考虑的任务

#### 选项 A（P2 修复）：GPT rerank
- 生产运行 `rerank:top500` 补全 283 个 nullRank（DailyRec 550 异常已于 2026-06-24 修复）

#### 选项 B：v10.2 — Backtest 展示扩展
- `/backtest` 多 cohort 历史趋势图（`/api/backtest/trend` 已就绪）
- 扩展至多日期 cohort 对比（当前 UI 只显示最新一个）

#### 选项 C：Portfolio 实际功能
- `/portfolio` 持仓功能（schema 存在，页面基本为空）
