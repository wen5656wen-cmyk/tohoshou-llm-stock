# P8-00 · TOHOSHOU AI Future Roadmap

> 只做规划，不改代码 / 不部署 / 不新增页面。日期 2026-07-16。P7 架构冻结后 P8 正式起点。
> 所有能力均按 P7 治理规范落到既有 **Workspace → Hub → Tab**，不新增一级导航/Hub/Workspace。
> 复杂度：S(1-2d) / M(3-5d) / L(1-2w) / XL(3w+)。ROI：对老板决策价值。

---

## 0. 核心判断（先看这里）

盘点 20 项能力对现有基础的真实映射后，结论是：

> **多数能力已有 P1–P7 的数据/引擎基础，真正缺的是三件事：**
> **① 最后一公里交付**（Closing Decision 的 summary/止盈止损/组合已算好，但没有主动送达——LINE 已移除、WeCom 未接、pushText 仅落库待 webhook）
> **② 部分数据源薄弱**（JPX 资金流常 synthetic 兜底、Financial 无 per-date 序列、机构 per-symbol 缺口）
> **③ 组合/风险引擎偏简单**（Portfolio Builder 是 closingScore 加权，非真优化；无组合级风险预算）

因此 P8 的最高 ROI 不是造新引擎，而是**把已算好的东西送到老板面前并系统化**。

---

## 一、20 项能力逐项评估

| # | 能力 | 为什么需要/价值 | 已有基础 | 复杂度 | 阶段 |
|---|---|---|---|---|---|
| ⑧ | **AI 买卖理由** | 老板要"为什么买这只"，建立信任 | ✅ **强**：`lib/explain` 引擎 + Closing Decision reason + GPT rerank thesis | S | **P8** |
| ⑩ | **AI 市场状态识别** | 决定今天激进/防守 | ✅ **强**：`MarketRegime` 表+引擎(BULL/SIDEWAYS/BEAR) 已生产 | S | **P8** |
| ⑦ | **AI 仓位建议** | 老板要"每只买多少" | ✅ **中**：Closing Decision `portfolio-builder` 已算 15-40% 权重 | M | **P8** |
| ③ | **AI 止盈止损** | 落袋/止损纪律 | ✅ **中**：Closing first pick 已有 target1/2 + stopLoss；策略有 exit | M | **P8** |
| ⑨ | **AI 风险预警** | 追高/利空/高波动提前警示 | ✅ **中**：highRiskFlag + news risk + gate；缺聚合预警面 | M | **P8** |
| ⑲ | **AI 投资日报** | 每天一屏"今天怎么做" | ✅ **中**：Closing summary + 关注池；缺日报聚合与送达 | M | **P8** |
| ⑳ | **AI 投资总结自动生成** | 免人工写总结 | ✅ **中**：Closing `summary`/`pushText` 已 GPT 生成落库 | M | **P8** |
| ⑰ | **AI 每周复盘** | 周度反思 | ✅ **强**：`generate-weekly-report` 已有 | S | **P8** |
| ⑱ | **AI 每月复盘** | 月度反思 | ✅ **强**：`generate-monthly-report` 已有 | S | **P8** |
| ⑥ | **AI 组合优化** | 从"加权"升级到"真优化"(风险/相关性) | ⚠️ **弱**：Portfolio Builder 仅 closingScore 加权+行业≤2 | L | **P9** |
| ④ | **AI 风险预算** | 组合级风险上限分配 | ⚠️ **弱**：有 per-股 risk-adjustment(V3)，无组合级预算 | L | **P9** |
| ② | **AI 仓位管理** | 动态加减仓管理 | ✅ **中**：Paper Broker 持仓；缺动态管理(触资金链) | L | **P9** |
| ⑤ | **AI 行业轮动** | 抓行业切换 | ⚠️ **弱**：有 sectors + regime，无轮动信号 | M/L | **P9** |
| ⑪ | **AI 事件驱动** | 财报/回购/增发驱动交易 | ⚠️ **中**：TDnet Disclosure + catalystScore；event 因子 pending 无回测 | L | **P9** |
| ⑯ | **AI 模型自动学习** | 因子自动晋升闭环 | ✅ **中**：Feature Promotion + strategy-learning；缺自动晋升闭环(触评分) | L | **P9** |
| ⑬ | **AI 新闻分析** | 从情绪分升级到 LLM 理解 | ✅ **中**：News sentiment + Kabutan/TDnet；LLM 理解未接(类 Document Center P2-04 deferred) | M/L | **P9** |
| ① | **AI 自动调仓** | 组合自动再平衡 | ⚠️ **中**：Paper Broker 镜像策略；无自动 rebalance 引擎(触资金链) | L/XL | **P9→P10** |
| ⑫ | **AI 财报分析** | 深度基本面 | ⚠️ **弱**：fundamentalScore 有；Financial 无 per-date 序列、无现金流字段 | XL | **P10** |
| ⑭ | **AI 资金流分析** | 主力资金动向 | ⚠️ **弱**：InstitutionalFlow 常 synthetic 兜底(JPX 生产常不可达) | L | **P10** |
| ⑮ | **AI 机构行为分析** | 外资/投信行为 | ⚠️ **弱**：inst 因子 pending(市场级无 per-symbol) | L/XL | **P10** |

