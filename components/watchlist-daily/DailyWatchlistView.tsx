"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Apple dashboard palette (local — matches lib/design-tokens COLORS)
const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A", purple: "#5856D6",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC", bg: "#FAFAFA",
};

type Item = {
  id: number; symbol: string; name: string | null; recommendation: string;
  rank: number | null; score: number | null;
  entryPrice: number | null; currentPrice: number | null;
  changePct: number | null; returnPct: number | null;
  status: string; isStarred: boolean; isMuted: boolean; isFocus: boolean; note: string | null;
};
type Leader = { symbol: string; name: string | null; returnPct: number } | null;
type Stats = {
  total: number; up: number; down: number; flat: number;
  avgReturnPct: number | null; avgChangePct: number | null;
  topWinner: Leader; topLoser: Leader;
  strongBuy: { count: number; avgReturnPct: number | null };
  buy: { count: number; avgReturnPct: number | null };
};
type Resp = { date: string; availableDates: string[]; items: Item[]; stats: Stats; generatedAt: string };

const recMeta: Record<string, { label: string; color: string }> = {
  STRONG_BUY: { label: "强烈买入", color: C.red },
  BUY: { label: "买入", color: C.amber },
};
const fmtJpy = (n: number | null) => (n == null ? "—" : `¥${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const fmtPct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const retColor = (n: number | null) => (n == null ? C.faint : n > 0 ? C.green : n < 0 ? C.red : C.sub);

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="dash-card p-4">
      <div className="text-[11px] font-medium" style={{ color: C.faint }}>{label}</div>
      <div className="text-[22px] font-semibold tabular-nums mt-1" style={{ color: color ?? C.ink }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: C.sub }}>{sub}</div>}
    </div>
  );
}

export default function DailyWatchlistView() {
  const [data, setData] = useState<Resp | null>(null);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editNote, setEditNote] = useState<{ id: number; text: string } | null>(null);

  const load = useCallback(async (d?: string) => {
    setLoading(true);
    try {
      const q = d ? `?date=${encodeURIComponent(d)}` : "";
      const r = await fetch(`/api/watchlist/daily${q}`);
      const j: Resp = await r.json();
      setData(j);
      setDate(j.date);
    } catch { /* keep prior */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/watchlist/daily/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      await load(date);
    } finally { setBusy(false); }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      await fetch(`/api/watchlist/daily/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await load(); // reload latest
    } finally { setBusy(false); }
  };

  const stats = data?.stats;
  const items = data?.items ?? [];

  return (
    <div className="min-h-screen dash-font" style={{ background: C.bg }}>
      <div className="mx-auto max-w-[1600px] px-5 lg:px-8 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold" style={{ color: C.ink }}>每日 AI 关注池</h1>
            <p className="text-[12px] mt-0.5" style={{ color: C.faint }}>
              每日 AI 推荐中 强烈买入 / 买入 的股票，按日期独立留存并持续追踪表现
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={date}
              onChange={(e) => { setDate(e.target.value); load(e.target.value); }}
              className="h-9 px-3 rounded-full text-[13px] font-medium bg-white"
              style={{ border: `1px solid ${C.line}`, color: C.ink }}
            >
              {(data?.availableDates ?? []).length === 0 && <option value={date}>{date || "—"}</option>}
              {(data?.availableDates ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={() => load(date)} disabled={busy || loading}
              className="h-9 px-4 rounded-full text-[13px] font-semibold bg-white disabled:opacity-50"
              style={{ border: `1px solid ${C.line}`, color: C.blue }}>刷新</button>
            <button onClick={regenerate} disabled={busy}
              className="h-9 px-4 rounded-full text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: C.blue }}>生成今日关注池</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <StatCard label="当日关注" value={String(stats?.total ?? 0)} sub="STRONG_BUY / BUY" />
          <StatCard label="上涨" value={String(stats?.up ?? 0)} color={C.green} />
          <StatCard label="下跌" value={String(stats?.down ?? 0)} color={C.red} />
          <StatCard label="平均推荐后涨跌" value={fmtPct(stats?.avgReturnPct ?? null)} color={retColor(stats?.avgReturnPct ?? null)} />
          <StatCard label="Top Winner" value={stats?.topWinner ? fmtPct(stats.topWinner.returnPct) : "—"}
            sub={stats?.topWinner?.symbol} color={C.green} />
          <StatCard label="Top Loser" value={stats?.topLoser ? fmtPct(stats.topLoser.returnPct) : "—"}
            sub={stats?.topLoser?.symbol} color={C.red} />
          <StatCard label="强烈买入 表现" value={fmtPct(stats?.strongBuy.avgReturnPct ?? null)}
            sub={`${stats?.strongBuy.count ?? 0} 只`} color={retColor(stats?.strongBuy.avgReturnPct ?? null)} />
          <StatCard label="买入 表现" value={fmtPct(stats?.buy.avgReturnPct ?? null)}
            sub={`${stats?.buy.count ?? 0} 只`} color={retColor(stats?.buy.avgReturnPct ?? null)} />
        </div>

        {/* Table */}
        <div className="dash-card overflow-hidden">
          <div className="px-4 py-3 text-[13px] font-semibold" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
            表现概览 · {date}
          </div>
          {loading ? (
            <div className="p-10 text-center text-[13px]" style={{ color: C.faint }}><span className="animate-pulse">加载中…</span></div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-[13px]" style={{ color: C.faint }}>该日期暂无关注池数据（非交易日或推荐尚未生成）</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: C.faint, borderBottom: `1px solid ${C.line}` }} className="text-[11px]">
                    {["排名", "股票", "推荐等级", "AI评分", "推荐价", "当前价", "今日涨跌", "推荐后涨跌", "状态", "操作"].map((h, i) => (
                      <th key={h} className={`px-3 py-2.5 font-medium whitespace-nowrap ${i >= 3 && i <= 7 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const rm = recMeta[it.recommendation] ?? { label: it.recommendation, color: C.sub };
                    const muted = it.isMuted;
                    return (
                      <tr key={it.id} style={{ borderBottom: `1px solid ${C.line}`, opacity: muted ? 0.5 : 1 }} className="hover:bg-[#F7F7F9]">
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: C.sub }}>{it.rank ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/stocks/${encodeURIComponent(it.symbol)}`} className="font-semibold hover:underline" style={{ color: C.ink }}>
                            {it.name ?? it.symbol}
                          </Link>
                          <span className="ml-1.5 text-[11px] tabular-nums" style={{ color: C.faint }}>{it.symbol}</span>
                          {it.isFocus && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: C.purple, background: `${C.purple}14` }}>重点</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: rm.color, background: `${rm.color}14` }}>{rm.label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: C.ink }}>{it.score != null ? it.score.toFixed(0) : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: C.sub }}>{fmtJpy(it.entryPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: C.ink }}>{fmtJpy(it.currentPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: retColor(it.changePct) }}>{fmtPct(it.changePct)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: retColor(it.returnPct) }}>{fmtPct(it.returnPct)}</td>
                        <td className="px-3 py-2.5 text-[11px]" style={{ color: muted ? C.faint : C.green }}>{muted ? "已取消" : "关注中"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button title="加星" onClick={() => patch(it.id, { isStarred: !it.isStarred })} disabled={busy}
                              className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.isStarred ? `${C.amber}1A` : "#F2F2F5", color: it.isStarred ? C.amber : C.faint }}>★</button>
                            <button title="重点观察" onClick={() => patch(it.id, { isFocus: !it.isFocus })} disabled={busy}
                              className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.isFocus ? `${C.purple}1A` : "#F2F2F5", color: it.isFocus ? C.purple : C.faint }}>◎</button>
                            <button title="备注" onClick={() => setEditNote({ id: it.id, text: it.note ?? "" })} disabled={busy}
                              className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.note ? `${C.blue}1A` : "#F2F2F5", color: it.note ? C.blue : C.faint }}>✎</button>
                            <button onClick={() => patch(it.id, { isMuted: !muted })} disabled={busy}
                              className="h-7 px-2.5 rounded-lg text-[11px] font-medium" style={{ background: "#F2F2F5", color: muted ? C.green : C.red }}>
                              {muted ? "恢复" : "取消"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="text-[11px]" style={{ color: C.faint }}>
          数据来源：DailyRecommendation（推荐）· StockScore / DailyPrice（行情），历史按日期独立保存不覆盖。
        </div>
      </div>

      {/* Note editor */}
      {editNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setEditNote(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-3" style={{ color: C.ink }}>备注</div>
            <textarea value={editNote.text} onChange={(e) => setEditNote({ ...editNote, text: e.target.value })}
              maxLength={500} rows={4} className="w-full rounded-xl p-3 text-[13px] resize-none"
              style={{ border: `1px solid ${C.line}`, color: C.ink }} placeholder="添加备注（≤500 字）" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEditNote(null)} className="h-9 px-4 rounded-full text-[13px] font-medium bg-white" style={{ border: `1px solid ${C.line}`, color: C.sub }}>取消</button>
              <button onClick={() => { patch(editNote.id, { note: editNote.text }); setEditNote(null); }}
                className="h-9 px-4 rounded-full text-[13px] font-semibold text-white" style={{ background: C.blue }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
