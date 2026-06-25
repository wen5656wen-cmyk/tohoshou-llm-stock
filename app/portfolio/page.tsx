"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { SnapshotSummary } from "@/app/api/portfolio/snapshots/route";
import type { SnapshotDetail } from "@/app/api/portfolio/snapshots/[date]/route";
import type { SimPortfolioData, SimPositionItem } from "@/app/api/sim-portfolio/route";
import type { AISignalDayStats, SignalStatEntry } from "@/app/api/ai-signal-stats/route";

// ── Watchlist types ────────────────────────────────────────────────────────────

type WlScore = {
  latestClose: number | null;
  realtimePrice: number | null;
  changePct: number | null;
  volume: number | null;
  volumeRatio: number | null;
  turnoverRate: number | null;
  realtimeUpdatedAt: string | null;
  finalScore: number;
  technicalScore: number | null;
  fundamentalScore: number | null;
  effectiveRating: string | null;
  return5d: number | null;
  return20d: number | null;
};

type WatchlistItem = {
  id: number;
  symbol: string;
  name: string;
  nameZh: string | null;
  addedAt: string;
  score: WlScore | null;
};

type BuyTarget = { symbol: string; name: string; nameZh: string | null; price: number };
type SellTarget = SimPositionItem & { currentPrice: number };

type TabKey = "system" | "watchlist";

// ── Helpers ────────────────────────────────────────────────────────────────────

function returnColor(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-400";
}

function fmtPct(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function fmtJpy(v: number | null): string {
  if (v == null) return "—";
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
}

function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}億`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`;
  return v.toLocaleString("ja-JP");
}

function isJSTTradingHours(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const total = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  return (total >= 540 && total <= 690) || (total >= 750 && total <= 930);
}

// ── Rating badge ───────────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-slate-500 text-xs">—</span>;
  const cls =
    rating === "STRONG_BUY"
      ? "bg-emerald-900/60 text-emerald-400"
      : rating === "BUY"
      ? "bg-blue-900/60 text-blue-400"
      : "bg-slate-700 text-slate-400";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{rating}</span>
  );
}

// ── Snapshot Card ──────────────────────────────────────────────────────────────

