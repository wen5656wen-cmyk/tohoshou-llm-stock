/**
 * lib/events/classify.ts — EventType 分类器（P12-DATA-01 · v1 · SSOT）
 * ────────────────────────────────────────────────────────────────────────────
 * classifyEventType(input) → { eventType, confidence, method, evidence, version }
 *
 * 契约（docs/P11-Architecture-Baseline.md · ADR-001 / ADR-003）：
 *   1. **纯函数**：无 IO、无 DB、无网络、无 LLM、无随机、无时钟。可单测。
 *   2. **只答「发生了什么」**：不产出 direction / sentiment，不得被用于推导 sentiment。
 *   3. **确定性规则优先**：标题特异规则 > category 佐证 > 兜底。
 *   4. **category 只作辅助证据**，不得直接等同于最终 EventType（否则就是
 *      P11 已证伪的「category = 结论」老路）。
 *   5. **不可靠即 UNKNOWN**，绝不猜。Disclosure 无正文 → 强度信息本就不可得。
 *
 * ⚠️ 规则顺序即语义，改动顺序等同改动分类结果，必须同步 EVENT_TYPE_VERSION。
 */

import {
  EVENT_CONFIDENCE,
  EVENT_TYPE_VERSION,
  type EventClassification,
  type EventClassifierInput,
  type EventMethod,
  type EventType,
} from "./types";

/** 全角空格/空白归一化。TDnet 标题常含全角空格，不归一化会导致规则漏匹配。 */
function normalize(title: string): string {
  return (title ?? "").replace(/[\s　]/g, "");
}

type Rule = {
  type: EventType;
  re: RegExp;
  /** 与之一致时升级为 COMBINED_RULE（category 仅作佐证，不单独定案） */
  corroborates?: string[];
};

/**
 * 有序规则表 —— **顺序即优先级，自上而下首个命中即返回**。
 *
 * 排序原则：
 *   · 高特异性 / 高风险在前（LEGAL_RISK 早于一般经营动态）；
 *   · 自己株式五分：消却 → 処分 → 取得終了 → 取得状況 → 取得決定。
 *     「取得状況及び取得終了」同时含两词，故 COMPLETED 必须早于 PROGRESS；
 *     「取得状況…（定款の定めに基づく取得）」含「取得」故 PROGRESS 必须早于 ANNOUNCEMENT。
 *   · EQUITY：ストック・オプション（员工激励）早于融资规则，因为
 *     「募集新株予約権(有償ストック・オプション)」同时含「募集」；
 *     而「第三者割当による新株予約権」（MSワラント）无 SO 字样 → 落入融资，这是对的。
 *     ⚠️ P11-ARCH-02 的临时分桶脚本把 `新株予約権` 判在 `第三者割当` 之前，
 *     将 MSワラント 误计为员工期权 → Baseline F7「EQUITY 仅 13.0% 是真稀释」
 *     可能低估。本文件采用修正后的顺序，Shadow 报告会给出实测重算值。
 */
const RULES: Rule[] = [
  // ── 法律/合规风险（高特异，优先）──
  { type: "LEGAL_RISK", re: /訴訟|課徴金|上場廃止|監理銘柄|特設注意|リコール|破綻|民事再生|会社更生|不適切|不正|虚偽|行政処分|業務停止|仮処分|差止/ },

  // ── 股权激励（**必须早于自己株式块**）──
  // 「譲渡制限付株式報酬としての自己株式処分」是限制性股票薪酬，不是回购再出售。
  // 生产实测：近 7 日含「処分」的披露里绝大多数是这类 RS 薪酬 —— 若顺序放在
  // BUYBACK_DISPOSAL 之后，会被误判为「自己股份处分」（Shadow v1 首跑即暴露此 bug）。
  { type: "EQUITY_STOCK_OPTION", re: /ストック・?オプション|株式報酬|譲渡制限付株式|RS(?:U)?ユニット|従業員持株会/, corroborates: ["EQUITY"] },

  // ── 自己株式（五分 · 顺序不可调换 · 均须「自己株式/自社株」限定词）──
  // ⚠️ 不得写成裸的 /取得.{0,4}完了/：生产实测「大英エレクトロニクス…株式取得（子会社化）完了」
  //    会被吞成 BUYBACK_COMPLETED（Shadow v1 首跑即暴露此 bug）。
  { type: "BUYBACK_CANCELLATION", re: /(?:自己株式|自社株).{0,6}消却|自己株消却/, corroborates: ["BUYBACK"] },
  { type: "BUYBACK_DISPOSAL",     re: /(?:自己株式|自社株).{0,6}処分/, corroborates: ["BUYBACK"] },
  { type: "BUYBACK_COMPLETED",    re: /(?:自己株式|自社株(?:買い)?).{0,14}取得.{0,4}(?:終了|完了)|(?:自己株式|自社株).{0,10}買付.{0,4}終了/, corroborates: ["BUYBACK"] },
  { type: "BUYBACK_PROGRESS",     re: /(?:自己株式|自社株).{0,6}取得(?:の)?状況/, corroborates: ["BUYBACK"] },
  { type: "BUYBACK_ANNOUNCEMENT", re: /(?:自己株式|自社株).{0,6}取得.{0,12}(?:決定|決議)|(?:自己株式|自社株).{0,6}取得に係る事項|自社株買い.{0,6}(?:決定|決議)/, corroborates: ["BUYBACK"] },

  // ── 业绩预想修正（方向在标题中明确，属于「发生了什么」）──
  // corroborates 同时列 TDnet(FORECAST_REVISION) 与 News(GUIDANCE) 两套词表 —— 二者不通用。
  { type: "GUIDANCE_UP",       re: /業績予想.{0,8}上方修正|上方修正|上振れ/, corroborates: ["FORECAST_REVISION", "GUIDANCE"] },
  { type: "GUIDANCE_DOWN",     re: /業績予想.{0,8}下方修正|下方修正|下振れ/, corroborates: ["FORECAST_REVISION", "GUIDANCE"] },
  { type: "GUIDANCE_REVISION", re: /業績予想.{0,4}修正|収益予想.{0,4}修正|配当予想.{0,4}修正/, corroborates: ["FORECAST_REVISION", "GUIDANCE"] },

  // ── 分红 ──
  { type: "DIVIDEND_INCREASE", re: /増配|復配|特別配当|記念配当/, corroborates: ["DIVIDEND"] },
  { type: "DIVIDEND_DECREASE", re: /減配|無配/, corroborates: ["DIVIDEND"] },

  // ── 结构（早于 EQUITY：「子会社への増資」是对外投资，不是自身稀释）──
  { type: "M_AND_A",                  re: /合併|買収|TOB|公開買付|株式交換|株式移転|子会社化|事業譲(?:渡|受)/i },
  { type: "SUBSIDIARY_CHANGE",        re: /子会社|関係会社|持分法適用/ },
  { type: "MAJOR_SHAREHOLDER_CHANGE", re: /主要株主|大株主|筆頭株主|親会社.{0,4}異動/ },
  { type: "MANAGEMENT_CHANGE",        re: /代表取締役.{0,6}異動|役員.{0,4}異動|人事異動|社長.{0,4}交代|取締役.{0,4}選任/ },
  { type: "BUSINESS_ALLIANCE",        re: /業務提携|資本提携|資本業務提携|協業|ライセンス契約/ },

  // ── 股本 ──
  { type: "STOCK_SPLIT",      re: /株式分割|株式併合|投資単位/ },
  { type: "EQUITY_FINANCING", re: /第三者割当|公募増資|募集株式|新株式発行|転換社債|新株予約権付社債|行使価額修正|資金使途|増資/, corroborates: ["EQUITY"] },

  // ── 业绩本体（放在修正之后：「決算短信」与「業績予想の修正」是不同事件）──
  { type: "EARNINGS", re: /決算短信|四半期報告|決算説明|通期.{0,6}結果|業績.{0,4}(?:発表|結果)/, corroborates: ["EARNINGS"] },

  // ── 治理 / 经营动态（低特异，最后）──
  { type: "GOVERNANCE",         re: /コーポレート・?ガバナンス|内部統制|定款.{0,4}一部変更|株主総会|買収防衛/ },
  { type: "OPERATIONAL_UPDATE", re: /月次|受注|新製品|新工場|出店|供給開始|販売開始|開発.{0,4}成功/ },
];