---

## 二、Roadmap

### 🟢 P8（近期 · 0–3 月）— 交付最后一公里（低风险高 ROI，不碰冻结区）

**主题：把已算好的东西送到老板面前 + 系统化纪律。全部落决策中心/股票中心已有 Hub。**

| 能力 | 落点(Hub/Tab) | 说明 | 复杂度 |
|---|---|---|---|
| P8-1 AI 买卖理由强化 | 股票中心·个股详情 / 决策中心 | Explain 引擎全站 surface，每条推荐一句话理由 | S |
| P8-2 市场状态 surface | 决策中心·今日总览 | regime + 风险等级醒目化 | S |
| P8-3 仓位建议 + 止盈止损 | 决策中心·收盘决策/新 Tab | Portfolio Builder 权重 + target/stop 系统化展示与跟踪 | M |
| P8-4 风险预警聚合 | 决策中心·今日总览 | highRiskFlag+利空+高波动 聚合成"今日风险提示" | M |
| P8-5 AI 投资日报 | 决策中心·今日总览(=老板首页) | Closing summary + 关注池 + 风险 一屏日报 | M |
| P8-6 投资总结自动生成 | 决策中心 | 复用 pushText/summary，GPT 一段话总结 | M |
| P8-7 周/月复盘 surface | 研究 Hub·学习 / 决策中心 | 复用现有周月报脚本，展示层接入 | S |
| **P8-0 交付通道（关键使能）** | 跨模块 | pushText 落库→接一个送达通道(Web 通知/邮件/webhook)，让日报/预警/总结真正送达 | M/L |

> **P8 核心：几乎零新算法、零碰资金链/评分，纯展示层 + 一个交付通道。ROI 最高。**

### 🟡 P9（中期 · 3–9 月）— 强化引擎（部分触 Paper/评分，须评审）

| 能力 | 落点 | 说明 | 复杂度 |
|---|---|---|---|
| P9-1 AI 组合优化 | 研究 Hub / 决策中心 | Portfolio Builder 升级：相关性/风险约束的真优化 | L |
| P9-2 AI 风险预算 | 决策中心 / 研究 Hub | 组合级波动率/回撤预算分配 | L |
| P9-3 AI 行业轮动 | 股票中心·行业 / 研究 | sector+regime → 轮动强弱信号 | M/L |
| P9-4 AI 事件驱动 | 研究 Hub·因子 | TDnet event-study 回测接入，pending 事件因子转可评估 | L |
| P9-5 AI 新闻分析(LLM) | 股票中心·新闻 | LLM 新闻理解(复用 OCR/AI 经验)，非仅情绪分 | M/L |
| P9-6 AI 仓位管理 | 交易·持仓(Paper) | 动态加减仓(**触资金链→/review payment**) | L |
| P9-7 AI 模型自动学习闭环 | 研究 Hub | Feature Promotion→自动晋升(**触评分→严格评审**) | L |
| P9-8 AI 自动调仓(Paper) | 交易·持仓 | Paper 自动再平衡(**触资金链→/review payment**) | L/XL |

### 🔴 P10（长期 · 9–18 月）— 数据源攻坚 / 高风险（先补数据地基）