function SnapshotCard({
  snap,
  t,
}: {
  snap: SnapshotSummary;
  t: (k: MessageKey) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const handleExpand = useCallback(() => {
    if (!expanded && !detail && !detailError) {
      setLoadingDetail(true);
      setDetailError(false);
      fetch(`/api/portfolio/snapshots/${snap.snapshotDate}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: SnapshotDetail) => { setDetail(d); setLoadingDetail(false); })
        .catch(() => { setDetailError(true); setLoadingDetail(false); });
    }
    setExpanded((v) => !v);
  }, [expanded, detail, detailError, snap.snapshotDate]);

  const pnlColor = snap.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlSign = snap.unrealizedPnl >= 0 ? "+" : "";

  return (
    <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 overflow-hidden">
      <div
        className="px-5 py-4 cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={handleExpand}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-white font-semibold text-sm">{snap.snapshotDate} AI組合</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {t("portfolio.snap_invested")}：¥{Math.round(snap.investedAmount).toLocaleString("ja-JP")}
              　{t("portfolio.snap_cash")}：¥{Math.round(snap.cash).toLocaleString("ja-JP")}
            </div>
          </div>
          <span className="text-slate-500 text-xs mt-0.5">{expanded ? "▲" : "▼"}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_total_assets")}</div>
            <div className="text-sm font-semibold text-white tabular-nums">
              ¥{Math.round(snap.totalAssets).toLocaleString("ja-JP")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_pnl")}</div>
            <div className={`text-sm font-semibold tabular-nums ${pnlColor}`}>
              {pnlSign}¥{Math.round(snap.unrealizedPnl).toLocaleString("ja-JP")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_return_pct")}</div>
            <div className={`text-sm font-bold tabular-nums ${pnlColor}`}>
              {pnlSign}{snap.returnPct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_positions")}</div>
            <div className="text-sm font-semibold text-white">{snap.positionCount}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_holding_days")}</div>
            <div className="text-sm font-semibold text-slate-300">
              {snap.holdingDays}{t("portfolio.snap_days_unit")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_topix_return")}</div>
            <div className={`text-sm font-semibold tabular-nums ${returnColor(snap.benchmarkTopixReturnPct)}`}>
              {fmtPct(snap.benchmarkTopixReturnPct)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_alpha")}</div>
            <div className={`text-sm font-bold tabular-nums ${returnColor(snap.alphaVsTopix)}`}>
              {fmtPct(snap.alphaVsTopix)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">vs TOPIX</div>
            <div className="text-sm font-semibold">
              {snap.isOutperformingTopix == null ? (
                <span className="text-slate-500">—</span>
              ) : snap.isOutperformingTopix ? (
                <span className="text-emerald-400 font-bold">{t("portfolio.snap_outperform")}</span>
              ) : (
                <span className="text-red-400 font-bold">{t("portfolio.snap_underperform")}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 text-right">
          <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            {expanded ? t("portfolio.snap_collapse") : t("portfolio.snap_expand")} →
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700/40">
          {loadingDetail ? (
            <div className="p-6 text-center text-slate-500 text-sm animate-pulse">{t("portfolio.snap_loading")}</div>
          ) : detailError ? (
            <div className="p-6 text-center text-red-400 text-sm">
              {t("portfolio.snap_detail_error")}
              <button
                className="ml-3 underline text-red-300 hover:text-red-200"
                onClick={(e) => { e.stopPropagation(); setDetailError(false); setDetail(null); }}
              >
                ↩
              </button>
            </div>
          ) : detail && detail.positions.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">{t("portfolio.snap_no_positions")}</div>
          ) : detail ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 text-slate-400">
                    <th className="text-left py-2 px-4">{t("common.symbol")}</th>
                    <th className="text-left py-2 px-3">{t("common.name")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_entry_price")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_current_price")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_shares")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_entry_amount")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_market_value")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_pos_pnl")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_return_pct")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.positions.map((pos) => {
                    const pc = pos.returnPct == null ? "text-slate-400"
                      : pos.returnPct > 0 ? "text-emerald-400"
                      : pos.returnPct < 0 ? "text-red-400" : "text-slate-400";
                    const ps = pos.unrealizedPnl != null && pos.unrealizedPnl >= 0 ? "+" : "";
                    return (
                      <tr key={pos.id} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-4">
                          <Link href={`/stocks/${encodeURIComponent(pos.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300">
                            {pos.symbol}
                          </Link>
                          {pos.gptRank != null && <div className="text-[10px] text-slate-500">#{pos.gptRank}</div>}
                        </td>
                        <td className="py-2 px-3 text-slate-200 max-w-[120px] truncate">{pos.nameZh ?? pos.name}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-300">¥{pos.entryPrice.toLocaleString("ja-JP")}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-200">
                          {pos.currentPrice != null ? `¥${pos.currentPrice.toLocaleString("ja-JP")}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-300">{pos.shares.toLocaleString("ja-JP")}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-400">¥{Math.round(pos.entryAmount).toLocaleString("ja-JP")}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-200">
                          {pos.marketValue != null ? `¥${Math.round(pos.marketValue).toLocaleString("ja-JP")}` : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-medium ${pc}`}>
                          {pos.unrealizedPnl != null ? `${ps}¥${Math.round(pos.unrealizedPnl).toLocaleString("ja-JP")}` : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${pc}`}>
                          {pos.returnPct != null ? `${pos.returnPct >= 0 ? "+" : ""}${pos.returnPct.toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-slate-700/40 flex flex-wrap gap-6 text-xs text-slate-500">
                <span>{t("portfolio.snap_invested")}：<span className="text-slate-200 font-medium">¥{Math.round(detail.investedAmount).toLocaleString("ja-JP")}</span></span>
                <span>{t("portfolio.snap_cash")}：<span className="text-slate-400">¥{Math.round(detail.cash).toLocaleString("ja-JP")}</span></span>
                <span>{t("portfolio.snap_total_assets")}：<span className={detail.unrealizedPnl >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>¥{Math.round(detail.totalAssets).toLocaleString("ja-JP")}</span></span>
                <span className="ml-auto italic">{t("portfolio.simulate_disclaimer")}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── AI Signal Stats Panel ─────────────────────────────────────────────────────

function SignalCard({
  label,
  stat,
  t,
  accent,
}: {
  label: string;
  stat: SignalStatEntry | null;
  t: (k: MessageKey) => string;
  accent: string;
}) {
  if (!stat) return null;

  const fmtRate = (v: number | null) =>
    v == null ? t("portfolio.signal_accumulating") : `${v.toFixed(1)}%`;

  const fmtAvg = (v: number | null) => {
    if (v == null) return "—";
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  };

  return (
    <div className={`bg-[#1a2035] rounded-xl border ${accent} p-4 flex flex-col gap-3`}>
      <div className="text-xs font-bold text-slate-300 uppercase tracking-wide">{label}</div>

      <div className="text-3xl font-bold text-white tabular-nums">
        {stat.recommendationCount}
        <span className="text-sm font-normal text-slate-400 ml-1">{t("portfolio.signal_rec_count")}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{t("portfolio.signal_today_win")}</span>
          <div className="text-right">
            <span className={`text-sm font-bold tabular-nums ${
              stat.todayWinRate == null ? "text-slate-500"
              : stat.todayWinRate >= 60 ? "text-emerald-400"
              : stat.todayWinRate >= 50 ? "text-yellow-400"
              : "text-red-400"
            }`}>
              {fmtRate(stat.todayWinRate)}
            </span>
            {stat.validTodayCount > 0 && (
              <div className="text-[10px] text-slate-500">{stat.todayWinCount}/{stat.validTodayCount}</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{t("portfolio.signal_7d_win")}</span>
          <div className="text-right">
            <span className={`text-sm font-bold tabular-nums ${
              stat.win7dRate == null ? "text-slate-500"
              : stat.win7dRate >= 60 ? "text-emerald-400"
              : stat.win7dRate >= 50 ? "text-yellow-400"
              : "text-red-400"
            }`}>
              {stat.valid7dCount === 0 ? t("portfolio.signal_accumulating") : fmtRate(stat.win7dRate)}
            </span>
            {stat.valid7dCount > 0 && (
              <div className="text-[10px] text-slate-500">{stat.win7dCount}/{stat.valid7dCount}</div>
            )}
          </div>
        </div>

        <div className="pt-1 border-t border-slate-700/40 flex justify-between text-[10px] text-slate-500">
          <span>{t("portfolio.signal_avg_today")} <span className={returnColor(stat.avgTodayReturnPct)}>{fmtAvg(stat.avgTodayReturnPct)}</span></span>
          <span>{t("portfolio.signal_avg_7d")} <span className={stat.valid7dCount === 0 ? "text-slate-500" : returnColor(stat.avg7dReturnPct)}>{stat.valid7dCount === 0 ? "—" : fmtAvg(stat.avg7dReturnPct)}</span></span>
        </div>
      </div>
    </div>
  );
}

function AISignalStatsPanel({ t }: { t: (k: MessageKey) => string }) {
  const [stats, setStats] = useState<AISignalDayStats[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai-signal-stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: AISignalDayStats[]) => { setStats(d); setLoading(false); })
      .catch(() => { setStats([]); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 p-5 animate-pulse">
        <div className="h-4 bg-slate-700/50 rounded w-32 mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-36 bg-slate-800/50 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const today = stats?.[0] ?? null;
  const hasToday = today != null;

  return (
    <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
      <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{t("portfolio.signal_title")}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t("portfolio.signal_updated")}</p>
        </div>
        {hasToday && (
          <span className="text-[10px] text-slate-500 tabular-nums">{today.tradeDate}</span>
        )}
      </div>

      {!hasToday ? (
        <div className="p-10 text-center text-slate-500 text-sm">{t("portfolio.signal_no_data")}</div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Today's cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SignalCard
              label={t("portfolio.signal_strong_buy")}
              stat={today.STRONG_BUY}
              t={t}
              accent="border-emerald-800/50"
            />
            <SignalCard
              label={t("portfolio.signal_buy")}
              stat={today.BUY}
              t={t}
              accent="border-blue-800/50"
            />
            <SignalCard
              label={t("portfolio.signal_all_buy")}
              stat={today.ALL_BUY}
              t={t}
              accent="border-slate-700/40"
            />
          </div>

          {/* History table (last 30 days) */}
          {stats && stats.length > 1 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-colors py-1 list-none flex items-center gap-1">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                {t("portfolio.signal_updated")}
              </summary>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-700/40">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/40 text-slate-400">
                      <th className="text-left py-2 px-3">{t("table.date")}</th>
                      <th className="text-center py-2 px-2" colSpan={2}>{t("portfolio.signal_strong_buy")}</th>
                      <th className="text-center py-2 px-2" colSpan={2}>{t("portfolio.signal_buy")}</th>
                      <th className="text-center py-2 px-2" colSpan={2}>{t("portfolio.signal_all_buy")}</th>
                    </tr>
                    <tr className="border-b border-slate-700/30 text-slate-500 text-[10px]">
                      <th className="py-1 px-3" />
                      <th className="py-1 px-2">n</th><th className="py-1 px-2">{t("portfolio.signal_today_win")}</th>
                      <th className="py-1 px-2">n</th><th className="py-1 px-2">{t("portfolio.signal_today_win")}</th>
                      <th className="py-1 px-2">n</th><th className="py-1 px-2">{t("portfolio.signal_today_win")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((day) => {
                      const fmt = (s: SignalStatEntry | null) =>
                        s == null ? ["—", "—"] : [
                          String(s.recommendationCount),
                          s.todayWinRate != null ? `${s.todayWinRate.toFixed(0)}%` : "—",
                        ];
                      const [sbn, sbr] = fmt(day.STRONG_BUY);
                      const [bn, br] = fmt(day.BUY);
                      const [an, ar] = fmt(day.ALL_BUY);
                      const rateColor = (r: string) =>
                        r === "—" ? "text-slate-500"
                        : parseInt(r) >= 60 ? "text-emerald-400"
                        : parseInt(r) >= 50 ? "text-yellow-400"
                        : "text-red-400";
                      return (
                        <tr key={day.tradeDate} className="border-b border-slate-700/20 hover:bg-slate-800/20">
                          <td className="py-1.5 px-3 font-mono text-slate-400">{day.tradeDate}</td>
                          <td className="py-1.5 px-2 text-center text-slate-300">{sbn}</td>
                          <td className={`py-1.5 px-2 text-center font-semibold ${rateColor(sbr)}`}>{sbr}</td>
                          <td className="py-1.5 px-2 text-center text-slate-300">{bn}</td>
                          <td className={`py-1.5 px-2 text-center font-semibold ${rateColor(br)}`}>{br}</td>
                          <td className="py-1.5 px-2 text-center text-slate-300">{an}</td>
                          <td className={`py-1.5 px-2 text-center font-semibold ${rateColor(ar)}`}>{ar}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Snapshots Panel ────────────────────────────────────────────────────────────

function SnapshotsPanel({ t }: { t: (k: MessageKey) => string }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio/snapshots")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: SnapshotSummary[]) => { setSnapshots(d); setLoading(false); })
      .catch(() => { setSnapshots([]); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-xl h-32" />
        ))}
      </div>
    );
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 p-14 text-center">
        <div className="text-slate-400 text-sm">{t("portfolio.snap_no_data")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1 mb-1">
        <span className="text-sm font-semibold text-white">{t("portfolio.snap_section_title")}</span>
        <span className="text-xs text-slate-500">{t("portfolio.tab_snapshots_desc")}</span>
      </div>
      {snapshots.length === 1 && (
        <div className="text-xs text-slate-500 bg-slate-800/40 rounded-lg px-4 py-2 border border-slate-700/30">
          {t("portfolio.snap_only_one")}
        </div>
      )}
      {snapshots.map((s) => (
        <SnapshotCard key={s.id} snap={s} t={t} />
      ))}
    </div>
  );
}

// ── Buy Modal ──────────────────────────────────────────────────────────────────

const LOT_PRESETS = [100, 200, 300, 500, 1000];

function BuyModal({
  target,
  cash,
  onClose,
  onSuccess,
  t,
}: {
  target: BuyTarget;
  cash: number;
  onClose: () => void;
  onSuccess: () => void;
  t: (k: MessageKey) => string;
}) {
  const [shares, setShares] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState(target.price);

  // Refresh price once on mount so BuyModal always shows latest quote
  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((items: WatchlistItem[]) => {
        const it = items.find((i) => i.symbol === target.symbol);
        const p = it?.score?.realtimePrice ?? it?.score?.latestClose;
        if (p != null) setLivePrice(p);
      })
      .catch(() => {});
  }, [target.symbol]);

  const amount = livePrice * shares;
  const cashAfter = cash - amount;
  const canAfford = cashAfter >= 0;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sim-portfolio/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: target.symbol, shares, price: livePrice, name: target.name, nameZh: target.nameZh }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "error");
        return;
      }
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Dialog — always centered in viewport regardless of scroll position */}
      <div
        className="fixed z-[9999] w-[340px] max-w-[92vw] bg-[#1a2035] rounded-2xl border border-slate-700/40 shadow-2xl overflow-y-auto"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-base font-bold text-white">{t("portfolio.buy_modal_title")}</div>
              <div className="text-xs text-slate-400 mt-0.5">{target.symbol} · {target.nameZh ?? target.name}</div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">{t("portfolio.wl_realtime_price")}</span>
              <span className="text-white font-bold tabular-nums">¥{livePrice.toLocaleString("ja-JP")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">{t("portfolio.sim_current_cash")}</span>
              <span className="text-slate-200 tabular-nums">{fmtJpy(cash)}</span>
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1.5">{t("portfolio.buy_qty")}</div>
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {LOT_PRESETS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setShares(n)}
                    className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                      shares === n ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={shares}
                min={100}
                step={100}
                onChange={(e) => {
                  const v = Math.max(100, Math.round(parseInt(e.target.value || "100", 10) / 100) * 100);
                  setShares(isNaN(v) ? 100 : v);
                }}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm tabular-nums focus:outline-none focus:border-blue-500"
              />
              <div className="text-[10px] text-slate-500 mt-1">1{t("portfolio.sim_shares")} = 100</div>
            </div>

            <div className="bg-slate-800/60 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">{t("portfolio.buy_amount_est")}</span>
                <span className="tabular-nums text-white font-medium">{fmtJpy(amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t("portfolio.buy_cash_after")}</span>
                <span className={`tabular-nums font-medium ${canAfford ? "text-slate-200" : "text-red-400"}`}>
                  {fmtJpy(cashAfter)}
                </span>
              </div>
            </div>

            {error && <div className="text-xs text-red-400 text-center">{error}</div>}

            <button
              onClick={handleConfirm}
              disabled={!canAfford || submitting}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-colors
                bg-emerald-600 hover:bg-emerald-700 text-white
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!canAfford ? t("portfolio.buy_no_cash") : submitting ? "..." : t("portfolio.buy_confirm")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sell Modal ─────────────────────────────────────────────────────────────────

function SellModal({
  target,
  onClose,
  onSuccess,
  t,
}: {
  target: SellTarget;
  onClose: () => void;
  onSuccess: () => void;
  t: (k: MessageKey) => string;
}) {
  const maxShares = target.shares;
  const [shares, setShares] = useState(Math.min(100, maxShares));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = target.currentPrice;
  const amount = price * shares;
  const estPnl = (price - target.avgCost) * shares;

  const allPctPresets: [string, number][] = [
    ["25%", Math.floor(maxShares * 0.25 / 100) * 100],
    ["50%", Math.floor(maxShares * 0.5 / 100) * 100],
    ["75%", Math.floor(maxShares * 0.75 / 100) * 100],
  ];
  const pctPresets = allPctPresets.filter(([, v]) => v >= 100);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sim-portfolio/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: target.symbol, shares, price }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "error");
        return;
      }
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed z-[9999] w-[340px] max-w-[92vw] bg-[#1a2035] rounded-2xl border border-slate-700/40 shadow-2xl overflow-y-auto"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-base font-bold text-white">{t("portfolio.sell_modal_title")}</div>
            <div className="text-xs text-slate-400 mt-0.5">{target.symbol} · {target.nameZh ?? target.name}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">{t("portfolio.wl_realtime_price")}</span>
            <span className="text-white font-bold tabular-nums">¥{price.toLocaleString("ja-JP")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">{t("portfolio.sim_shares")}</span>
            <span className="text-slate-200 tabular-nums">{maxShares.toLocaleString("ja-JP")}</span>
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-1.5">{t("portfolio.sell_qty")}</div>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {pctPresets.map(([label, v]) => (
                <button
                  key={label}
                  onClick={() => setShares(v)}
                  className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                    shares === v ? "bg-red-700 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShares(maxShares)}
                className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                  shares === maxShares ? "bg-red-700 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {t("portfolio.sell_all")}
              </button>
            </div>
            <input
              type="number"
              value={shares}
              min={100}
              max={maxShares}
              step={100}
              onChange={(e) => {
                const raw = parseInt(e.target.value || "100", 10);
                const v = Math.min(maxShares, Math.max(100, Math.round(raw / 100) * 100));
                setShares(isNaN(v) ? 100 : v);
              }}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm tabular-nums focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="bg-slate-800/60 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">{t("portfolio.sell_amount_est")}</span>
              <span className="tabular-nums text-white font-medium">{fmtJpy(amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t("portfolio.sell_pnl_est")}</span>
              <span className={`tabular-nums font-semibold ${returnColor(estPnl)}`}>
                {estPnl >= 0 ? "+" : ""}{fmtJpy(estPnl)}
              </span>
            </div>
          </div>

          {error && <div className="text-xs text-red-400 text-center">{error}</div>}

          <button
            onClick={handleConfirm}
            disabled={shares > maxShares || shares < 100 || submitting}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-colors
              bg-red-600 hover:bg-red-700 text-white
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "..." : t("portfolio.sell_confirm")}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

// ── Sim Portfolio Panel ────────────────────────────────────────────────────────

function SimPortfolioPanel({
  data,
  loading,
  onSell,
  onRefresh,
  t,
}: {
  data: SimPortfolioData | null;
  loading: boolean;
  onSell: (pos: SellTarget) => void;
  onRefresh: () => void;
  t: (k: MessageKey) => string;
}) {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!window.confirm(t("portfolio.sim_reset_confirm"))) return;
    setResetting(true);
    await fetch("/api/sim-portfolio", { method: "DELETE" }).catch(() => null);
    setResetting(false);
    onRefresh();
  };

  if (loading && !data) {
    return <div className="bg-slate-800/40 rounded-xl h-32 animate-pulse" />;
  }

  if (!data) return null;

  const totalPnlColor = returnColor(data.totalPnl);

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{t("portfolio.sim_title")}</h2>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="text-[11px] text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            {t("portfolio.sim_reset")}
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">{t("portfolio.sim_total_assets")}</div>
            <div className="text-lg font-bold text-white tabular-nums">{fmtJpy(data.totalAssets)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{t("portfolio.sim_initial_cash")} {fmtJpy(data.initialCash)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">{t("portfolio.sim_current_cash")}</div>
            <div className="text-lg font-semibold text-slate-200 tabular-nums">{fmtJpy(data.currentCash)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">{t("portfolio.sim_unrealized_pnl")}</div>
            <div className={`text-lg font-semibold tabular-nums ${returnColor(data.unrealizedPnl)}`}>
              {data.unrealizedPnl >= 0 ? "+" : ""}{fmtJpy(data.unrealizedPnl)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">{t("portfolio.sim_return_pct")}</div>
            <div className={`text-2xl font-bold tabular-nums ${totalPnlColor}`}>
              {data.returnPct >= 0 ? "+" : ""}{data.returnPct.toFixed(2)}%
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {t("portfolio.sim_realized_pnl")} {data.realizedPnl >= 0 ? "+" : ""}{fmtJpy(data.realizedPnl)}
            </div>
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <h2 className="text-base font-semibold text-white">{t("portfolio.sim_holdings_title")}</h2>
        </div>
        {data.positions.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">{t("portfolio.sim_no_holdings")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/40 text-xs text-slate-400">
                  <th className="text-left py-2.5 px-4">{t("common.symbol")}</th>
                  <th className="text-right py-2.5 px-3">{t("portfolio.sim_avg_cost")}</th>
                  <th className="text-right py-2.5 px-3">{t("portfolio.snap_current_price")}</th>
                  <th className="text-right py-2.5 px-3">{t("portfolio.sim_shares")}</th>
                  <th className="text-right py-2.5 px-3">{t("portfolio.sim_market_value")}</th>
                  <th className="text-right py-2.5 px-3">{t("portfolio.sim_unrealized")}</th>
                  <th className="text-right py-2.5 px-3">{t("portfolio.snap_return_pct")}</th>
                  <th className="py-2.5 px-3" />
                </tr>
              </thead>
              <tbody>
                {data.positions.map((pos) => (
                  <tr key={pos.id} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <Link href={`/stocks/${encodeURIComponent(pos.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300 text-xs font-medium">
                        {pos.symbol}
                      </Link>
                      <div className="text-[10px] text-slate-500 truncate max-w-[90px]">{pos.nameZh ?? pos.name}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-300">¥{pos.avgCost.toLocaleString("ja-JP")}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-200">
                      {pos.currentPrice != null ? `¥${pos.currentPrice.toLocaleString("ja-JP")}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-300">{pos.shares.toLocaleString("ja-JP")}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-200">
                      {pos.marketValue != null ? `¥${Math.round(pos.marketValue).toLocaleString("ja-JP")}` : "—"}
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium ${returnColor(pos.unrealizedPnl)}`}>
                      {pos.unrealizedPnl != null
                        ? `${pos.unrealizedPnl >= 0 ? "+" : ""}¥${Math.round(pos.unrealizedPnl).toLocaleString("ja-JP")}`
                        : "—"}
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-semibold ${returnColor(pos.returnPct)}`}>
                      {pos.returnPct != null ? `${pos.returnPct >= 0 ? "+" : ""}${pos.returnPct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => pos.currentPrice != null && onSell({ ...pos, currentPrice: pos.currentPrice })}
                        disabled={pos.currentPrice == null}
                        className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/70 transition-colors disabled:opacity-30"
                      >
                        {t("portfolio.sim_sell")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade history */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <h2 className="text-base font-semibold text-white">{t("portfolio.sim_trades_title")}</h2>
        </div>
        {data.trades.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">{t("portfolio.sim_no_trades")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/40 text-slate-400">
                  <th className="text-left py-2 px-4">{t("table.date")}</th>
                  <th className="text-left py-2 px-3">{t("portfolio.trade_action")}</th>
                  <th className="text-left py-2 px-3">{t("common.symbol")}</th>
                  <th className="text-right py-2 px-3">{t("portfolio.sim_shares")}</th>
                  <th className="text-right py-2 px-3">{t("portfolio.trade_price")}</th>
                  <th className="text-right py-2 px-3">{t("portfolio.trade_amount")}</th>
                  <th className="text-right py-2 px-3">{t("portfolio.trade_pnl")}</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((tr) => (
                  <tr key={tr.id} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-4 font-mono text-slate-400">
                      {new Date(tr.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`font-bold ${tr.action === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                        {t(tr.action === "BUY" ? "portfolio.sim_buy" : "portfolio.sim_sell")}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <Link href={`/stocks/${encodeURIComponent(tr.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300">
                        {tr.symbol}
                      </Link>
                      <div className="text-[10px] text-slate-500 truncate max-w-[80px]">{tr.nameZh ?? tr.name}</div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-300">{tr.shares.toLocaleString("ja-JP")}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-300">¥{tr.price.toLocaleString("ja-JP")}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-200">¥{Math.round(tr.amount).toLocaleString("ja-JP")}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-medium ${returnColor(tr.realizedPnl)}`}>
                      {tr.realizedPnl != null
                        ? `${tr.realizedPnl >= 0 ? "+" : ""}¥${Math.round(tr.realizedPnl).toLocaleString("ja-JP")}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Watchlist Card ─────────────────────────────────────────────────────────────

function WatchlistCard({
  item, t, onDelete, onBuy,
}: {
  item: WatchlistItem;
  t: (k: MessageKey) => string;
  onDelete: (symbol: string) => void;
  onBuy: (target: BuyTarget) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const s = item.score;
  const displayPrice = s?.realtimePrice ?? s?.latestClose ?? null;
  const changePct = s?.changePct ?? null;

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`${item.symbol}`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/watchlist?symbol=${encodeURIComponent(item.symbol)}`, { method: "DELETE" });
      onDelete(item.symbol);
    } finally {
      setDeleting(false);
    }
  }, [item.symbol, onDelete]);

  const updatedTime = s?.realtimeUpdatedAt
    ? new Date(s.realtimeUpdatedAt).toLocaleTimeString("ja-JP", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Tokyo",
      })
    : null;

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/40 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 mr-1">
          <Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300 text-xs font-bold block leading-tight">
            {item.symbol}
          </Link>
          <div className="text-[11px] text-slate-300 truncate leading-tight">{item.nameZh ?? item.name}</div>
        </div>
        <RatingBadge rating={s?.effectiveRating ?? null} />
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="text-[9px] text-slate-500 leading-none">{t("portfolio.wl_realtime_price")}</div>
        <div className="text-[18px] leading-[1.1] font-bold text-white tabular-nums">
          {displayPrice != null ? `¥${displayPrice.toLocaleString("ja-JP")}` : "—"}
        </div>
        <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0 mt-0.5 text-[13px] tabular-nums">
          <span className="text-[9px] text-slate-500">{t("portfolio.wl_1d_change")}</span>
          <span className={`font-semibold ${returnColor(changePct)}`}>{fmtPct(changePct)}</span>
          <span className="text-slate-600 text-[10px]">│</span>
          <span className="text-[9px] text-slate-500">5D</span>
          <span className={returnColor(s?.return5d ?? null)}>{fmtPct(s?.return5d ?? null)}</span>
          <span className="text-slate-600 text-[10px]">│</span>
          <span className="text-[9px] text-slate-500">20D</span>
          <span className={returnColor(s?.return20d ?? null)}>{fmtPct(s?.return20d ?? null)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
        <span>{t("portfolio.wl_vol")} <span className="text-slate-300">{fmtVol(s?.volume ?? null)}</span></span>
        <span>{t("portfolio.wl_vol_ratio")} <span className="text-slate-300">{s?.volumeRatio != null ? s.volumeRatio.toFixed(2) : "—"}</span></span>
        <span>{t("portfolio.wl_turnover")} <span className="text-slate-300">{s?.turnoverRate != null ? `${s.turnoverRate.toFixed(1)}%` : "—"}</span></span>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex gap-2 text-slate-500">
          <span>AI <span className="text-white font-semibold">{s ? s.finalScore.toFixed(1) : "—"}</span></span>
          <span>技 <span className="text-slate-300">{s?.technicalScore ?? "—"}</span></span>
          <span>基 <span className="text-slate-300">{s?.fundamentalScore ?? "—"}</span></span>
        </div>
        {updatedTime && <span className="text-slate-600">{updatedTime}</span>}
      </div>

      <div className="flex items-center justify-between pt-1.5 border-t border-slate-700/30 mt-auto">
        <div className="flex items-center gap-2">
          <Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
            {t("portfolio.wl_detail_btn")} →
          </Link>
          <button
            onClick={() => displayPrice != null && onBuy({ symbol: item.symbol, name: item.name, nameZh: item.nameZh, price: displayPrice })}
            disabled={displayPrice == null}
            className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/70 transition-colors disabled:opacity-30"
          >
            {t("portfolio.sim_buy")}
          </button>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {t("portfolio.wl_delete_btn")}
        </button>
      </div>
    </div>
  );
}

// ── Watchlist Panel ────────────────────────────────────────────────────────────

function WatchlistPanel({
  items, loading, t, onRefresh,
}: {
  items: WatchlistItem[] | null;
  loading: boolean;
  t: (k: MessageKey) => string;
  onRefresh: () => void;
}) {
  const [displayItems, setDisplayItems] = useState<WatchlistItem[]>(items ?? []);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [simData, setSimData] = useState<SimPortfolioData | null>(null);
  const [simLoading, setSimLoading] = useState(true);

  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);
  const [sellTarget, setSellTarget] = useState<SellTarget | null>(null);

  useEffect(() => {
    if (items != null) {
      setDisplayItems(items);
      if (!loading) setLastRefreshed(new Date());
    }
  }, [items, loading]);

  // Auto-refresh watchlist during JST trading hours
  useEffect(() => {
    const id = setInterval(() => { if (isJSTTradingHours()) onRefresh(); }, 60_000);
    return () => clearInterval(id);
  }, [onRefresh]);

  const fetchSim = useCallback(() => {
    setSimLoading(true);
    fetch("/api/sim-portfolio")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: SimPortfolioData) => { setSimData(d); setSimLoading(false); })
      .catch(() => setSimLoading(false));
  }, []);

  useEffect(() => { fetchSim(); }, [fetchSim]);

  const handleDelete = useCallback((symbol: string) => {
    setDisplayItems((prev) => prev.filter((i) => i.symbol !== symbol));
  }, []);

  const handleBuySuccess = useCallback(() => {
    setBuyTarget(null);
    fetchSim();
  }, [fetchSim]);

  const handleSellSuccess = useCallback(() => {
    setSellTarget(null);
    fetchSim();
  }, [fetchSim]);

  if (loading && displayItems.length === 0) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-slate-800/50 rounded-xl h-48" />
        <div className="bg-slate-800/50 rounded-xl h-64" />
      </div>
    );
  }

  if (!loading && displayItems.length === 0 && items != null) {
    return (
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 p-14 text-center">
        <div className="text-4xl mb-4 text-slate-600">☆</div>
        <div className="text-white font-medium mb-2">{t("portfolio.wl_empty_title")}</div>
        <p className="text-slate-500 text-xs mb-6">{t("portfolio.tab_watchlist_desc")}</p>
        <Link
          href="/stocks"
          className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t("portfolio.wl_empty_btn")} →
        </Link>
      </div>
    );
  }

  const inTradingHours = isJSTTradingHours();

  return (
    <div className="space-y-6">
      {/* Modals */}
      {buyTarget && simData && (
        <BuyModal
          target={buyTarget}
          cash={simData.currentCash}
          onClose={() => setBuyTarget(null)}
          onSuccess={handleBuySuccess}
          t={t}
        />
      )}
      {sellTarget && (
        <SellModal
          target={sellTarget}
          onClose={() => setSellTarget(null)}
          onSuccess={handleSellSuccess}
          t={t}
        />
      )}

      {/* ── A. 自选股实时监控卡片 ─────────────────────────────────────────────── */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-white">{t("portfolio.wl_realtime_title")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t("portfolio.wl_realtime_desc")}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {inTradingHours && (
                <span className="text-[10px] text-emerald-500 bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-800/40">
                  {t("portfolio.wl_auto_refreshing")}
                </span>
              )}
              {lastRefreshed && (
                <span className="text-[10px] text-slate-600">
                  {lastRefreshed.toLocaleTimeString("zh-CN", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                onClick={onRefresh}
                disabled={loading}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 px-2 py-1 rounded bg-blue-900/20 hover:bg-blue-900/40 transition-colors"
              >
                ↻
              </button>
            </div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {displayItems.map((item) => (
            <WatchlistCard
              key={item.symbol}
              item={item}
              t={t}
              onDelete={handleDelete}
              onBuy={setBuyTarget}
            />
          ))}
        </div>
      </div>

      {/* ── B. 我的模拟账户 ───────────────────────────────────────────────────── */}
      <SimPortfolioPanel
        data={simData}
        loading={simLoading}
        onSell={setSellTarget}
        onRefresh={fetchSim}
        t={t}
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<TabKey>("system");
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[] | null>(null);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);

  const fetchWatchlist = useCallback(() => {
    setLoadingWatchlist(true);
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: WatchlistItem[]) => { setWatchlistItems(d); setWatchlistLoaded(true); setLoadingWatchlist(false); })
      .catch(() => { setWatchlistItems([]); setWatchlistLoaded(true); setLoadingWatchlist(false); });
  }, []);

  useEffect(() => {
    if (activeTab === "watchlist" && !watchlistLoaded) fetchWatchlist();
  }, [activeTab, watchlistLoaded, fetchWatchlist]);

  const TABS: { key: TabKey; label: MessageKey }[] = [
    { key: "system",    label: "portfolio.tab_system"    },
    { key: "watchlist", label: "portfolio.tab_watchlist" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">{t("portfolio.ai_title")}</h1>
      </div>

      <div className="flex border-b border-slate-700/40 mb-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === key ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t(label)}
            {activeTab === key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      <div className="px-1 py-3 mb-5">
        <p className="text-xs text-slate-500 leading-relaxed">
          {activeTab === "system" ? t("portfolio.tab_system_desc") : t("portfolio.tab_watchlist_desc")}
        </p>
      </div>

      {activeTab === "system" && (
        <div className="space-y-6">
          <AISignalStatsPanel t={t} />
          <SnapshotsPanel t={t} />
        </div>
      )}

      {activeTab === "watchlist" && (
        <WatchlistPanel items={watchlistItems} loading={loadingWatchlist} t={t} onRefresh={fetchWatchlist} />
      )}

    </div>
  );
}