/**
 * 仅 category 可用时的粗类回退。
 * **刻意不映射到具体子类** —— 例如 category=BUYBACK 但标题无任何子类线索时，
 * 我们知道「这是一条自己株式披露」，但**不知道是新决议还是月度进度报告**，
 * 二者含义相反。此时返回 UNKNOWN 才是诚实的（ADR-001 / 要求 4、5）。
 */
const CATEGORY_COARSE: Record<string, EventType> = {
  // TDnet DisclosureCategory
  EARNINGS: "EARNINGS",   // category 本身由「決算短信」标题正则推出，语义等价，可安全落地
  MATERIAL: "OTHER",      // 重大披露，但具体是什么未知
  OTHER: "OTHER",
  // News.category（Kabutan 词表，与 TDnet 不通用 —— 生产实测：IR/MARKET/OTHER/
  // EARNINGS/DIVIDEND/GUIDANCE/BUYBACK）。IR/MARKET 是资讯类，属可识别但在本
  // taxonomy 之外的事件 → OTHER；不映射到任何具体子类。
  IR: "OTHER",
  MARKET: "OTHER",
};

export function classifyEventType(input: EventClassifierInput): EventClassification {
  const raw = input?.title ?? "";
  const title = normalize(raw);
  const category = input?.category ?? null;

  if (!title) {
    return {
      eventType: "UNKNOWN",
      confidence: EVENT_CONFIDENCE.FALLBACK,
      method: "FALLBACK",
      evidence: ["empty_title"],
      version: EVENT_TYPE_VERSION,
    };
  }

  // ① 标题确定性规则（首个命中即定案）
  for (const rule of RULES) {
    const m = title.match(rule.re);
    if (!m) continue;

    const corroborated = !!(category && rule.corroborates?.includes(category));
    const method: EventMethod = corroborated ? "COMBINED_RULE" : "TITLE_RULE";
    const evidence = [`title:/${m[0]}/`];
    if (corroborated) evidence.push(`category:${category}`);

    return {
      eventType: rule.type,
      confidence: corroborated ? EVENT_CONFIDENCE.COMBINED : EVENT_CONFIDENCE.TITLE,
      method,
      evidence,
      version: EVENT_TYPE_VERSION,
    };
  }

  // ② 标题无线索 → category 只能定粗类，且绝不映射到具体子类
  if (category && CATEGORY_COARSE[category]) {
    return {
      eventType: CATEGORY_COARSE[category],
      confidence: EVENT_CONFIDENCE.CATEGORY,
      method: "CATEGORY_RULE",
      evidence: [`category:${category}`, "no_title_rule_matched"],
      version: EVENT_TYPE_VERSION,
    };
  }

  // ③ 已知是某类披露、但子类含义可能相反（如 BUYBACK / EQUITY / DIVIDEND）→ 诚实 UNKNOWN
  return {
    eventType: "UNKNOWN",
    confidence: EVENT_CONFIDENCE.FALLBACK,
    method: "FALLBACK",
    evidence: category ? [`category:${category}`, "subtype_undeterminable"] : ["no_rule_matched"],
    version: EVENT_TYPE_VERSION,
  };
}
