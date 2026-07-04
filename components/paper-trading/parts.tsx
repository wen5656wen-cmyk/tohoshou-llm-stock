"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

// ── Shared types (mirror /api/portfolio/paper, read-only) ─────────────────────
export type Strat = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";
export type PoolEx = { strategyType: Strat; pool: number; cash: number; positionsValue: number; total: number; openCount: number; cumulativeReturnPct: number; todayPnl: number; todayBuys: number; todaySells: number };
export type Holding = { strategyType: Strat; symbol: string; name: string | null; nameZh: string | null; quantity: number; entryPrice: number; currentPrice: number | null; currentValue: number | null; unrealizedAmount: number | null; unrealizedPct: number | null; holdingDays: number | null; aiScore: number | null; action: string | null; riskLevel: string | null };
export type ExecEx = { execDate: string; strategyType: Strat; symbol: string; name: string | null; nameZh: string | null; side: string; quantity: number; price: number; amount: number; priceBasis: string; fee: number; source: string; broker: string };
type NamedRef = { symbol: string; name: string | null; nameZh: string | null; amount: number } | null;
export type PaperData = {
  initialized: boolean; mode: string; initialCapital: number;
  totals: { totalAssets: number; totalCash: number; positionsValue: number; cumulativePnl: number; cumulativePnlPct: number; todayPnl: number; realizedPnl: number; unrealizedPnl: number };
  bossSummary?: {
    today: { pnl: number; returnPct: number | null; profited: string };
    assets: { initialCapital: number; totalAssets: number; cash: number; positionsValue: number };
    cumulative: { pnl: number; returnPct: number; benchTopixPct: number | null; beatTopix: boolean | null };
    accountStatus: { mode: string; synced: boolean; paperLatestDate: string | null; healthCritical: number | null; healthStatus: string | null; pipeline: { done: number; total: number } };
    tradeSummary: { todayBuys: number; todaySells: number; currentPositions: number; totalExecutions: number };
  };
  strategyPools?: PoolEx[];
  holdingsEnhanced?: Holding[];
  recentExecutionsEnhanced?: ExecEx[];
  riskMetrics?: { cashRatio: number; positionRatio: number; maxSingleStock: number; top5Concentration: number; strategyAllocation: { strategyType: Strat; pct: number }[]; consecutiveWinDays: number; consecutiveLossDays: number; riskLevel: string };
  aiDailySummary?: { marketState: string; todayBuys: number; todaySells: number; currentPositions: number; todayPnl: number; cumulativePnl: number; topContributor: NamedRef; topDetractor: NamedRef; riskLevel: string; suggestion: string; running: boolean };
};

// ── Palette (dark institutional) ──────────────────────────────────────────────
export const M = { bg: "#111315", card: "#171A1F", cardHi: "#1C2028", border: "#262B33", ink: "#E6E8EB", sub: "#9BA1A9", faint: "#6B7280", blue: "#0A84FF", green: "#34C759", amber: "#FF9F0A", red: "#FF453A" };
export const STRAT_HEX: Record<Strat, string> = { DAY_TRADE: "#FF9F0A", SWING_TRADE: "#0A84FF", LONG_TRADE: "#34C759" };
const STRAT_ZH: Record<Strat, string> = { DAY_TRADE: "日内", SWING_TRADE: "波段", LONG_TRADE: "长线" };
const RISK_HEX = (r: string | null | undefined) => r === "HIGH" || r === "高" ? M.red : r === "MEDIUM" || r === "中" ? M.amber : r === "LOW" || r === "低" ? M.green : M.faint;

