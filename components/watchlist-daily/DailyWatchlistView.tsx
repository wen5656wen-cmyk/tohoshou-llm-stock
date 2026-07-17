"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ExplainReportButton from "@/components/explain/ExplainReportButton";
import { isJPXTradingDay } from "@/lib/trading-calendar/jpx";

// Apple dashboard palette (local — matches lib/design-tokens COLORS)
const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A", purple: "#5856D6",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC", bg: "#FAFAFA",
};
const REFRESH_MS = 60_000;

type Item = {
  id: number; symbol: string; name: string | null; recommendation: string;
  rank: number | null; score: number | null;
  entryPrice: number | null; currentPrice: number | null;
  intradayChangePct: number | null; returnPctFromEntry: number | null;
  quoteUpdatedAt: string | null; quoteSource: string;
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
type Resp = {
  date: string; availableDates: string[]; items: Item[]; stats: Stats;
  quoteSource: string; quoteUpdatedAt: string; realtime: boolean;
};

const recMeta: Record<string, { label: string; color: string }> = {
  STRONG_BUY: { label: "强烈买入", color: C.red },
  BUY: { label: "买入", color: C.amber },
};
const fmtJpy = (n: number | null) => (n == null ? "—" : `¥${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const fmtPct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const retColor = (n: number | null) => (n == null ? C.faint : n > 0 ? C.green : n < 0 ? C.red : C.sub);

// JST wall-clock (read UTC fields of a +9h-shifted Date)
function jstParts() { const d = new Date(Date.now() + 9 * 3600 * 1000); return { h: d.getUTCHours(), m: d.getUTCMinutes() }; }
function isTradingTime(): boolean {
  if (!isJPXTradingDay(new Date())) return false;
  const { h, m } = jstParts(); const t = h * 60 + m;
  return (t >= 540 && t <= 690) || (t >= 750 && t <= 930); // 09:00-11:30 / 12:30-15:30 JST
}
function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function fmtStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} JST`;
}

function StatCard({ label, value, sub, color, live }: { label: string; value: string; sub?: string; color?: string; live?: boolean }) {
  return (
    <div className="dash-card p-4">
      <div className="text-[11px] font-medium flex items-center gap-1" style={{ color: C.faint }}>
        {label}{live && <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />}
      </div>
      <div className="text-[22px] font-semibold tabular-nums mt-1" style={{ color: color ?? C.ink }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: C.sub }}>{sub}</div>}
    </div>
  );
}

// ── P9-DECISION-03：TDnet 披露优先级与中文标签（基于生产真实 category 取值）──
// 真实取值：EARNINGS / FORECAST_REVISION / EQUITY / BUYBACK / DIVIDEND / MATERIAL / OTHER
// 注：库中**无独立「拆股」「大额订单」「重大合同」类别** → 归入 MATERIAL / OTHER，不强行贴标。
const DISC_PRIORITY: Record<string, number> = {
  EARNINGS: 7, FORECAST_REVISION: 6, EQUITY: 5, BUYBACK: 4, MATERIAL: 3, DIVIDEND: 2, OTHER: 1,
};
const DISC_LABEL: Record<string, string> = {
  EARNINGS: "财报", FORECAST_REVISION: "业绩修正", EQUITY: "增发", BUYBACK: "回购",
  MATERIAL: "重大披露", DIVIDEND: "分红", OTHER: "其他披露",
};

