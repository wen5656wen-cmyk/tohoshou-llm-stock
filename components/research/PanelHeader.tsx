"use client";
import { useI18n } from "@/lib/i18n";
import { fmtAsOf } from "./PanelFrame";

// AI 研究中心统一页头（P2-T7/T8）。标题/说明/元信息/最后更新时间 统一样式。纯展示。

// 专业名词中文解释（Tooltip，P2-T7 §十）
// 专业名词解释（Tooltip）。键为稳定英文标识，文案走 i18n（zh / ja）。
// 改造前是一份写死的中文字典，日文界面也显示中文。
export const TERM_TIP_KEYS = [
  "ATR", "ATR_PCT", "IC", "RANK_IC", "SHARPE", "ALPHA",
  "BREADTH", "VOLATILITY", "RS", "RS5", "RS20", "RS60",
  "VR", "VR5", "VR20", "TOPIX", "TREND",
] as const;
export type TermTipKey = (typeof TERM_TIP_KEYS)[number];
/** 取术语解释；未知键返回 null（调用方不显示 tooltip）。 */
export function termTip(key: string, tx: (k: string) => string): string | null {
  return (TERM_TIP_KEYS as readonly string[]).includes(key) ? tx(`rp.tip.${key}`) : null;
}



function freshness(iso: string | null | undefined): { key: string; color: string } {
  if (!iso) return { key: "common.no_data", color: "#dc2626" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { key: "rp.phdr.fresh", color: "#16a34a" };
  const h = (Date.now() - d.getTime()) / 3600000;
  return h < 24 ? { key: "rp.phdr.fresh", color: "#16a34a" } : h < 48 ? { key: "rp.phdr.aging", color: "#d97706" } : { key: "rp.phdr.stale", color: "#dc2626" };
}

export function PanelHeader({
  title, desc, phase, dataDate, computedAt, stockCount, statusText, loading, error,
}: {
  title: string;
  desc: string;
  phase: string;
  dataDate?: string | null;
  computedAt?: string | null;
  stockCount?: number | null;
  statusText: string;
  loading?: boolean;
  error?: string | null;
}) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const fresh = freshness(computedAt);
  const ct = fmtAsOf(computedAt);
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
      <p className="text-sm text-slate-500 mt-1">{desc}</p>
      {loading ? (
        <p className="text-xs text-slate-400 mt-2">{tx("common.loading")}</p>
      ) : error ? (
        <p className="text-xs text-red-500 mt-2">{tx("common.load_error")}: {error}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
          <span>{tx("rp.phdr.phase")}: <span className="text-slate-700 font-medium">{phase}</span></span>
          {dataDate ? <span>{tx("common.asOf.data")}: <span className="text-slate-700 font-medium tabular-nums">{dataDate}</span></span> : null}
          <span>{tx("rp.phdr.computedAt")}: <span className="text-slate-700 font-medium tabular-nums">{ct ?? "—"}</span></span>
          {stockCount != null ? <span>{tx("rp.phdr.stocks")}: <span className="text-slate-700 font-medium tabular-nums">{stockCount.toLocaleString()}</span></span> : null}
          <span>{tx("rp.phdr.dataStatus")}: <span className="font-medium" style={{ color: fresh.color === "#16a34a" ? "#059669" : fresh.color }}>{statusText}</span></span>
          <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: `${fresh.color}14`, color: fresh.color }}>
            {tx("common.asOf.updated")}: <span className="tabular-nums font-medium">{ct ?? "—"}</span> · {tx(fresh.key)}
          </span>
        </div>
      )}
    </div>
  );
}
