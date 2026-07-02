"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

// ── T2 P5: Paper Broker (自动交易模拟账户) ──────────────────────────────────

type Strat = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";

type Pool = { strategyType: Strat; pool: number; cash: number; positionsValue: number; total: number; openCount: number };
type Position = {
  strategyType: Strat; symbol: string; entryDate: string; entryPrice: number; quantity: number;
  investedAmount: number; currentPrice: number | null; currentValue: number | null; returnPct: number | null; returnAmount: number | null;
};
type Order = { strategyType: Strat; symbol: string; side: string; orderDate: string; requestedQty: number; filledQty: number; status: string; rejectReason: string | null };
type Execution = { strategyType: Strat; symbol: string; side: string; execDate: string; price: number; quantity: number; amount: number; priceBasis: string };
type PaperData = {
  initialized: boolean; mode: string; initialCapital: number;
  totals: { totalAssets: number; totalCash: number; positionsValue: number; cumulativePnl: number; cumulativePnlPct: number; todayPnl: number; realizedPnl: number; unrealizedPnl: number };
  pools: Pool[]; positions: Position[]; todayDate: string | null; todayOrders: Order[]; recentExecutions: Execution[];
};

const STRAT_COLOR: Record<Strat, string> = {
  DAY_TRADE: "text-amber-400", SWING_TRADE: "text-blue-400", LONG_TRADE: "text-emerald-400",
};
const STRAT_KEY: Record<Strat, MessageKey> = {
  DAY_TRADE: "strategy.DAY", SWING_TRADE: "strategy.SWING", LONG_TRADE: "strategy.long",
};

const yen = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString("en-US")}`);
const pnlColor = (v: number | null | undefined) => (v == null ? "text-slate-400" : v > 0 ? "text-red-400" : v < 0 ? "text-green-400" : "text-slate-300");
const pnlStr = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}`);
const pctStr = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);

