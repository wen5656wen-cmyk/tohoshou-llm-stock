"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n";

type T = (k: MessageKey) => string;
export type BtRow = { horizon: string; sampleCount: number; filledCount: number; fillRate: number; winRate: number | null; avgReturn: number | null; medianReturn: number | null; alpha: number | null; bestReturn: number | null; worstReturn: number | null; status: string };
export type Readiness = { availableHorizons: string[]; expectedFillDates: { "30d": string | null; "90d": string | null } };
export type McStratBt = Record<string, { asOfDate: string; horizons: { horizon: string; maturity: string; fillRate: number | null }[] }>;

export const B = {
  bg: "#FAFAFA", card: "#FFFFFF", line: "#ECECEC", cardSub: "#F7F7F9",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B",
  blue: "#007AFF", green: "#34C759", amber: "#FF9F0A", red: "#FF3B30", purple: "#5856D6",
};
export const HZ = ["1d", "3d", "5d", "7d", "10d", "20d", "30d", "60d", "90d"];
const isReady = (r: BtRow | undefined) => !!r && (r.status === "READY" || (r.fillRate ?? 0) >= 50);
export const retC = (v: number | null | undefined) => v == null ? B.faint : v > 0 ? B.green : v < 0 ? B.red : B.sub;
const ret = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const winStr = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(1)}%`;

function Pill({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: `${color}14` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}</span>;
}
function statusMeta(r: BtRow | undefined, t: T) {
  if (!r) return { label: "N/A", color: B.faint };
  if (isReady(r)) return { label: t("backtest.ready"), color: B.green };
  if ((r.sampleCount ?? 0) > 0) return { label: t("backtest.waiting_short"), color: B.amber };
  return { label: t("backtest.insufficient"), color: B.faint };
}

// ── Header ────────────────────────────────────────────────────────────────────
export function BacktestHeader({ t, onRefresh, refreshing, updatedAt }: { t: T; onRefresh: () => void; refreshing: boolean; updatedAt: string }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]" style={{ color: B.ink }}>{t("backtest.title")}</h1>
        <p className="text-[13px] mt-1" style={{ color: B.faint }}>{t("backtest.subtitle")}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold dash-card dash-int" style={{ color: B.ink }}>
          <span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span>
        </button>
        {updatedAt && <span className="text-[12px] tabular-nums hidden lg:inline" style={{ color: B.faint }}>{updatedAt}</span>}
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
export function BacktestHero({ t, rows, cohortCount }: { t: T; rows: BtRow[]; cohortCount: number | null }) {
  const readyRows = rows.filter((r) => isReady(r));
  const matured = readyRows.map((r) => r.horizon.toUpperCase()).join(" / ") || "—";
  const best = readyRows.slice().sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1))[0] ?? null;
  const allReady = rows.length > 0 && readyRows.length === rows.length;
  const statusLabel = rows.length === 0 ? t("backtest.no_data") : readyRows.length === 0 ? t("backtest.waiting_short") : allReady ? t("backtest.ready") : t("backtest.partial");
  const statusColor = rows.length === 0 || readyRows.length === 0 ? B.amber : B.green;
  const beat = best?.alpha != null ? best.alpha >= 0 : null;
  const cells = [
    { label: t("backtest.rec_dates"), value: cohortCount != null ? `${cohortCount}` : "—", color: B.ink },
    { label: t("backtest.matured"), value: matured, color: B.blue, small: true },
    { label: t("backtest.best"), value: best ? best.horizon.toUpperCase() : "—", color: B.blue },
    { label: t("backtest.win_rate"), value: winStr(best?.winRate), color: B.ink },
    { label: "Alpha vs TOPIX", value: ret(best?.alpha), color: retC(best?.alpha) },
    { label: t("backtest.status"), value: statusLabel, color: statusColor, small: true },
  ];
  return (
    <div className="dash-card p-6 lg:p-7 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: B.faint }}>Backtest Intelligence</div>
        {beat != null && <Pill label={beat ? t("backtest.beat_topix") : t("backtest.miss_topix")} color={beat ? B.green : B.red} />}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5">
        {cells.map((c) => (
          <div key={c.label}>
            <div className="text-[11px]" style={{ color: B.faint }}>{c.label}</div>
            <div className={`font-semibold tabular-nums tracking-[-0.01em] mt-1.5 ${c.small ? "text-[17px]" : "text-[26px]"}`} style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Notice ────────────────────────────────────────────────────────────────────
export function BacktestNotice({ t }: { t: T }) {
  const items = [t("backtest.disclaimer_entry"), t("backtest.disclaimer_return"), t("backtest.disclaimer_date"), t("backtest.disclaimer_no_slippage"), t("backtest.disclaimer_no_future")];
  return (
    <div className="dash-card p-5 mb-8" style={{ background: `${B.blue}06`, borderColor: `${B.blue}22` }}>
      <div className="text-[13px] font-semibold mb-2.5" style={{ color: B.ink }}>{t("backtest.notice_title")}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
        {items.map((it, i) => <div key={i} className="flex items-start gap-2 text-[12px]" style={{ color: B.sub }}><span style={{ color: B.blue }}>·</span>{it}</div>)}
      </div>
    </div>
  );
}

// ── Horizon status cards ──────────────────────────────────────────────────────
export function HorizonStatusCards({ t, rows }: { t: T; rows: BtRow[] }) {
  const byH = new Map(rows.map((r) => [r.horizon.toLowerCase(), r]));
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: B.faint }}>{t("backtest.horizon_status")}</div>
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-4">
        {HZ.map((h) => {
          const r = byH.get(h); const st = statusMeta(r, t);
          return (
            <div key={h} className="dash-card dash-int p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold uppercase" style={{ color: B.ink }}>{h}</span>
                <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />
              </div>
              <div className="text-[16px] font-semibold tabular-nums mt-2" style={{ color: retC(r?.avgReturn) }}>{ret(r?.avgReturn)}</div>
              <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: B.faint }}>{r ? `${(r.fillRate ?? 0).toFixed(0)}%` : "N/A"} · α {r?.alpha != null ? ret(r.alpha) : "—"}</div>
              <div className="mt-2"><span className="text-[10px] font-semibold" style={{ color: st.color }}>{st.label}</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Matrix table ──────────────────────────────────────────────────────────────
export function BacktestMatrixTable({ t, rows, readiness }: { t: T; rows: BtRow[]; readiness: Readiness | null }) {
  const byH = new Map(rows.map((r) => [r.horizon.toLowerCase(), r]));
  const maturityOf = (h: string, r: BtRow | undefined) => {
    if (isReady(r)) return t("backtest.ready");
    const exp = readiness?.expectedFillDates as Record<string, string | null> | undefined;
    return exp?.[h] ?? "—";
  };
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: B.faint }}>{t("backtest.matrix")}</div>
      <div className="dash-card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr style={{ borderBottom: `1px solid ${B.line}` }}>
            {[t("backtest.horizon"), t("backtest.status"), `${t("backtest.samples")} / ${t("backtest.filled")}`, t("backtest.win_rate"), t("backtest.avg_return"), "Alpha vs TOPIX", t("backtest.maturity_date")].map((h, i) => (
              <th key={h} className={`px-4 py-3 text-[11px] font-semibold uppercase whitespace-nowrap ${i === 0 || i === 1 ? "text-left" : "text-right"}`} style={{ color: B.faint }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {HZ.map((h) => {
              const r = byH.get(h); const st = statusMeta(r, t); const ready = isReady(r);
              return (
                <tr key={h} className="transition-colors hover:bg-[#F7F7F9]" style={{ borderBottom: `1px solid ${B.line}`, background: ready ? `${B.green}06` : undefined }}>
                  <td className="px-4 py-3 font-semibold uppercase" style={{ color: B.ink }}>{h}</td>
                  <td className="px-4 py-3"><Pill label={st.label} color={st.color} /></td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: B.sub }}>{r ? `${r.sampleCount.toLocaleString()} / ${r.filledCount.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: r?.winRate != null && r.winRate >= 50 ? B.green : B.ink }}>{winStr(r?.winRate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: retC(r?.avgReturn) }}>{ret(r?.avgReturn)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: retC(r?.alpha) }}>{ret(r?.alpha)}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: ready ? B.green : B.faint }}>{maturityOf(h, r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Maturity timeline ─────────────────────────────────────────────────────────
export function MaturityTimeline({ t, rows, readiness }: { t: T; rows: BtRow[]; readiness: Readiness | null }) {
  const byH = new Map(rows.map((r) => [r.horizon.toLowerCase(), r]));
  const exp = (readiness?.expectedFillDates ?? {}) as Record<string, string | null>;
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: B.faint }}>{t("backtest.maturity_timeline")}</div>
      <div className="dash-card p-6">
        {HZ.map((h, i) => {
          const r = byH.get(h); const ready = isReady(r); const col = ready ? B.green : (r?.sampleCount ?? 0) > 0 ? B.amber : B.faint;
          const last = i === HZ.length - 1;
          return (
            <div key={h} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ background: ready ? col : "transparent", border: ready ? "none" : `2px solid ${col}` }} />
                {!last && <span className="w-px flex-1 my-1" style={{ background: B.line }} />}
              </div>
              <div className={`flex-1 flex items-center justify-between gap-3 ${last ? "" : "pb-4"}`}>
                <span className="text-[14px] font-semibold uppercase" style={{ color: B.ink }}>{h}</span>
                <span className="text-[12px]" style={{ color: col }}>{ready ? t("backtest.ready") : exp[h] ? exp[h] : t("backtest.waiting_short")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Strategy backtest panel ───────────────────────────────────────────────────
export function StrategyBacktestPanel({ t, mc, hasStats }: { t: T; mc: McStratBt | null; hasStats: boolean }) {
  const TABS: { key: string; mcKey: string; label: string; alloc: string; color: string }[] = [
    { key: "OVERALL", mcKey: "", label: t("backtest.overall"), alloc: "", color: B.blue },
    { key: "DAY", mcKey: "DAY_TRADE", label: t("strategy.DAY.short"), alloc: "30%", color: B.amber },
    { key: "SWING", mcKey: "SWING_TRADE", label: t("strategy.SWING.short"), alloc: "40%", color: B.blue },
    { key: "POSITION", mcKey: "LONG_TRADE", label: t("strategy.long.short"), alloc: "30%", color: B.green },
  ];
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: B.faint }}>{t("backtest.strategy_title")}</div>
      <div className="dash-card p-6">
        {/* maturity chips per strategy from mission-control (real) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {TABS.slice(1).map((tb) => {
            const grp = mc?.[tb.mcKey]; const hzs = grp?.horizons ?? [];
            return (
              <div key={tb.key} className="rounded-xl p-4" style={{ background: B.cardSub }}>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: B.ink }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: tb.color }} />{tb.label} {tb.alloc}</span>
                </div>
                {hzs.length === 0 ? <span className="text-[12px]" style={{ color: B.faint }}>N/A</span> : (
                  <div className="flex flex-wrap gap-1.5">
                    {hzs.map((z) => { const rdy = z.maturity === "READY"; return <span key={z.horizon} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: rdy ? B.green : B.faint, background: rdy ? `${B.green}14` : B.line }}>{z.horizon}</span>; })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* stats empty state */}
        {!hasStats && (
          <div className="rounded-xl p-6 text-center" style={{ background: B.cardSub }}>
            <div className="text-[14px] font-semibold" style={{ color: B.ink }}>{t("backtest.no_strategy")}</div>
            <div className="text-[12px] mt-1.5 font-mono" style={{ color: B.faint }}>{t("backtest.run_strategy")}</div>
            <Link href="/strategy" className="inline-flex items-center gap-1.5 h-9 px-5 mt-4 rounded-full text-[13px] font-semibold text-white" style={{ background: B.blue }}>{t("backtest.view_strategy")} →</Link>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function BacktestEmptyState({ t }: { t: T }) {
  return (
    <div className="dash-card py-16 text-center">
      <div className="text-[15px] font-semibold" style={{ color: B.ink }}>{t("backtest.waiting_title")}</div>
      <div className="text-[13px] mt-2" style={{ color: B.faint }}>{t("backtest.waiting_subtitle")}</div>
    </div>
  );
}