// profit = green, loss = red (per spec)
export const yen = (v: number | null | undefined) => v == null ? "—" : `¥${Math.round(v).toLocaleString("en-US")}`;
export const retC = (v: number | null | undefined) => v == null ? M.faint : v > 0 ? M.green : v < 0 ? M.red : M.sub;
export const pnl = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}`;
export const pct = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const nameOf = (h: { nameZh: string | null; name: string | null; symbol: string }) => h.nameZh ?? h.name ?? h.symbol;

function Badge({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: `${color}1f` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}</span>;
}

// ── Header ────────────────────────────────────────────────────────────────────
export function PaperTradingHeader({ data, onRefresh, refreshing }: { data: PaperData; onRefresh: () => void; refreshing: boolean }) {
  const acc = data.bossSummary?.accountStatus;
  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]" style={{ color: M.ink }}>AI 自动交易驾驶舱</h1>
        <p className="text-[13px] mt-1" style={{ color: M.faint }}>Paper Broker · 模拟自动交易账户 {acc?.paperLatestDate ? `· ${acc.paperLatestDate}` : ""}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <Badge label="Paper Mode" color={M.amber} />
        <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold disabled:opacity-50" style={{ background: M.cardHi, border: `1px solid ${M.border}`, color: M.ink }}>
          <span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span>刷新
        </button>
      </div>
    </header>
  );
}

// ── Paper mode banner ─────────────────────────────────────────────────────────
export function PaperModeBanner() {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-6" style={{ background: `${M.amber}12`, border: `1px solid ${M.amber}33` }}>
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[13px] shrink-0" style={{ background: `${M.amber}22`, color: M.amber }}>!</span>
      <span className="text-[13px] font-medium" style={{ color: M.amber }}>当前为模拟交易模式，不会产生真实买卖或资金变动。</span>
    </div>
  );
}

function DCard({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return <div className={`rounded-2xl p-5 ${className}`} style={{ background: M.card, border: `1px solid ${accent ?? M.border}` }}>{children}</div>;
}

// ── Hero KPI ──────────────────────────────────────────────────────────────────
export function TradingHero({ data }: { data: PaperData }) {
  const b = data.bossSummary;
  const today = b?.today ?? { pnl: data.totals.todayPnl, returnPct: null, profited: data.totals.todayPnl >= 0 ? "YES" : "NO" };
  const assets = b?.assets ?? { initialCapital: data.initialCapital, totalAssets: data.totals.totalAssets, cash: data.totals.totalCash, positionsValue: data.totals.positionsValue };
  const cum = b?.cumulative ?? { pnl: data.totals.cumulativePnl, returnPct: data.totals.cumulativePnlPct, benchTopixPct: null, beatTopix: null };
  const acc = b?.accountStatus;
  const ts = b?.tradeSummary ?? { todayBuys: 0, todaySells: 0, currentPositions: 0, totalExecutions: 0 };
  const up = today.pnl >= 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
      {/* Today */}
      <DCard accent={up ? `${M.green}44` : `${M.red}44`}>
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium" style={{ color: M.sub }}>今日表现</span>
          <Badge label={today.profited === "YES" ? "赚钱 YES" : "亏损 NO"} color={up ? M.green : M.red} />
        </div>
        <div className="text-[32px] font-semibold tabular-nums tracking-[-0.02em] mt-3" style={{ color: retC(today.pnl) }}>{pnl(today.pnl)}</div>
        <div className="text-[13px] font-medium tabular-nums mt-1" style={{ color: retC(today.returnPct) }}>{pct(today.returnPct)} 今日收益率</div>
      </DCard>
      {/* Assets */}
      <DCard>
        <span className="text-[12px] font-medium" style={{ color: M.sub }}>当前资产</span>
        <div className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] mt-3" style={{ color: M.ink }}>{yen(assets.totalAssets)}</div>
        <div className="mt-3 space-y-1.5">
          {[["现金", assets.cash], ["持仓市值", assets.positionsValue], ["初始资金", assets.initialCapital]].map(([k, v]) => (
            <div key={k as string} className="flex justify-between text-[12px]"><span style={{ color: M.faint }}>{k}</span><span className="tabular-nums" style={{ color: M.sub }}>{yen(v as number)}</span></div>
          ))}
        </div>
      </DCard>
      {/* Cumulative + Account */}
      <DCard>
        <span className="text-[12px] font-medium" style={{ color: M.sub }}>累计表现</span>
        <div className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] mt-3" style={{ color: retC(cum.pnl) }}>{pct(cum.returnPct)}</div>
        <div className="text-[12px] tabular-nums mt-1" style={{ color: retC(cum.pnl) }}>{pnl(cum.pnl)} 累计盈亏</div>
        <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: `1px solid ${M.border}` }}>
          {cum.beatTopix != null ? <Badge label={cum.beatTopix ? "跑赢 TOPIX" : "跑输 TOPIX"} color={cum.beatTopix ? M.green : M.red} /> : <span className="text-[11px]" style={{ color: M.faint }}>TOPIX N/A</span>}
          {cum.benchTopixPct != null && <span className="text-[11px] tabular-nums" style={{ color: M.faint }}>基准 {cum.benchTopixPct.toFixed(2)}%</span>}
        </div>
      </DCard>
      {/* Account status + trade summary */}
      <DCard>
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium" style={{ color: M.sub }}>账户状态</span>
          <Badge label={acc?.synced ? "自动运行" : "未同步"} color={acc?.synced ? M.green : M.amber} />
        </div>
        <div className="text-[15px] font-semibold mt-3" style={{ color: M.ink }}>Paper Broker</div>
        <div className="mt-2 space-y-1.5">
          <div className="flex justify-between text-[12px]"><span style={{ color: M.faint }}>今日流水线</span><span className="tabular-nums" style={{ color: M.sub }}>{acc?.pipeline ? `${acc.pipeline.done}/${acc.pipeline.total}` : "—"}</span></div>
          <div className="flex justify-between text-[12px]"><span style={{ color: M.faint }}>Health</span><span className="font-semibold" style={{ color: acc?.healthCritical === 0 ? M.green : M.amber }}>{acc?.healthStatus ?? "—"}</span></div>
        </div>
        <div className="mt-3 pt-3 grid grid-cols-2 gap-x-3 gap-y-1.5" style={{ borderTop: `1px solid ${M.border}` }}>
          {[["今日买入", ts.todayBuys, M.green], ["今日卖出", ts.todaySells, M.red], ["当前持仓", ts.currentPositions, M.ink], ["累计成交", ts.totalExecutions, M.ink]].map(([k, v, c]) => (
            <div key={k as string} className="flex justify-between text-[12px]"><span style={{ color: M.faint }}>{k}</span><span className="font-semibold tabular-nums" style={{ color: c as string }}>{v as number}</span></div>
          ))}
        </div>
      </DCard>
    </div>
  );
}

// ── AI Trading Brief ──────────────────────────────────────────────────────────
export function TradingBrief({ data }: { data: PaperData }) {
  const s = data.aiDailySummary;
  if (!s) return null;
  const mkt = s.marketState === "UP" ? { l: "市场上行", c: M.green } : s.marketState === "DOWN" ? { l: "市场下行", c: M.red } : { l: "市场震荡", c: M.amber };
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: M.faint }}>AI Trading Brief · AI 今日总结</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Highlights */}
        <DCard className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3"><Badge label={mkt.l} color={mkt.c} /><Badge label={s.running ? "自动运行中" : "已停止"} color={s.running ? M.green : M.faint} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {[["今日买入", `${s.todayBuys}`, M.green], ["今日卖出", `${s.todaySells}`, M.red], ["当前持仓", `${s.currentPositions}`, M.ink], ["今日盈亏", pnl(s.todayPnl), retC(s.todayPnl)], ["累计盈亏", pnl(s.cumulativePnl), retC(s.cumulativePnl)]].map(([k, v, c]) => (
              <div key={k}><div className="text-[11px]" style={{ color: M.faint }}>{k}</div><div className="text-[17px] font-semibold tabular-nums mt-0.5" style={{ color: c }}>{v}</div></div>
            ))}
          </div>
          <div className="mt-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderTop: `1px solid ${M.border}` }}>
            <div><div className="text-[11px]" style={{ color: M.faint }}>主要贡献</div>{s.topContributor ? <div className="text-[13px] font-semibold mt-0.5" style={{ color: M.green }}>{nameOf(s.topContributor)} <span className="tabular-nums">{pnl(s.topContributor.amount)}</span></div> : <div className="text-[13px] mt-0.5" style={{ color: M.faint }}>—</div>}</div>
            <div><div className="text-[11px]" style={{ color: M.faint }}>主要拖累</div>{s.topDetractor ? <div className="text-[13px] font-semibold mt-0.5" style={{ color: M.red }}>{nameOf(s.topDetractor)} <span className="tabular-nums">{pnl(s.topDetractor.amount)}</span></div> : <div className="text-[13px] mt-0.5" style={{ color: M.faint }}>—</div>}</div>
          </div>
        </DCard>
        {/* Risk + Recommendation */}
        <div className="space-y-4">
          <DCard>
            <div className="text-[11px]" style={{ color: M.faint }}>当前风险等级</div>
            <div className="flex items-center gap-2 mt-2"><span className="text-[20px] font-semibold" style={{ color: RISK_HEX(s.riskLevel) }}>{s.riskLevel || "N/A"}</span></div>
          </DCard>
          <DCard>
            <div className="text-[11px] mb-1.5" style={{ color: M.faint }}>AI 建议</div>
            <div className="text-[13px] leading-relaxed" style={{ color: M.sub }}>{s.suggestion || "暂无建议"}</div>
          </DCard>
        </div>
      </div>
    </section>
  );
}

// ── Strategy Capital Pools ────────────────────────────────────────────────────
export function StrategyCapitalPools({ data }: { data: PaperData }) {
  const pools = data.strategyPools ?? [];
  if (pools.length === 0) return null;
  const totalPool = pools.reduce((a, p) => a + p.total, 0) || 1;
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: M.faint }}>Strategy Capital Pools · 三策略资金池</div>
      <div className="flex h-2 rounded-full overflow-hidden gap-1 mb-4">
        {pools.map((p) => <div key={p.strategyType} style={{ width: `${(p.total / totalPool) * 100}%`, background: STRAT_HEX[p.strategyType] }} title={`${STRAT_ZH[p.strategyType]} ${((p.total / totalPool) * 100).toFixed(0)}%`} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {pools.map((p) => {
          const c = STRAT_HEX[p.strategyType];
          return (
            <DCard key={p.strategyType} accent={`${c}44`}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: M.ink }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{STRAT_ZH[p.strategyType]}策略</span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: retC(p.cumulativeReturnPct) }}>{pct(p.cumulativeReturnPct)}</span>
              </div>
              <div className="text-[24px] font-semibold tabular-nums mt-3" style={{ color: M.ink }}>{yen(p.total)}</div>
              <div className="text-[11px] mt-0.5" style={{ color: M.faint }}>总资产 · 资金池 {yen(p.pool)}</div>
              <div className="mt-3 pt-3 grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ borderTop: `1px solid ${M.border}` }}>
                {[["现金", yen(p.cash), M.sub], ["持仓市值", yen(p.positionsValue), M.sub], ["今日盈亏", pnl(p.todayPnl), retC(p.todayPnl)], ["持仓数", `${p.openCount}`, M.ink], ["今日买入", `${p.todayBuys}`, M.green], ["今日卖出", `${p.todaySells}`, M.red]].map(([k, v, cc]) => (
                  <div key={k} className="flex justify-between text-[12px]"><span style={{ color: M.faint }}>{k}</span><span className="font-semibold tabular-nums" style={{ color: cc }}>{v}</span></div>
                ))}
              </div>
            </DCard>
          );
        })}
      </div>
    </section>
  );
}

// ── Positions table (Bloomberg style) ─────────────────────────────────────────
export function PortfolioPositionsTable({ data, onExplain }: { data: PaperData; onExplain: (s: Strat, sym: string) => void }) {
  const rows = data.holdingsEnhanced ?? [];
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: M.faint }}>Portfolio Positions · 当前持仓 ({rows.length})</div>
      <div className="rounded-2xl overflow-x-auto" style={{ background: M.card, border: `1px solid ${M.border}` }}>
        {rows.length === 0 ? <EmptyState text="暂无持仓" /> : (
          <table className="w-full text-[13px]">
            <thead><tr style={{ borderBottom: `1px solid ${M.border}` }}>
              {["策略", "代码", "数量", "买入价", "现价", "市值", "浮盈", "持仓天数", "AI评分", "风险", "操作"].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold uppercase whitespace-nowrap ${i === 0 || i === 1 ? "text-left" : i === 10 ? "text-center" : "text-right"}`} style={{ color: M.faint }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((h, i) => {
                const c = STRAT_HEX[h.strategyType];
                return (
                  <tr key={`${h.symbol}-${i}`} className="transition-colors" style={{ borderBottom: `1px solid ${M.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = M.cardHi)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: M.sub }}><span className="w-2 h-2 rounded-full" style={{ background: c }} />{STRAT_ZH[h.strategyType]}</span></td>
                    <td className="px-3 py-2.5"><Link href={`/stocks/${encodeURIComponent(h.symbol)}?source=portfolio`} className="font-semibold hover:underline" style={{ color: M.blue }}>{h.symbol}</Link></td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: M.sub }}>{h.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: M.sub }}>{yen(h.entryPrice)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: M.ink }}>{yen(h.currentPrice)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: M.ink }}>{yen(h.currentValue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: retC(h.unrealizedAmount) }}>{pnl(h.unrealizedAmount)}<span className="text-[11px] ml-1">{h.unrealizedPct != null ? `(${pct(h.unrealizedPct)})` : ""}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: M.faint }}>{h.holdingDays ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: M.sub }}>{h.aiScore ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right"><span className="text-[11px] font-semibold" style={{ color: RISK_HEX(h.riskLevel) }}>{h.riskLevel ?? "—"}</span></td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <button onClick={() => onExplain(h.strategyType, h.symbol)} className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ background: M.cardHi, border: `1px solid ${M.border}`, color: M.ink }}>查看原因</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── Trading timeline ──────────────────────────────────────────────────────────
export function TradingTimeline({ data }: { data: PaperData }) {
  const ex = data.recentExecutionsEnhanced ?? [];
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: M.faint }}>Trading Flow · 交易流水 ({ex.length})</div>
      <div className="rounded-2xl overflow-hidden" style={{ background: M.card, border: `1px solid ${M.border}` }}>
        {ex.length === 0 ? <EmptyState text="暂无交易流水" /> : (
          <div className="max-h-[420px] overflow-y-auto">
            {ex.map((e, i) => {
              const buy = e.side === "BUY";
              const c = STRAT_HEX[e.strategyType];
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3" style={i > 0 ? { borderTop: `1px solid ${M.border}` } : undefined}>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ color: buy ? M.green : M.red, background: `${buy ? M.green : M.red}1f` }}>{buy ? "买入" : "卖出"}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] w-14 shrink-0" style={{ color: M.sub }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{STRAT_ZH[e.strategyType]}</span>
                  <Link href={`/stocks/${encodeURIComponent(e.symbol)}?source=portfolio`} className="text-[13px] font-semibold hover:underline shrink-0" style={{ color: M.blue }}>{e.symbol}</Link>
                  <span className="text-[12px] flex-1 truncate" style={{ color: M.faint }}>{e.nameZh ?? e.name ?? ""}</span>
                  <span className="text-[12px] tabular-nums" style={{ color: M.sub }}>{e.quantity.toLocaleString()} @ {yen(e.price)}</span>
                  <span className="text-[13px] font-semibold tabular-nums w-24 text-right" style={{ color: M.ink }}>{yen(e.amount)}</span>
                  <span className="text-[11px] tabular-nums w-20 text-right hidden sm:inline" style={{ color: M.faint }}>{e.execDate?.slice(5, 10)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Risk panel ────────────────────────────────────────────────────────────────
export function TradingRiskPanel({ data }: { data: PaperData }) {
  const r = data.riskMetrics;
  const cells = [
    { k: "当前风险等级", v: r?.riskLevel ?? "N/A", c: RISK_HEX(r?.riskLevel) },
    { k: "仓位占比", v: r ? `${r.positionRatio.toFixed(1)}%` : "N/A", c: M.ink },
    { k: "现金占比", v: r ? `${r.cashRatio.toFixed(1)}%` : "N/A", c: M.ink },
    { k: "最大单一持仓", v: r ? `${r.maxSingleStock.toFixed(1)}%` : "N/A", c: r && r.maxSingleStock > 15 ? M.amber : M.ink },
    { k: "Top5 集中度", v: r ? `${r.top5Concentration.toFixed(1)}%` : "N/A", c: r && r.top5Concentration > 50 ? M.amber : M.ink },
    { k: "持仓数量", v: `${data.bossSummary?.tradeSummary.currentPositions ?? data.holdingsEnhanced?.length ?? 0}`, c: M.ink },
    { k: "未实现盈亏", v: pnl(data.totals.unrealizedPnl), c: retC(data.totals.unrealizedPnl) },
    { k: "连胜/连亏", v: r ? `${r.consecutiveWinDays} / ${r.consecutiveLossDays}` : "N/A", c: M.sub },
  ];
  return (
    <section className="mb-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: M.faint }}>Risk Panel · 风险面板</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cells.map((x) => (
          <DCard key={x.k}><div className="text-[11px]" style={{ color: M.faint }}>{x.k}</div><div className="text-[20px] font-semibold tabular-nums mt-1.5" style={{ color: x.c }}>{x.v}</div></DCard>
        ))}
      </div>
      {r?.strategyAllocation && r.strategyAllocation.length > 0 && (
        <DCard className="mt-4">
          <div className="text-[11px] mb-2.5" style={{ color: M.faint }}>策略暴露 · Strategy Exposure</div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-1 mb-2">
            {r.strategyAllocation.map((a) => <div key={a.strategyType} style={{ width: `${a.pct}%`, background: STRAT_HEX[a.strategyType] }} />)}
          </div>
          <div className="flex flex-wrap gap-4">
            {r.strategyAllocation.map((a) => <span key={a.strategyType} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: M.sub }}><span className="w-2 h-2 rounded-sm" style={{ background: STRAT_HEX[a.strategyType] }} />{STRAT_ZH[a.strategyType]} {a.pct.toFixed(1)}%</span>)}
          </div>
        </DCard>
      )}
    </section>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ text }: { text: string }) {
  return <div className="py-12 text-center text-[13px]" style={{ color: M.faint }}>{text}</div>;
}

// ── Explain drawer (unchanged fetch logic, dark restyle) ──────────────────────
export function ExplainDrawer({ strategyType, symbol, onClose }: { strategyType: Strat; symbol: string; onClose: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<{ conclusion?: string; explanationType?: string; reasons?: { code: string; value?: number }[]; risks?: { code: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/strategy/explain?strategyType=${strategyType}&symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((x) => { if (!cancelled) { setD(x); setLoading(false); } })
      .catch(() => { if (!cancelled) { setErr(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [strategyType, symbol]);
  const noExplain = !loading && !err && (!d || d.explanationType === "DATA_INSUFFICIENT");
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto" style={{ background: M.card, borderLeft: `1px solid ${M.border}` }}>
        <div className="sticky top-0 px-5 py-4 flex items-center justify-between z-10" style={{ background: M.card, borderBottom: `1px solid ${M.border}` }}>
          <span className="text-[17px] font-semibold" style={{ color: M.ink }}>{symbol}</span>
          <button onClick={onClose} className="text-[20px] px-1" style={{ color: M.sub }}>×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {loading && <div className="py-8 text-center text-[13px]" style={{ color: M.faint }}>{t("explain.loading")}</div>}
          {err && <div className="py-8 text-center text-[13px]" style={{ color: M.red }}>{t("explain.load_error")}</div>}
          {noExplain && <div className="py-8 text-center text-[13px]" style={{ color: M.faint }}>{t("dash.no_explain")}</div>}
          {d && !loading && !err && !noExplain && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: M.faint }}>{t("explain.conclusion_label")}</span>
                <span className="text-[12px] px-2.5 py-1 rounded-full font-semibold" style={{ background: M.cardHi, color: M.ink, border: `1px solid ${M.border}` }}>{t(`explain.conclusion.${d.conclusion}` as MessageKey)}</span>
              </div>
              {d.reasons && d.reasons.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase mb-1.5" style={{ color: M.sub }}>{t("explain.reasons")}</h4>
                  <ul className="space-y-1">{d.reasons.map((r) => (
                    <li key={r.code} className="flex justify-between text-[12px]"><span style={{ color: M.sub }}>· {t(`explain.reason.${r.code}` as MessageKey)}</span><span className="tabular-nums" style={{ color: M.faint }}>{r.value?.toFixed?.(1)}</span></li>
                  ))}</ul>
                </div>
              )}
              {d.risks && d.risks.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase mb-1.5" style={{ color: M.sub }}>{t("explain.risks")}</h4>
                  <div className="flex flex-wrap gap-1.5">{d.risks.map((r) => (
                    <span key={r.code} className="text-[11px] px-2 py-1 rounded-md" style={{ background: `${M.red}1a`, color: M.red, border: `1px solid ${M.red}33` }}>{t(`explain.risk.${r.code}` as MessageKey)}</span>
                  ))}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