export default function DailyWatchlistView() {
  const [data, setData] = useState<Resp | null>(null);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editNote, setEditNote] = useState<{ id: number; text: string } | null>(null);

  // ── P9-DECISION-03：展开式实时增强（按需懒加载 + 会话缓存）────────────────
  // 首屏 explain/indicators/news/disclosures 一律 0 请求；展开某只时四路**并行**各 1 次；
  // 结果存入 detailCache（key=symbol），再次展开 0 请求；组件卸载后缓存随之释放。
  // 四路用 allSettled 相互隔离 —— 任一失败只影响其自身区块，页面不报错。
  type Detail = {
    t1: number | null; sl: number | null; levelSource: string | null; reasons: string[];
    explainOk: boolean;
    volChangePct: number | null; volToday: number | null; volAvg20: number | null; indOk: boolean;
    news: { today: number; yst: number; d3: number } | null; newsOk: boolean;
    disc: { count7d: number; latest: { title: string; date: string; category: string | null } | null } | null; discOk: boolean;
  };
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, Detail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  const toggleExpand = useCallback(async (symbol: string) => {
    if (expanded === symbol) { setExpanded(null); return; }
    setExpanded(symbol);
    if (detailCache[symbol] || detailLoading[symbol]) return; // ← 命中缓存：0 请求
    setDetailLoading((s) => ({ ...s, [symbol]: true }));
    const j = (u: string) => fetch(u, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
    const [ex, ind, nw, dc] = await Promise.allSettled([
      j(`/api/explain/${encodeURIComponent(symbol)}/report`),
      j(`/api/stocks/${encodeURIComponent(symbol)}/indicators`),
      j(`/api/news?symbol=${encodeURIComponent(symbol)}&limit=50`),
      j(`/api/disclosures?symbol=${encodeURIComponent(symbol)}&limit=50`),
    ]);

    const d: Detail = {
      t1: null, sl: null, levelSource: null, reasons: [], explainOk: false,
      volChangePct: null, volToday: null, volAvg20: null, indOk: false,
      news: null, newsOk: false, disc: null, discOk: false,
    };
    if (ex.status === "fulfilled") {
      const r = ex.value?.report;
      if (r) {
        d.explainOk = true;
        d.t1 = r.takeProfit?.t1 ?? null;
        d.sl = r.stopLoss?.price ?? null;
        d.levelSource = r.levelSource ?? null;
        d.reasons = Array.isArray(r.recommendReasons) ? r.recommendReasons.slice(0, 3) : [];
      }
    }
    if (ind.status === "fulfilled") {
      const bars = ind.value?.series?.all ?? [];
      const v: number[] = bars.map((b: { volume?: number }) => b.volume).filter((x: unknown): x is number => typeof x === "number" && x > 0);
      if (v.length >= 21) {
        const today = v[v.length - 1];
        const avg20 = v.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
        if (avg20 > 0) { d.indOk = true; d.volToday = today; d.volAvg20 = avg20; d.volChangePct = (today / avg20 - 1) * 100; }
      }
    }
    const jstDate = (iso: string) => {
      const t = new Date(iso).getTime() + 9 * 3600_000;
      return new Date(t).toISOString().slice(0, 10);
    };
    const todayJst = jstDate(new Date().toISOString());
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400_000);
    if (nw.status === "fulfilled" && Array.isArray(nw.value)) {
      d.newsOk = true;
      const c = { today: 0, yst: 0, d3: 0 };
      for (const n of nw.value) {
        if (!n?.publishedAt) continue;
        const dd = dayDiff(todayJst, jstDate(n.publishedAt));
        if (dd === 0) c.today++;
        if (dd === 1) c.yst++;
        if (dd >= 0 && dd <= 2) c.d3++;
      }
      d.news = c;
    }
    if (dc.status === "fulfilled" && Array.isArray(dc.value)) {
      d.discOk = true;
      const recent = dc.value.filter((x: { publishedAt?: string }) => x?.publishedAt && dayDiff(todayJst, jstDate(x.publishedAt)) <= 6 && dayDiff(todayJst, jstDate(x.publishedAt)) >= 0);
      const sorted = [...recent].sort((a, b) => (DISC_PRIORITY[b.category] ?? 0) - (DISC_PRIORITY[a.category] ?? 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      d.disc = {
        count7d: recent.length,
        latest: sorted[0] ? { title: sorted[0].title, date: jstDate(sorted[0].publishedAt), category: sorted[0].category ?? null } : null,
      };
    }
    setDetailCache((s) => ({ ...s, [symbol]: d }));
    setDetailLoading((s) => ({ ...s, [symbol]: false }));
  }, [expanded, detailCache, detailLoading]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [trading, setTrading] = useState(false);
  const dateRef = useRef<string>("");

  const load = useCallback(async (d?: string) => {
    try {
      const q = d ? `?date=${encodeURIComponent(d)}` : "";
      const r = await fetch(`/api/watchlist/daily${q}`, { cache: "no-store" });
      const j: Resp = await r.json();
      setData(j); setDate(j.date); dateRef.current = j.date;
      setLastUpdated(new Date().toISOString());
    } catch { /* keep prior data on transient failure */ }
    setLoading(false);
  }, []);

  // initial load
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // auto refresh: 60s during trading hours only; always keep the badge state fresh
  useEffect(() => {
    setTrading(isTradingTime());
    const tick = setInterval(() => {
      const t = isTradingTime();
      setTrading(t);
      if (t && !busy && !editNote) load(dateRef.current || undefined);
    }, REFRESH_MS);
    return () => clearInterval(tick);
  }, [load, busy, editNote]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/watchlist/daily/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load(dateRef.current || undefined);
    } finally { setBusy(false); }
  };
  const regenerate = async () => {
    setBusy(true);
    try {
      await fetch(`/api/watchlist/daily/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await load();
    } finally { setBusy(false); }
  };

  const stats = data?.stats;
  const items = data?.items ?? [];
  const src = data?.quoteSource ?? "Yahoo Finance";

  return (
    <div className="min-h-screen dash-font" style={{ background: C.bg }}>
      <div className="mx-auto max-w-[1600px] px-5 lg:px-8 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold" style={{ color: C.ink }}>每日 AI 关注池 · 实时盯盘</h1>
            <p className="text-[12px] mt-0.5" style={{ color: C.faint }}>
              每日 AI 推荐中 强烈买入 / 买入 的股票，盘中实时刷新行情，按日期独立留存
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold"
                style={{ background: trading ? `${C.green}14` : "#F2F2F5", color: trading ? C.green : C.faint }}>
                <span className="w-2 h-2 rounded-full" style={{ background: trading ? C.green : C.faint }} />
                {trading ? "实时" : "已收盘"}
              </span>
              <span className="text-[12px]" style={{ color: C.sub }}>最后更新 <b className="tabular-nums" style={{ color: C.ink }}>{fmtClock(lastUpdated)}</b></span>
            </div>
            <div className="flex items-center gap-2">
              <select value={date} onChange={(e) => { setDate(e.target.value); load(e.target.value); }}
                className="h-9 px-3 rounded-full text-[13px] font-medium bg-white" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
                {(data?.availableDates ?? []).length === 0 && <option value={date}>{date || "—"}</option>}
                {(data?.availableDates ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button onClick={() => load(date)} disabled={busy || loading}
                className="h-9 px-4 rounded-full text-[13px] font-semibold bg-white disabled:opacity-50" style={{ border: `1px solid ${C.line}`, color: C.blue }}>立即刷新</button>
              <button onClick={regenerate} disabled={busy}
                className="h-9 px-4 rounded-full text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.blue }}>生成今日</button>
            </div>
            <span className="text-[11px]" style={{ color: C.faint }}>交易时段每 60 秒自动刷新（{src}）</span>
          </div>
        </div>

        {/* Realtime stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <StatCard label="当日关注" value={String(stats?.total ?? 0)} sub="STRONG_BUY / BUY" />
          <StatCard label="上涨" value={String(stats?.up ?? 0)} color={C.green} live />
          <StatCard label="下跌" value={String(stats?.down ?? 0)} color={C.red} live />
          <StatCard label="平均推荐后涨跌" value={fmtPct(stats?.avgReturnPct ?? null)} color={retColor(stats?.avgReturnPct ?? null)} live />
          <StatCard label="Top Winner" value={stats?.topWinner ? fmtPct(stats.topWinner.returnPct) : "—"} sub={stats?.topWinner?.symbol} color={C.green} live />
          <StatCard label="Top Loser" value={stats?.topLoser ? fmtPct(stats.topLoser.returnPct) : "—"} sub={stats?.topLoser?.symbol} color={C.red} live />
          <StatCard label="强烈买入 表现" value={fmtPct(stats?.strongBuy.avgReturnPct ?? null)} sub={`${stats?.strongBuy.count ?? 0} 只`} color={retColor(stats?.strongBuy.avgReturnPct ?? null)} live />
          <StatCard label="买入 表现" value={fmtPct(stats?.buy.avgReturnPct ?? null)} sub={`${stats?.buy.count ?? 0} 只`} color={retColor(stats?.buy.avgReturnPct ?? null)} live />
        </div>

        {/* Table */}
        <div className="dash-card overflow-hidden">
          <div className="px-4 py-3 text-[13px] font-semibold flex items-center gap-2" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
            实时盯盘 · {date}
            <span className="text-[11px] font-normal" style={{ color: C.faint }}>今日涨跌/推荐后涨跌按实时当前价计算</span>
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
                    {["股票", "推荐等级", "AI评分", "推荐价", "当前价", "今日涨跌", "推荐后涨跌", "加星", "重点", "备注", "操作"].map((h, i) => (
                      <th key={h} className={`px-3 py-2.5 font-medium whitespace-nowrap ${i >= 2 && i <= 6 ? "text-right" : i >= 7 ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const rm = recMeta[it.recommendation] ?? { label: it.recommendation, color: C.sub };
                    const muted = it.isMuted;
                    return (
                      <Fragment key={it.id}>
                      <tr style={{ borderBottom: `1px solid ${C.line}`, opacity: muted ? 0.45 : 1 }} className="hover:bg-[#F7F7F9]">
                        <td className="px-3 py-2.5">
                          <button onClick={() => toggleExpand(it.symbol)} title="展开实时详情"
                            className="w-5 h-5 rounded mr-1 text-[10px] align-middle"
                            style={{ background: expanded === it.symbol ? `${C.blue}1A` : "#F2F2F5", color: expanded === it.symbol ? C.blue : C.faint }}>
                            {expanded === it.symbol ? "▾" : "▸"}
                          </button>
                          {it.rank != null && <span className="text-[10px] tabular-nums mr-1.5" style={{ color: C.faint }}>#{it.rank}</span>}
                          <Link href={`/stocks/${encodeURIComponent(it.symbol)}`} className="font-semibold hover:underline" style={{ color: C.ink }}>{it.name ?? it.symbol}</Link>
                          <span className="ml-1.5 text-[11px] tabular-nums" style={{ color: C.faint }}>{it.symbol}</span>
                          {it.isFocus && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: C.purple, background: `${C.purple}14` }}>重点</span>}
                          <span className="ml-1.5 inline-block"><ExplainReportButton symbol={it.symbol} name={it.name} size="xs" /></span>
                        </td>
                        <td className="px-3 py-2.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: rm.color, background: `${rm.color}14` }}>{rm.label}</span></td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: C.ink }}>{it.score != null ? it.score.toFixed(0) : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: C.sub }}>{fmtJpy(it.entryPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: C.ink }}>{fmtJpy(it.currentPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: retColor(it.intradayChangePct) }}>{fmtPct(it.intradayChangePct)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: retColor(it.returnPctFromEntry) }}>{fmtPct(it.returnPctFromEntry)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button title="加星" onClick={() => patch(it.id, { isStarred: !it.isStarred })} disabled={busy}
                            className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.isStarred ? `${C.amber}1A` : "#F2F2F5", color: it.isStarred ? C.amber : C.faint }}>★</button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button title="重点观察" onClick={() => patch(it.id, { isFocus: !it.isFocus })} disabled={busy}
                            className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.isFocus ? `${C.purple}1A` : "#F2F2F5", color: it.isFocus ? C.purple : C.faint }}>◎</button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button title="备注" onClick={() => setEditNote({ id: it.id, text: it.note ?? "" })} disabled={busy}
                            className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.note ? `${C.blue}1A` : "#F2F2F5", color: it.note ? C.blue : C.faint }}>✎</button>
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => patch(it.id, { isMuted: !muted })} disabled={busy}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-medium" style={{ background: "#F2F2F5", color: muted ? C.green : C.faint }}>
                            {muted ? "恢复关注" : "取消关注"}
                          </button>
                        </td>
                      </tr>
                      {expanded === it.symbol && (
                        <tr style={{ borderBottom: `1px solid ${C.line}`, background: "#FBFBFD" }}>
                          <td colSpan={11} className="px-4 py-3">
                            {detailLoading[it.symbol] ? (
                              <div className="text-[12px]" style={{ color: C.faint }}>读取中…</div>
                            ) : (() => {
                              const d = detailCache[it.symbol];
                              if (!d) return <div className="text-[12px]" style={{ color: C.faint }}>暂无数据</div>;
                              const cur = it.currentPrice;
                              const upside = d.t1 != null && cur ? ((d.t1 - cur) / cur) * 100 : null;
                              const gap = d.t1 != null && cur ? d.t1 - cur : null;
                              const srcLabel = d.levelSource === "closing" ? "收盘决策目标" : d.levelSource === "derived" ? "系统派生目标" : null;
                              const srcColor = d.levelSource === "closing" ? C.blue : C.amber;
                              return (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-[12px]">
                                  {/* 目标 / 止损 / 空间 */}
                                  <div>
                                    <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: C.ink }}>
                                      目标与止损
                                      {srcLabel && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: srcColor, background: `${srcColor}14` }}>{srcLabel}</span>}
                                    </div>
                                    {d.explainOk && d.t1 != null ? (
                                      <div className="space-y-0.5" style={{ color: C.sub }}>
                                        <div>目标价 T1：<b style={{ color: C.ink }}>{fmtJpy(d.t1)}</b></div>
                                        <div>止损价 SL：<b style={{ color: d.sl != null ? C.red : C.faint }}>{d.sl != null ? fmtJpy(d.sl) : "暂无数据"}</b></div>
                                        <div>上涨空间：<b style={{ color: upside != null ? retColor(upside) : C.faint }}>{upside != null ? fmtPct(upside) : "暂无数据"}</b></div>
                                        <div>距离目标：<b style={{ color: C.ink }}>{gap != null ? `还有 ${Math.round(gap).toLocaleString()} 日元` : "暂无数据"}</b></div>
                                      </div>
                                    ) : <div style={{ color: C.faint }}>暂无数据</div>}
                                  </div>

                                  {/* 成交量 + 新闻 + 披露 */}
                                  <div>
                                    <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.ink }}>成交量 / 新闻 / 披露</div>
                                    <div className="space-y-0.5" style={{ color: C.sub }}>
                                      <div>成交量变化：{d.indOk && d.volChangePct != null ? (
                                        <b style={{ color: retColor(d.volChangePct) }}>{fmtPct(d.volChangePct)}
                                          <span className="ml-1 text-[10px]" style={{ color: C.faint }}>
                                            ({Math.round(d.volToday ?? 0).toLocaleString()} / 20日均 {Math.round(d.volAvg20 ?? 0).toLocaleString()})
                                          </span>
                                        </b>
                                      ) : <b style={{ color: C.faint }}>暂无数据</b>}</div>
                                      <div>新闻变化：{d.newsOk && d.news && (d.news.today + d.news.yst + d.news.d3) > 0 ? (
                                        <b style={{ color: C.ink }}>今日 {d.news.today} · 昨日 {d.news.yst} · 近3天 {d.news.d3}</b>
                                      ) : <b style={{ color: C.faint }}>暂无新闻</b>}</div>
                                      <div>TDnet 披露：{d.discOk && d.disc && d.disc.count7d > 0 ? (
                                        <b style={{ color: C.ink }}>近7天 {d.disc.count7d} 条</b>
                                      ) : <b style={{ color: C.faint }}>暂无近期披露</b>}</div>
                                      {d.disc?.latest && (
                                        <div className="mt-0.5 flex items-start gap-1.5">
                                          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ color: C.purple, background: `${C.purple}14` }}>
                                            {DISC_LABEL[d.disc.latest.category ?? "OTHER"] ?? "其他披露"}
                                          </span>
                                          <span className="text-[11px]" style={{ color: C.sub }}>
                                            {d.disc.latest.date} · {d.disc.latest.title.slice(0, 40)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* AI 理由 */}
                                  <div>
                                    <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.ink }}>AI 推荐理由</div>
                                    {d.reasons.length ? (
                                      <ul className="space-y-0.5" style={{ color: C.sub }}>
                                        {d.reasons.map((r, i) => <li key={i}>· {r}</li>)}
                                      </ul>
                                    ) : <div style={{ color: C.faint }}>暂无数据</div>}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer: quote source + last updated */}
        <div className="flex items-center justify-between text-[11px] flex-wrap gap-2" style={{ color: C.faint }}>
          <span>数据来源：DailyRecommendation（推荐）· <b style={{ color: C.sub }}>{src}</b>（现价/今日涨跌，准实时）· 历史按日期独立保存不覆盖</span>
          <span>Quote Source：<b style={{ color: C.sub }}>{src}</b> · Last Updated：<b className="tabular-nums" style={{ color: C.sub }}>{fmtStamp(lastUpdated)}</b></span>
        </div>
      </div>

      {/* Note editor */}
      {editNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setEditNote(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-3" style={{ color: C.ink }}>备注</div>
            <textarea value={editNote.text} onChange={(e) => setEditNote({ ...editNote, text: e.target.value })}
              maxLength={500} rows={4} className="w-full rounded-xl p-3 text-[13px] resize-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} placeholder="添加备注（≤500 字）" />
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