export default function PortfolioPage() {
  const { t } = useI18n();
  const [data, setData] = useState<PaperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/portfolio/paper")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: PaperData) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  return (
    <div className="p-4 md:p-6 bg-[#0f172a] min-h-screen">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-200">{t("paper.title")}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t("paper.subtitle")}</p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50 uppercase tracking-wider">
            {t("paper.mode_paper")}
          </span>
        </div>

        {/* Risk notice */}
        <div className="rounded-lg border border-amber-700/40 bg-amber-900/15 px-4 py-2.5 text-xs text-amber-300/90">
          ⚠ {t("paper.risk_notice")}
        </div>

        {loading && <div className="py-16 text-center text-slate-500 text-sm">{t("paper.loading")}</div>}
        {error && <div className="py-16 text-center text-red-400 text-sm">{t("paper.error")}</div>}

        {data && !loading && !error && (
          <>
            {/* Top metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Metric label={t("paper.total_assets")} value={yen(data.totals.totalAssets)} />
              <Metric label={t("paper.cash")} value={yen(data.totals.totalCash)} />
              <Metric label={t("paper.positions_value")} value={yen(data.totals.positionsValue)} />
              <Metric label={t("paper.today_pnl")} value={pnlStr(data.totals.todayPnl)} valueClass={pnlColor(data.totals.todayPnl)} />
              <Metric
                label={t("paper.cumulative_pnl")}
                value={`${pnlStr(data.totals.cumulativePnl)} (${pctStr(data.totals.cumulativePnlPct)})`}
                valueClass={pnlColor(data.totals.cumulativePnl)}
              />
            </div>
            <div className="text-[10px] text-slate-600">
              {t("paper.initial_capital")}: {yen(data.initialCapital)}
            </div>

            {/* Three-strategy pools */}
            <Section title={t("paper.pools_title")}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.pools.map((p) => (
                  <div key={p.strategyType} className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-3">
                    <div className={`text-sm font-semibold ${STRAT_COLOR[p.strategyType]}`}>{t(STRAT_KEY[p.strategyType])}</div>
                    <div className="mt-2 space-y-1 text-xs">
                      <Row k={t("paper.pool")} v={yen(p.pool)} />
                      <Row k={t("paper.cash")} v={yen(p.cash)} />
                      <Row k={t("paper.positions_value")} v={yen(p.positionsValue)} />
                      <div className="border-t border-slate-700/40 my-1" />
                      <Row k={t("paper.total_assets")} v={yen(p.total)} strong />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-2">{t("paper.frozen_note")}</p>
            </Section>

            {/* Open positions */}
            <Section title={`${t("paper.positions_title")} (${data.positions.length})`}>
              {data.positions.length === 0 ? (
                <Empty text={t("paper.no_positions")} />
              ) : (
                <Table
                  head={[t("common.symbol"), t("paper.col_qty"), t("paper.col_entry"), t("paper.col_current"), t("paper.col_value"), t("paper.col_return")]}
                  rows={data.positions.map((pos) => [
                    <span key="s" className={STRAT_COLOR[pos.strategyType]}>{pos.symbol}</span>,
                    String(pos.quantity),
                    yen(pos.entryPrice), yen(pos.currentPrice), yen(pos.currentValue),
                    <span key="r" className={pnlColor(pos.returnPct)}>{pctStr(pos.returnPct)}</span>,
                  ])}
                />
              )}
            </Section>

            {/* Today's orders */}
            <Section title={`${t("paper.today_orders_title")}${data.todayDate ? ` · ${data.todayDate}` : ""} (${data.todayOrders.length})`}>
              {data.todayOrders.length === 0 ? (
                <Empty text={t("paper.no_orders")} />
              ) : (
                <Table
                  head={[t("common.symbol"), t("paper.col_side"), t("paper.col_qty"), t("paper.col_status")]}
                  rows={data.todayOrders.map((o) => [
                    <span key="s" className={STRAT_COLOR[o.strategyType]}>{o.symbol}</span>,
                    t(`paper.side.${o.side}` as MessageKey),
                    `${o.filledQty}/${o.requestedQty}`,
                    <span key="st" className={o.status === "REJECTED" ? "text-red-400" : o.status === "FILLED" ? "text-slate-300" : "text-slate-400"}>
                      {t(`paper.status.${o.status}` as MessageKey)}
                      {o.rejectReason ? ` · ${safeReject(t, o.rejectReason)}` : ""}
                    </span>,
                  ])}
                />
              )}
            </Section>

            {/* Recent executions */}
            <Section title={t("paper.executions_title")}>
              {data.recentExecutions.length === 0 ? (
                <Empty text={t("paper.no_executions")} />
              ) : (
                <Table
                  head={[t("paper.col_date"), t("common.symbol"), t("paper.col_side"), t("paper.col_qty"), t("paper.col_price"), t("paper.col_amount")]}
                  rows={data.recentExecutions.map((e) => [
                    String(e.execDate).slice(0, 10),
                    <span key="s" className={STRAT_COLOR[e.strategyType]}>{e.symbol}</span>,
                    <span key="sd" className={e.side === "BUY" ? "text-red-400" : "text-green-400"}>{t(`paper.side.${e.side}` as MessageKey)}</span>,
                    String(e.quantity), yen(e.price), yen(e.amount),
                  ])}
                />
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function safeReject(t: (k: MessageKey) => string, reason: string): string {
  const key = `paper.reject.${reason}` as MessageKey;
  const v = t(key);
  return v === key ? reason : v;
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-3">
      <div className="text-[10px] text-slate-500 mb-1">{label}</div>
      <div className={`text-base font-bold tabular-nums ${valueClass ?? "text-slate-200"}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{k}</span>
      <span className={`tabular-nums ${strong ? "text-slate-200 font-semibold" : "text-slate-300"}`}>{v}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-6 text-center text-slate-500 text-sm">{text}</div>;
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700/40 text-slate-500">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-slate-700/20">
              {r.map((c, ci) => (
                <td key={ci} className={`px-3 py-2 tabular-nums ${ci === 0 ? "text-left font-semibold" : "text-right text-slate-300"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
