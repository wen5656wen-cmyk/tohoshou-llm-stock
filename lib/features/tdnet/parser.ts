// ── TOHOSHOU AI · TDnet Event Parser（P6-T2）───────────────────────────────
// **统一** 解析 TDnet 公告标题（+摘要）→ 事件类型。全站唯一 TDnet 事件解析入口，
// 禁止页面/其它模块自行解析。**只读纯函数，不改任何生产分类逻辑**——本 parser 与
// lib/tdnet.ts 的 classifyTitle（生产 Disclosure.category / catalystScore 用）完全独立、
// 更细粒度（区分 取得/消却、上方/下方修正），互不影响。
//
// 正则基于真实 TDnet 日文标题验证（P6-T2 采样 4000 条：BUYBACK 359 / CANCEL 19 /
// DIVIDEND_INCREASE 10 / UP_REV 4 / SPLIT 4 命中）。一条公告可命中多个事件
// （如「株式分割及び…配当予想の修正（増配）」→ STOCK_SPLIT + DIVIDEND_INCREASE）。

import { type TdnetEventType, TDNET_EVENT_TYPES } from "./types";

// 各事件类型的匹配正则（日文 TDnet 标题）。
const PATTERNS: Record<TdnetEventType, RegExp> = {
  // 自己株式「消却」——须先于/独立于 BUYBACK 判定（消却 ≠ 取得）
  TREASURY_SHARE_CANCELLATION: /自己株式.{0,6}消却|自己株.{0,4}消却|自己株式の消却/,
  // 自己株式「取得」（回购）
  BUYBACK: /自己株式.{0,8}取得|自社株.{0,6}取得|自己株買/,
  // 増配 / 復配 / 配当予想の増額
  DIVIDEND_INCREASE: /増配|復配|配当予想.{0,10}増額|配当.{0,6}増額/,
  // 業績予想 上方修正
  EARNINGS_UP_REVISION: /上方修正/,
  // 業績予想 下方修正
  EARNINGS_DOWN_REVISION: /下方修正/,
  // 株式分割
  STOCK_SPLIT: /株式分割/,
};

/**
 * 将标题（+摘要）分类为 0..N 个 TDnet 事件类型（一条公告可携带多个事件）。
 * 纯函数、无副作用、不触碰任何生产逻辑。
 */
export function classifyTdnetEvent(title: string, summary?: string | null): TdnetEventType[] {
  const text = `${title ?? ""} ${summary ?? ""}`;
  const out: TdnetEventType[] = [];
  for (const t of TDNET_EVENT_TYPES) {
    if (PATTERNS[t].test(text)) out.push(t);
  }
  return out;
}

/** 该公告是否命中任一 TDnet 事件。 */
export function isTdnetEvent(title: string, summary?: string | null): boolean {
  return classifyTdnetEvent(title, summary).length > 0;
}

/** 导出只读的模式表（供测试/调试，勿在运行时修改）。 */
export const TDNET_EVENT_PATTERNS: Readonly<Record<TdnetEventType, RegExp>> = PATTERNS;