| 能力 | 落点 | 说明 | 复杂度 |
|---|---|---|---|
| P10-1 AI 财报分析 | 研究 Hub | 先补 Financial per-date 序列 + 现金流字段，再深度基本面 LLM | XL |
| P10-2 AI 资金流分析 | 研究 Hub | 先解决 JPX 数据可达性(换源/代理)，去 synthetic 兜底 | L |
| P10-3 AI 机构行为分析 | 研究 Hub | 先获 per-symbol 机构数据，再行为建模 | L/XL |
| P10-4 真实自动交易 | (架构评审) | 真钱自动化：监管/风控/审计，超出当前范围，谨慎 | XL+ |

---

## 三、未来一年最值得开发 TOP20

优先级 = P8-x 最高；ROI/难度/依赖基于真实模块。

| 排名 | 功能 | 优先级 | ROI | 难度 | 依赖已有模块 |
|---|---|---|---|---|---|
| 1 | 交付通道(日报/预警送达) | P8-0 | ★★★★★ | M/L | pushText 落库(已有) |
| 2 | AI 投资日报 | P8-5 | ★★★★★ | M | Closing Decision |
| 3 | 买卖理由强化 | P8-1 | ★★★★★ | S | Explain 引擎 |
| 4 | 仓位建议+止盈止损系统化 | P8-3 | ★★★★★ | M | Portfolio Builder |
| 5 | 风险预警聚合 | P8-4 | ★★★★☆ | M | highRiskFlag/news |
| 6 | 投资总结自动生成 | P8-6 | ★★★★☆ | M | pushText/summary |
| 7 | 市场状态 surface | P8-2 | ★★★★☆ | S | MarketRegime |
| 8 | 周/月复盘 surface | P8-7 | ★★★☆☆ | S | 周月报脚本 |
| 9 | AI 组合优化 | P9-1 | ★★★★☆ | L | Portfolio Builder |
| 10 | AI 风险预算 | P9-2 | ★★★★☆ | L | risk-adjustment(V3) |
| 11 | AI 行业轮动 | P9-3 | ★★★★☆ | M/L | sectors+regime |
| 12 | AI 事件驱动 | P9-4 | ★★★★☆ | L | TDnet/catalyst |
| 13 | AI 新闻分析(LLM) | P9-5 | ★★★☆☆ | M/L | News sentiment |
| 14 | AI 仓位管理(Paper) | P9-6 | ★★★★☆ | L | Paper Broker⚠️资金链 |
| 15 | AI 模型自动学习闭环 | P9-7 | ★★★☆☆ | L | Feature Promotion⚠️评分 |
| 16 | AI 自动调仓(Paper) | P9-8 | ★★★★☆ | L/XL | Paper Broker⚠️资金链 |
| 17 | Scoring V3 去留收尾 | P8/P9 | ★★★☆☆ | M | P7-01 裁决(条件性升级) |
| 18 | AI 资金流分析 | P10-2 | ★★★☆☆ | L | InstitutionalFlow⚠️数据源 |
| 19 | AI 财报分析 | P10-1 | ★★★☆☆ | XL | Financial⚠️数据缺口 |
| 20 | AI 机构行为分析 | P10-3 | ★★☆☆☆ | L/XL | inst 因子⚠️数据缺口 |

**⚠️ 标记 = 触冻结区(资金链/评分)须 /review payment，或有数据源前置攻坚。**

---

## 四、给老板的一句话建议

> **P8 先做「TOP1–8」——几乎全是复用现有引擎的展示层 + 一个交付通道，零碰评分/资金链，1–3 个月就能让老板每天收到「今日日报 + 买卖理由 + 止盈止损 + 风险预警 + 投资总结」。这是投入产出比最高的一段。**
> P9 再动组合优化/风险预算/事件驱动等真引擎（部分触 Paper 须评审）。P10 攻财报/资金流/机构三大数据缺口。**真钱自动交易属最长期、最谨慎项，需专门监管/风控评审。**

---

## Architecture Check（本任务）
- **Workspace / Hub / Tab**：— （纯规划文档，未触任何页面）
- 是否新增一级导航：**NO** ｜ 是否新增 Hub：**NO** ｜ 是否新增 Workspace：**NO** ｜ 是否影响 P7 Freeze：**NO**
- 路线图内所有能力均规划落入既有 4 Hub 的 Tab，符合 P7 治理规范。
