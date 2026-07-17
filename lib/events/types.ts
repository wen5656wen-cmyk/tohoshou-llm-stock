/**
 * lib/events/types.ts — EventType 枚举（P12-DATA-01 · v1）
 * ────────────────────────────────────────────────────────────────────────────
 * 依据 docs/P11-Architecture-Baseline.md（🔒 FROZEN）：
 *   · ADR-001：EventType 独立于 Sentiment，是 f(title, category) 的**纯函数**，
 *     不落库、不加列 → git revert 即回滚。
 *   · EventType 只回答「客观上发生了什么」，**不表达利好/利空**。
 *     枚举中不得出现 POSITIVE / NEGATIVE，也不得携带 direction ——
 *     方向属于 Score 层（P12-SCORE-01），本层不得越界。
 *
 * 为什么必须细分（P11-ARCH-02 生产实测，非推断）：
 *   · TDnet category `BUYBACK`（457 条）里混着 5 种方向完全相反的事件：
 *     取得の決定 36 / 取得状況（法定月报）330 / 取得終了 48 / 消却 6 / 処分 1。
 *     把它们当成同一件事，就是 Shadow 证伪的「BUYBACK=POSITIVE」误报之源。
 *   · TDnet category `EQUITY`（322 条）里，员工期权与第三者割当融资混杂。
 *     两者对股东的含义相反，必须拆开。
 *
 * 【本层的硬边界】Disclosure 无正文 → 只有 title + category 可用。
 * 因此「强度（magnitude）」不可得；无法可靠判定时一律 UNKNOWN，不猜。
 */

/** v1 分类器版本号。分类规则任何语义变更都必须递增，Shadow 报告会打印它。 */
export const EVENT_TYPE_VERSION = "v1" as const;

export const EVENT_TYPES = [
  // ── 业绩 ──
  "EARNINGS",                 // 決算短信 / 四半期報告（标题不含方向信息）
  "GUIDANCE_UP",              // 業績予想の上方修正
  "GUIDANCE_DOWN",            // 業績予想の下方修正
  "GUIDANCE_REVISION",        // 業績予想修正（方向未在标题中言明）

  // ── 分红 ──
  "DIVIDEND",                 // 配当（未言明增减）
  "DIVIDEND_INCREASE",        // 増配 / 復配 / 特別配当 / 記念配当
  "DIVIDEND_DECREASE",        // 減配 / 無配

  // ── 自己株式（必须五分，见文件头）──
  "BUYBACK_ANNOUNCEMENT",     // 取得に係る事項の決定 / 取締役会決議 —— 新授权
  "BUYBACK_PROGRESS",         // 取得状況 —— 法定月度进度报告，例行
  "BUYBACK_COMPLETED",        // 取得終了 / 取得完了
  "BUYBACK_CANCELLATION",     // 自己株式の消却
  "BUYBACK_DISPOSAL",         // 自己株式の処分（再出售）

  // ── 股本 ──
  "EQUITY_FINANCING",         // 第三者割当 / 公募増資 / 転換社債 / MSワラント —— 真融资
  "EQUITY_STOCK_OPTION",      // ストック・オプション / 株式報酬 —— 员工激励，非融资
  "STOCK_SPLIT",              // 株式分割 / 併合

  // ── 结构 ──
  "M_AND_A",                  // 合併 / 買収 / TOB / 公開買付
  "MAJOR_SHAREHOLDER_CHANGE", // 主要株主 / 大株主の異動
  "MANAGEMENT_CHANGE",        // 代表取締役 / 役員の異動
  "BUSINESS_ALLIANCE",        // 業務提携 / 資本提携
  "SUBSIDIARY_CHANGE",        // 子会社の設立/取得/異動（含「子会社への増資」= 对外投资）

  // ── 其他 ──
  "GOVERNANCE",               // ガバナンス / 内部統制 / 定款変更
  "LEGAL_RISK",               // 訴訟 / 課徴金 / 不正 / 上場廃止 / リコール
  "OPERATIONAL_UPDATE",       // 月次 / 受注 / 新製品 等经营动态
  "OTHER",                    // 可识别为真实事件，但在本 taxonomy 之外
  "UNKNOWN",                  // 无法可靠分类 —— 诚实兜底，不猜
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** 分类方法。confidence 由 method + 命中特异性决定，不是模型概率。 */
export type EventMethod =
  | "COMBINED_RULE"   // 标题规则命中，且 TDnet category 佐证一致
  | "TITLE_RULE"      // 仅标题确定性规则命中
  | "CATEGORY_RULE"   // 仅 category 可用（只能定粗类，不得直接等同 EventType）
  | "FALLBACK";       // 无规则命中 → OTHER / UNKNOWN

/**
 * confidence 是**离散的规则档位**，不是概率，不得当作模型置信度解读。
 * 档位含义固定，便于审计与阈值筛选。
 */
export const EVENT_CONFIDENCE = {
  COMBINED: 95, // 标题特异规则 + category 佐证
  TITLE: 85,    // 标题特异规则单独命中
  CATEGORY: 50, // 仅 category → 只能判定「是某类披露」，子类未知
  FALLBACK: 0,  // 未命中任何规则
} as const;

export type EventClassification = {
  eventType: EventType;
  confidence: number;   // 见 EVENT_CONFIDENCE，离散档位
  method: EventMethod;
  evidence: string[];   // 命中的判据，可回溯（ADR-001「事实可审计」）
  version: string;      // EVENT_TYPE_VERSION
};

export type EventClassifierInput = {
  title: string;
  category?: string | null;  // TDnet DisclosureCategory 或 News.category，仅作佐证
  source?: string | null;
  summary?: string | null;   // 生产库中 Disclosure.summary 基本为空，保留入参不代表可用
};

/** UI/报告用的中文标签。仅描述事实，禁止出现「利好/利空/看多/看空」。 */
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  EARNINGS: "财报披露",
  GUIDANCE_UP: "业绩预想上修",
  GUIDANCE_DOWN: "业绩预想下修",
  GUIDANCE_REVISION: "业绩预想修正",
  DIVIDEND: "分红披露",
  DIVIDEND_INCREASE: "增配/复配",
  DIVIDEND_DECREASE: "减配/无配",
  BUYBACK_ANNOUNCEMENT: "新回购决议",
  BUYBACK_PROGRESS: "回购进度月报（例行）",
  BUYBACK_COMPLETED: "回购结束",
  BUYBACK_CANCELLATION: "自己股份注销",
  BUYBACK_DISPOSAL: "自己股份处分",
  EQUITY_FINANCING: "股权融资",
  EQUITY_STOCK_OPTION: "员工期权（非融资）",
  STOCK_SPLIT: "股票分割/合并",
  M_AND_A: "并购/要约收购",
  MAJOR_SHAREHOLDER_CHANGE: "主要股东变动",
  MANAGEMENT_CHANGE: "高管变动",
  BUSINESS_ALLIANCE: "业务/资本提携",
  SUBSIDIARY_CHANGE: "子公司变动",
  GOVERNANCE: "公司治理",
  LEGAL_RISK: "法律/合规风险",
  OPERATIONAL_UPDATE: "经营动态",
  OTHER: "其他披露",
  UNKNOWN: "未能识别",
};
