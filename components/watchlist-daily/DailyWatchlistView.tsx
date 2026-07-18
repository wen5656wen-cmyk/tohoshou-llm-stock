"use client";

// ── Live Monitor V3（P13-DECISION-06）─────────────────────────────────────────
// 老板盘中实时监控页。6 section：状态栏 / 当前行动 / 今日组合 / 异动 / 关注列表 / 口径说明。
// 展示层重构：保留全部原有能力（日期切换/立即刷新/生成今日/60s自动刷新/加星/重点/备注/
// 取消·恢复/展开详情/AI为什么推荐/历史冻结/Yahoo更新时间/全部统计卡）；不改任何生成逻辑/API/Schema。
// 状态判定唯一来源：lib/decision/live-status.ts（买区/目标/止损来自收盘决策，现价来自 Yahoo 实时）。
// 关注池自身不含买区 → 无数据显示「暂无数据」，绝不猜测。

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import ExplainReportButton from "@/components/explain/ExplainReportButton";
import { useI18n } from "@/lib/i18n";
import { deriveLiveStatus, LIVE_STATUS_META, marketPhase, isRefreshWindow, type LiveStatus, type StatusTone } from "@/lib/decision/live-status";

const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A", purple: "#5856D6",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC", bg: "#FAFAFA", tile: "#F2F2F5",
};
const TONE: Record<StatusTone, string> = { green: C.green, amber: C.amber, red: C.red, neutral: C.faint };
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
type Zone = { entryLow: number | null; entryHigh: number | null; target: number | null; stop: number | null };
// 收盘决策原始字段：entryLow/entryHigh/target1/(target2)/stopLoss
type Top1 = { symbol: string; name: string | null; price: number | null; aiScore: number | null; gptScore: number | null; confidence: string | null; entryLow: number | null; entryHigh: number | null; target1: number | null; target2: number | null; stopLoss: number | null; holdPeriod: string | null };
type Leg = { symbol: string; name: string | null; weight: number; entryLow: number | null; entryHigh: number | null; target1: number | null; stopLoss: number | null };
type Top10Row = { symbol: string; entryLow: number | null; entryHigh: number | null; target1: number | null; stopLoss: number | null };
type ClosingApi = { empty?: boolean; date?: string; decidedAtJst?: string | null; top1?: Top1 | null; portfolio?: Leg[]; top10?: Top10Row[] };

const fmtJpy = (n: number | null | undefined) => (n == null ? "—" : `¥${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const retColor = (n: number | null | undefined) => (n == null ? C.faint : n > 0 ? C.green : n < 0 ? C.red : C.sub);
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

// TDnet 披露优先级/标签（P9 遗留展开详情，保留）
const DISC_PRIORITY: Record<string, number> = { EARNINGS: 7, FORECAST_REVISION: 6, EQUITY: 5, BUYBACK: 4, MATERIAL: 3, DIVIDEND: 2, OTHER: 1 };
const DISC_LABEL: Record<string, string> = { EARNINGS: "财报", FORECAST_REVISION: "业绩修正", EQUITY: "增发", BUYBACK: "回购", MATERIAL: "重大披露", DIVIDEND: "分红", OTHER: "其他披露" };

type Group = "all" | "final" | "portfolio" | "inZone" | "up" | "down" | "star" | "focus" | "muted";
type SortKey = "rank" | "intraday" | "return" | "ai" | "price" | "symbol";

export default function DailyWatchlistView() {
  const { t } = useI18n();
  const [data, setData] = useState<Resp | null>(null);
  const [closing, setClosing] = useState<ClosingApi | null>(null);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editNote, setEditNote] = useState<{ id: number; text: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [phase, setPhase] = useState<"PRE" | "OPEN" | "CLOSED">("CLOSED");
  const [group, setGroup] = useState<Group>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const dateRef = useRef<string>("");

  // ── 展开式实时详情（P9-DECISION-03，保留原逻辑）────────────────────────────
  type Detail = {
    t1: number | null; sl: number | null; levelSource: string | null; reasons: string[]; explainOk: boolean;
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
    if (detailCache[symbol] || detailLoading[symbol]) return;
    setDetailLoading((s) => ({ ...s, [symbol]: true }));
    const j = (u: string) => fetch(u, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
    const [ex, ind, nw, dc] = await Promise.allSettled([
      j(`/api/explain/${encodeURIComponent(symbol)}/report`),
      j(`/api/stocks/${encodeURIComponent(symbol)}/indicators`),
      j(`/api/news?symbol=${encodeURIComponent(symbol)}&limit=50`),
      j(`/api/disclosures?symbol=${encodeURIComponent(symbol)}&limit=50`),
    ]);
    const d: Detail = { t1: null, sl: null, levelSource: null, reasons: [], explainOk: false, volChangePct: null, volToday: null, volAvg20: null, indOk: false, news: null, newsOk: false, disc: null, discOk: false };
    if (ex.status === "fulfilled") {
      const r = ex.value?.report;
      if (r) { d.explainOk = true; d.t1 = r.takeProfit?.t1 ?? null; d.sl = r.stopLoss?.price ?? null; d.levelSource = r.levelSource ?? null; d.reasons = Array.isArray(r.recommendReasons) ? r.recommendReasons.slice(0, 3) : []; }
    }
    if (ind.status === "fulfilled") {
      const bars = ind.value?.series?.all ?? [];
      const v: number[] = bars.map((b: { volume?: number }) => b.volume).filter((x: unknown): x is number => typeof x === "number" && x > 0);
      if (v.length >= 21) { const today = v[v.length - 1]; const avg20 = v.slice(-21, -1).reduce((a, b) => a + b, 0) / 20; if (avg20 > 0) { d.indOk = true; d.volToday = today; d.volAvg20 = avg20; d.volChangePct = (today / avg20 - 1) * 100; } }
    }
    const jstDate = (iso: string) => { const tt = new Date(iso).getTime() + 9 * 3600_000; return new Date(tt).toISOString().slice(0, 10); };
    const todayJst = jstDate(new Date().toISOString());
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400_000);
    if (nw.status === "fulfilled" && Array.isArray(nw.value)) {
      d.newsOk = true; const c = { today: 0, yst: 0, d3: 0 };
      for (const n of nw.value) { if (!n?.publishedAt) continue; const dd = dayDiff(todayJst, jstDate(n.publishedAt)); if (dd === 0) c.today++; if (dd === 1) c.yst++; if (dd >= 0 && dd <= 2) c.d3++; }
      d.news = c;
    }
    if (dc.status === "fulfilled" && Array.isArray(dc.value)) {
      d.discOk = true;
      const recent = dc.value.filter((x: { publishedAt?: string }) => x?.publishedAt && dayDiff(todayJst, jstDate(x.publishedAt)) <= 6 && dayDiff(todayJst, jstDate(x.publishedAt)) >= 0);
      const sorted = [...recent].sort((a, b) => (DISC_PRIORITY[b.category] ?? 0) - (DISC_PRIORITY[a.category] ?? 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      d.disc = { count7d: recent.length, latest: sorted[0] ? { title: sorted[0].title, date: jstDate(sorted[0].publishedAt), category: sorted[0].category ?? null } : null };
    }
    setDetailCache((s) => ({ ...s, [symbol]: d }));
    setDetailLoading((s) => ({ ...s, [symbol]: false }));
  }, [expanded, detailCache, detailLoading]);

  // ── 数据加载：关注池 + 收盘决策（同日期）──────────────────────────────────
  const load = useCallback(async (d?: string) => {
    try {
      const q = d ? `?date=${encodeURIComponent(d)}` : "";
      const [wl, cd] = await Promise.all([
        fetch(`/api/watchlist/daily${q}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/admin/closing-decision${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setData(wl); setClosing(cd && !cd.empty ? cd : null);
      setDate(wl.date); dateRef.current = wl.date;
      setLastUpdated(new Date().toISOString());
    } catch { /* keep prior data */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // 自动刷新：仅交易时段 + 查看最新日期时；非交易/历史日期不刷新（避免"仍在实时"错觉）
  useEffect(() => {
    setPhase(marketPhase(new Date()));
    const tick = setInterval(() => {
      setPhase(marketPhase(new Date()));
      const latest = dateRef.current && data?.availableDates?.[0] === dateRef.current;
      if (isRefreshWindow(new Date()) && latest && !busy && !editNote) load(dateRef.current || undefined);
    }, REFRESH_MS);
    return () => clearInterval(tick);
  }, [load, busy, editNote, data?.availableDates]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    setBusy(true);
    try { await fetch(`/api/watchlist/daily/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await load(dateRef.current || undefined); }
    finally { setBusy(false); }
  };
  const regenerate = async () => {
    setBusy(true);
    try { await fetch(`/api/watchlist/daily/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); await load(); }
    finally { setBusy(false); }
  };

  const stats = data?.stats;
  const items = data?.items ?? [];
  const src = data?.quoteSource ?? "Yahoo Finance";
  const isLatest = !!date && data?.availableDates?.[0] === date;
  const trading = phase === "OPEN" && isLatest;

  // ── 状态派生（全部经 SSOT）──────────────────────────────────────────────────
  const zoneMap = new Map<string, Zone>();
  if (closing?.top1) zoneMap.set(closing.top1.symbol, { entryLow: closing.top1.entryLow, entryHigh: closing.top1.entryHigh, target: closing.top1.target1, stop: closing.top1.stopLoss });
  for (const l of closing?.portfolio ?? []) zoneMap.set(l.symbol, { entryLow: l.entryLow, entryHigh: l.entryHigh, target: l.target1, stop: l.stopLoss });
  for (const r of closing?.top10 ?? []) if (!zoneMap.has(r.symbol)) zoneMap.set(r.symbol, { entryLow: r.entryLow, entryHigh: r.entryHigh, target: r.target1, stop: r.stopLoss });
  const itemMap = new Map(items.map((it) => [it.symbol, it]));
  const finalSym = closing?.top1?.symbol ?? null;
  const portSyms = new Set((closing?.portfolio ?? []).map((l) => l.symbol));

  const statusOf = (symbol: string, price: number | null, muted: boolean): LiveStatus => {
    const z = zoneMap.get(symbol) ?? { entryLow: null, entryHigh: null, target: null, stop: null };
    return deriveLiveStatus({ price, entryLow: z.entryLow, entryHigh: z.entryHigh, target: z.target, stop: z.stop, muted });
  };
  const stColor = (st: LiveStatus) => TONE[LIVE_STATUS_META[st].tone];
  const stLabel = (st: LiveStatus) => t(LIVE_STATUS_META[st].labelKey as Parameters<typeof t>[0]);
  const stAction = (st: LiveStatus) => t(LIVE_STATUS_META[st].actionKey as Parameters<typeof t>[0]);

  const recLabel = (rec: string) => (rec === "STRONG_BUY" ? t("wl.rec.sb") : rec === "BUY" ? t("wl.rec.buy") : rec);
  const recColor = (rec: string) => (rec === "STRONG_BUY" ? C.red : rec === "BUY" ? C.amber : C.sub);
  const StatusPill = ({ st }: { st: LiveStatus }) => (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: stColor(st), background: `${stColor(st)}14` }}>{stLabel(st)}</span>
  );

  // ── Section 3 今日组合派生 ──
  const legRows = (closing?.portfolio ?? []).map((l) => {
    const it = itemMap.get(l.symbol);
    const price = it?.currentPrice ?? null;
    return { ...l, price, ret: it?.returnPctFromEntry ?? null, today: it?.intradayChangePct ?? null, entryPrice: it?.entryPrice ?? null, st: statusOf(l.symbol, price, false) };
  });
  const legRets = legRows.map((r) => r.ret).filter((x): x is number => x != null);
  const portAgg = legRets.length ? {
    avg: legRets.reduce((a, b) => a + b, 0) / legRets.length,
    up: legRows.filter((r) => (r.ret ?? 0) > 0).length,
    down: legRows.filter((r) => (r.ret ?? 0) < 0).length,
    strongest: [...legRows].filter((r) => r.ret != null).sort((a, b) => (b.ret ?? 0) - (a.ret ?? 0))[0] ?? null,
    weakest: [...legRows].filter((r) => r.ret != null).sort((a, b) => (a.ret ?? 0) - (b.ret ?? 0))[0] ?? null,
  } : null;

  // ── Section 4 异动派生（排除已取消；仅现有字段足够时）──
  const active = items.filter((it) => !it.isMuted);
  const byToday = [...active].filter((it) => it.intradayChangePct != null).sort((a, b) => (b.intradayChangePct ?? 0) - (a.intradayChangePct ?? 0));
  const byRet = [...active].filter((it) => it.returnPctFromEntry != null).sort((a, b) => (b.returnPctFromEntry ?? 0) - (a.returnPctFromEntry ?? 0));
  const movTopGain = byToday[0] ?? null;
  const movTopLoss = byToday.length ? byToday[byToday.length - 1] : null;
  const movBest = byRet[0] ?? null;
  const movWorst = byRet.length ? byRet[byRet.length - 1] : null;
  const focusMovers = active.filter((it) => it.isFocus && (it.intradayChangePct != null || it.returnPctFromEntry != null));
  const inZoneNow = active.filter((it) => zoneMap.has(it.symbol) && statusOf(it.symbol, it.currentPrice, false) === "IN_ZONE");

  // ── Section 5 分组/排序（纯前端展示，不改后端排名/顺序）──
  const groups: { key: Group; label: string }[] = [
    { key: "all", label: t("wl.grp.all") }, { key: "final", label: t("wl.grp.final") }, { key: "portfolio", label: t("wl.grp.portfolio") },
    { key: "inZone", label: t("wl.grp.inZone") }, { key: "up", label: t("wl.grp.up") }, { key: "down", label: t("wl.grp.down") },
    { key: "star", label: t("wl.grp.star") }, { key: "focus", label: t("wl.grp.focus") }, { key: "muted", label: t("wl.grp.muted") },
  ];
  const sorts: { key: SortKey; label: string }[] = [
    { key: "rank", label: t("wl.sort.rank") }, { key: "intraday", label: t("wl.sort.intraday") }, { key: "return", label: t("wl.sort.return") },
    { key: "ai", label: t("wl.sort.ai") }, { key: "price", label: t("wl.sort.price") }, { key: "symbol", label: t("wl.sort.symbol") },
  ];
  const inGroup = (it: Item): boolean => {
    switch (group) {
      case "final": return it.symbol === finalSym;
      case "portfolio": return portSyms.has(it.symbol);
      case "inZone": return statusOf(it.symbol, it.currentPrice, it.isMuted) === "IN_ZONE";
      case "up": return (it.intradayChangePct ?? 0) > 0;
      case "down": return (it.intradayChangePct ?? 0) < 0;
      case "star": return it.isStarred;
      case "focus": return it.isFocus;
      case "muted": return it.isMuted;
      default: return true;
    }
  };
  const defaultPri = (it: Item): number => {
    if (it.symbol === finalSym) return 0;
    if (portSyms.has(it.symbol)) return 1;
    if (it.isFocus) return 2;
    if (it.isStarred) return 3;
    if (statusOf(it.symbol, it.currentPrice, it.isMuted) === "IN_ZONE") return 4;
    return 5;
  };
  const sorted = items.filter(inGroup).sort((a, b) => {
    switch (sortKey) {
      case "intraday": return (b.intradayChangePct ?? -1e9) - (a.intradayChangePct ?? -1e9);
      case "return": return (b.returnPctFromEntry ?? -1e9) - (a.returnPctFromEntry ?? -1e9);
      case "ai": return (b.score ?? -1e9) - (a.score ?? -1e9);
      case "price": return (b.currentPrice ?? -1e9) - (a.currentPrice ?? -1e9);
      case "symbol": return a.symbol.localeCompare(b.symbol);
      default: { const p = defaultPri(a) - defaultPri(b); return p !== 0 ? p : (a.rank ?? 1e9) - (b.rank ?? 1e9); }
    }
  });

  const phaseLabel = phase === "PRE" ? t("wl.phase.pre") : phase === "OPEN" ? t("wl.phase.open") : t("wl.phase.closed");
  const finalItem = finalSym ? itemMap.get(finalSym) : undefined;
  const finalPrice = finalItem?.currentPrice ?? closing?.top1?.price ?? null;
  const finalStatus = closing?.top1 ? deriveLiveStatus({ price: finalPrice, entryLow: closing.top1.entryLow, entryHigh: closing.top1.entryHigh, target: closing.top1.target1, stop: closing.top1.stopLoss, muted: finalItem?.isMuted }) : null;

  const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <div className={`dash-card ${className}`} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16 }}>{children}</div>
  );

  return (
    <div className="min-h-screen dash-font" style={{ background: C.bg }}>
      <div className="mx-auto max-w-[1600px] px-4 lg:px-8 py-6 space-y-4">

        {/* ═══ SECTION 1 · 盯盘状态栏 ═══ */}
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-[20px] font-bold" style={{ color: C.ink }}>{t("wl.title")}</h1>
              <p className="text-[12px] mt-0.5" style={{ color: C.faint }}>{t("wl.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold"
                style={{ background: trading ? `${C.green}14` : C.tile, color: trading ? C.green : C.faint }}>
                <span className="w-2 h-2 rounded-full" style={{ background: trading ? C.green : C.faint }} />{phaseLabel}{trading ? ` · ${t("wl.realtime")}` : ""}
              </span>
              <select value={date} onChange={(e) => { setDate(e.target.value); load(e.target.value); }}
                className="h-8 px-3 rounded-full text-[12px] font-medium bg-white" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
                {(data?.availableDates ?? []).length === 0 && <option value={date}>{date || "—"}</option>}
                {(data?.availableDates ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button onClick={() => load(date)} disabled={busy || loading} className="h-8 px-3.5 rounded-full text-[12px] font-semibold bg-white disabled:opacity-50" style={{ border: `1px solid ${C.line}`, color: C.blue }}>{t("wl.refreshNow")}</button>
              <button onClick={regenerate} disabled={busy} className="h-8 px-3.5 rounded-full text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: C.blue }}>{t("wl.generate")}</button>
            </div>
          </div>
          {/* 三种时间口径明确区分 */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 pt-3 text-[11px]" style={{ borderTop: `1px solid ${C.line}`, color: C.sub }}>
            <span>{t("wl.viewDate")}：<b className="tabular-nums" style={{ color: C.ink }}>{date || "—"}</b></span>
            <span>{t("wl.genTime")}：<b className="tabular-nums" style={{ color: C.ink }}>{closing?.date ? `${closing.date} ${closing.decidedAtJst ?? ""} JST` : t("wl.noData")}</b></span>
            <span>{t("wl.quoteTime")}：<b className="tabular-nums" style={{ color: C.ink }}>{fmtClock(data?.quoteUpdatedAt ?? lastUpdated)}</b> · {src}</span>
            <span style={{ color: C.faint }}>{t("wl.autoRefresh")}</span>
          </div>
        </Card>

        {/* ═══ SECTION 2 · 当前行动摘要 ═══ */}
        <Card className="p-4">
          <div className="text-[13px] font-semibold mb-2.5" style={{ color: C.ink }}>{t("wl.action")}</div>
          {closing?.top1 && finalStatus ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-0">
                <div className="text-[11px]" style={{ color: C.faint }}>{t("wl.finalRec")}</div>
                <div className="text-[16px] font-bold flex items-center gap-2" style={{ color: C.ink }}>
                  {closing.top1.name ?? closing.top1.symbol}
                  <span className="text-[11px] font-mono" style={{ color: C.faint }}>{closing.top1.symbol}</span>
                  <ExplainReportButton symbol={closing.top1.symbol} name={closing.top1.name} size="xs" />
                </div>
              </div>
              <div><div className="text-[11px]" style={{ color: C.faint }}>{t("wl.currentPrice")}</div><div className="text-[15px] font-semibold tabular-nums" style={{ color: C.ink }}>{fmtJpy(finalPrice)}</div></div>
              <div><div className="text-[11px]" style={{ color: C.faint }}>{t("wl.buyZone")}</div><div className="text-[13px] tabular-nums" style={{ color: C.sub }}>{closing.top1.entryLow != null && closing.top1.entryHigh != null ? `${fmtJpy(closing.top1.entryLow)} – ${fmtJpy(closing.top1.entryHigh)}` : t("wl.noData")}</div></div>
              <div><div className="text-[11px]" style={{ color: C.faint }}>{t("wl.status")}</div><div className="mt-0.5"><StatusPill st={finalStatus} /></div></div>
              <div className="min-w-0"><div className="text-[11px]" style={{ color: C.faint }}>{t("wl.suggestion")}</div><div className="text-[12.5px]" style={{ color: C.sub }}>{stAction(finalStatus)}</div></div>
            </div>
          ) : (
            <div className="text-[13px]" style={{ color: C.faint }}>{t("wl.noData")}</div>
          )}
        </Card>

        {/* ═══ SECTION 3 · 今日组合监控 ═══ */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
            <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{t("wl.portfolio")}</div>
            {portAgg && (
              <div className="flex items-center gap-x-4 gap-y-1 text-[12px] flex-wrap" style={{ color: C.sub }}>
                <span>{t("wl.avgPerf")} <b className="tabular-nums" style={{ color: retColor(portAgg.avg) }}>{fmtPct(portAgg.avg)}</b></span>
                <span>{t("wl.up")} <b style={{ color: C.green }}>{portAgg.up}</b> · {t("wl.down")} <b style={{ color: C.red }}>{portAgg.down}</b></span>
                {portAgg.strongest && <span>{t("wl.strongest")} <b style={{ color: C.green }}>{portAgg.strongest.name ?? portAgg.strongest.symbol}</b> {fmtPct(portAgg.strongest.ret)}</span>}
                {portAgg.weakest && <span>{t("wl.weakest")} <b style={{ color: C.red }}>{portAgg.weakest.name ?? portAgg.weakest.symbol}</b> {fmtPct(portAgg.weakest.ret)}</span>}
              </div>
            )}
          </div>
          {legRows.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {legRows.map((l) => (
                <div key={l.symbol} className="rounded-xl p-3" style={{ background: C.tile, border: `1px solid ${C.line}` }}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[13px] font-semibold truncate" style={{ color: C.ink }}>{l.name ?? l.symbol}</span>
                    <span className="text-[13px] font-bold tabular-nums shrink-0" style={{ color: C.blue }}>{Math.round(l.weight)}%</span>
                  </div>
                  <div className="text-[10px] font-mono mb-1.5" style={{ color: C.faint }}>{l.symbol}</div>
                  <div className="flex items-center justify-between text-[11px] tabular-nums" style={{ color: C.sub }}>
                    <span>{t("wl.recPrice")} {fmtJpy(l.entryPrice)}</span>
                    <span>{t("wl.currentPrice")} <b style={{ color: C.ink }}>{fmtJpy(l.price)}</b></span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] tabular-nums">{t("wl.retFromEntry")} <b style={{ color: retColor(l.ret) }}>{fmtPct(l.ret)}</b></span>
                    <StatusPill st={l.st} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px]" style={{ color: C.faint }}>{t("wl.portfolioNA")}</div>
          )}
        </Card>

        {/* ═══ SECTION 4 · 异动提醒 ═══ */}
        <Card className="p-4">
          <div className="text-[13px] font-semibold mb-2.5" style={{ color: C.ink }}>{t("wl.movers")}</div>
          {active.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              <Mover label={t("wl.topGain")} it={movTopGain} val={movTopGain?.intradayChangePct ?? null} />
              <Mover label={t("wl.topLoss")} it={movTopLoss} val={movTopLoss?.intradayChangePct ?? null} />
              <Mover label={t("wl.bestSince")} it={movBest} val={movBest?.returnPctFromEntry ?? null} />
              <Mover label={t("wl.worstSince")} it={movWorst} val={movWorst?.returnPctFromEntry ?? null} />
              <div className="rounded-xl p-3" style={{ background: C.tile }}>
                <div className="text-[10px]" style={{ color: C.faint }}>{t("wl.inZoneNow")}</div>
                {inZoneNow.length ? (
                  <div className="text-[12px] mt-1 space-y-0.5" style={{ color: C.ink }}>
                    {inZoneNow.slice(0, 3).map((it) => <div key={it.symbol} className="truncate">🟢 {it.name ?? it.symbol}</div>)}
                    {inZoneNow.length > 3 && <div className="text-[10px]" style={{ color: C.faint }}>+{inZoneNow.length - 3}</div>}
                  </div>
                ) : <div className="text-[12px] mt-1" style={{ color: C.faint }}>{t("wl.noData")}</div>}
              </div>
            </div>
          ) : <div className="text-[13px]" style={{ color: C.faint }}>{t("wl.moversNA")}</div>}
          {focusMovers.length > 0 && (
            <div className="mt-2.5 pt-2.5 flex flex-wrap items-center gap-2 text-[12px]" style={{ borderTop: `1px solid ${C.line}` }}>
              <span className="text-[11px]" style={{ color: C.faint }}>{t("wl.focusMove")}：</span>
              {focusMovers.map((it) => (
                <span key={it.symbol} className="px-2 py-0.5 rounded-full" style={{ background: `${C.purple}12`, color: C.ink }}>{it.name ?? it.symbol} <b style={{ color: retColor(it.intradayChangePct) }}>{fmtPct(it.intradayChangePct)}</b></span>
              ))}
            </div>
          )}
        </Card>

        {/* ═══ 全部真实统计卡（保留原口径）═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <Stat label={t("wl.grp.all")} value={String(stats?.total ?? 0)} sub="STRONG_BUY / BUY" />
          <Stat label={t("wl.up")} value={String(stats?.up ?? 0)} color={C.green} live={trading} />
          <Stat label={t("wl.down")} value={String(stats?.down ?? 0)} color={C.red} live={trading} />
          <Stat label={t("wl.retFromEntry")} value={fmtPct(stats?.avgReturnPct ?? null)} color={retColor(stats?.avgReturnPct ?? null)} live={trading} />
          <Stat label={t("wl.topGain")} value={stats?.topWinner ? fmtPct(stats.topWinner.returnPct) : "—"} sub={stats?.topWinner?.symbol} color={C.green} live={trading} />
          <Stat label={t("wl.topLoss")} value={stats?.topLoser ? fmtPct(stats.topLoser.returnPct) : "—"} sub={stats?.topLoser?.symbol} color={C.red} live={trading} />
          <Stat label={t("wl.rec.sb")} value={fmtPct(stats?.strongBuy.avgReturnPct ?? null)} sub={`${stats?.strongBuy.count ?? 0}`} color={retColor(stats?.strongBuy.avgReturnPct ?? null)} live={trading} />
          <Stat label={t("wl.rec.buy")} value={fmtPct(stats?.buy.avgReturnPct ?? null)} sub={`${stats?.buy.count ?? 0}`} color={retColor(stats?.buy.avgReturnPct ?? null)} live={trading} />
        </div>

        {/* ═══ SECTION 5 · 关注股票列表（分组 + 排序）═══ */}
        <Card>
          <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{t("wl.list")} <span className="text-[11px] font-normal" style={{ color: C.faint }}>· {date} · {sorted.length}/{items.length}</span></div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {groups.map((g) => (
                <button key={g.key} onClick={() => setGroup(g.key)} className="h-7 px-2.5 rounded-full text-[11px] font-medium"
                  style={{ background: group === g.key ? C.ink : C.tile, color: group === g.key ? "#fff" : C.sub }}>{g.label}</button>
              ))}
              <span className="mx-1 text-[11px]" style={{ color: C.faint }}>{t("wl.sort")}</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="h-7 px-2 rounded-full text-[11px] bg-white" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
                {sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {loading ? (
            <div className="p-10 text-center text-[13px]" style={{ color: C.faint }}><span className="animate-pulse">{t("wl.loading")}</span></div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-[13px]" style={{ color: C.faint }}>{t("wl.empty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: C.faint, borderBottom: `1px solid ${C.line}` }} className="text-[11px]">
                    {[t("wl.col.stock"), t("wl.col.rec"), t("wl.col.ai"), t("wl.recPrice"), t("wl.currentPrice"), t("wl.col.today"), t("wl.col.since"), t("wl.col.status"), t("wl.star"), t("wl.focus"), t("wl.note"), t("wl.col.actions")].map((h, i) => (
                      <th key={i} className={`px-3 py-2.5 font-medium whitespace-nowrap ${i >= 2 && i <= 6 ? "text-right" : i >= 8 && i <= 10 ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((it) => {
                    const muted = it.isMuted;
                    const st = statusOf(it.symbol, it.currentPrice, muted);
                    return (
                      <Fragment key={it.id}>
                        <tr style={{ borderBottom: `1px solid ${C.line}`, opacity: muted ? 0.45 : 1 }} className="hover:bg-[#F7F7F9]">
                          <td className="px-3 py-2.5">
                            <button onClick={() => toggleExpand(it.symbol)} className="w-5 h-5 rounded mr-1 text-[10px] align-middle" style={{ background: expanded === it.symbol ? `${C.blue}1A` : C.tile, color: expanded === it.symbol ? C.blue : C.faint }}>{expanded === it.symbol ? "▾" : "▸"}</button>
                            {it.rank != null && <span className="text-[10px] tabular-nums mr-1.5" style={{ color: C.faint }}>#{it.rank}</span>}
                            <Link href={`/stocks/${encodeURIComponent(it.symbol)}`} className="font-semibold hover:underline" style={{ color: C.ink }}>{it.name ?? it.symbol}</Link>
                            <span className="ml-1.5 text-[11px] tabular-nums" style={{ color: C.faint }}>{it.symbol}</span>
                            {it.symbol === finalSym && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: C.red, background: `${C.red}14` }}>{t("wl.grp.final")}</span>}
                            {portSyms.has(it.symbol) && it.symbol !== finalSym && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: C.blue, background: `${C.blue}14` }}>{t("wl.grp.portfolio")}</span>}
                            {it.isFocus && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: C.purple, background: `${C.purple}14` }}>{t("wl.focus")}</span>}
                            <span className="ml-1.5 inline-block"><ExplainReportButton symbol={it.symbol} name={it.name} size="xs" /></span>
                          </td>
                          <td className="px-3 py-2.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: recColor(it.recommendation), background: `${recColor(it.recommendation)}14` }}>{recLabel(it.recommendation)}</span></td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: C.ink }}>{it.score != null ? it.score.toFixed(0) : "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: C.sub }}>{fmtJpy(it.entryPrice)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: C.ink }}>{fmtJpy(it.currentPrice)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: retColor(it.intradayChangePct) }}>{fmtPct(it.intradayChangePct)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: retColor(it.returnPctFromEntry) }}>{fmtPct(it.returnPctFromEntry)}</td>
                          <td className="px-3 py-2.5"><StatusPill st={st} /></td>
                          <td className="px-3 py-2.5 text-center"><button title={t("wl.star")} onClick={() => patch(it.id, { isStarred: !it.isStarred })} disabled={busy} className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.isStarred ? `${C.amber}1A` : C.tile, color: it.isStarred ? C.amber : C.faint }}>★</button></td>
                          <td className="px-3 py-2.5 text-center"><button title={t("wl.focus")} onClick={() => patch(it.id, { isFocus: !it.isFocus })} disabled={busy} className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.isFocus ? `${C.purple}1A` : C.tile, color: it.isFocus ? C.purple : C.faint }}>◎</button></td>
                          <td className="px-3 py-2.5 text-center"><button title={t("wl.note")} onClick={() => setEditNote({ id: it.id, text: it.note ?? "" })} disabled={busy} className="w-7 h-7 rounded-lg text-[13px]" style={{ background: it.note ? `${C.blue}1A` : C.tile, color: it.note ? C.blue : C.faint }}>✎</button></td>
                          <td className="px-3 py-2.5"><button onClick={() => patch(it.id, { isMuted: !muted })} disabled={busy} className="h-7 px-2.5 rounded-lg text-[11px] font-medium" style={{ background: C.tile, color: muted ? C.green : C.faint }}>{muted ? t("wl.unmute") : t("wl.mute")}</button></td>
                        </tr>
                        {expanded === it.symbol && (
                          <tr style={{ borderBottom: `1px solid ${C.line}`, background: "#FBFBFD" }}>
                            <td colSpan={12} className="px-4 py-3">
                              {detailLoading[it.symbol] ? (
                                <div className="text-[12px]" style={{ color: C.faint }}>{t("wl.loading")}</div>
                              ) : (() => {
                                const d = detailCache[it.symbol];
                                if (!d) return <div className="text-[12px]" style={{ color: C.faint }}>{t("wl.noData")}</div>;
                                const cur = it.currentPrice;
                                const upside = d.t1 != null && cur ? ((d.t1 - cur) / cur) * 100 : null;
                                const gap = d.t1 != null && cur ? d.t1 - cur : null;
                                const srcLabel = d.levelSource === "closing" ? "收盘决策目标" : d.levelSource === "derived" ? "系统派生目标" : null;
                                const srcColor = d.levelSource === "closing" ? C.blue : C.amber;
                                return (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-[12px]">
                                    <div>
                                      <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: C.ink }}>目标与止损{srcLabel && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: srcColor, background: `${srcColor}14` }}>{srcLabel}</span>}</div>
                                      {d.explainOk && d.t1 != null ? (
                                        <div className="space-y-0.5" style={{ color: C.sub }}>
                                          <div>目标价 T1：<b style={{ color: C.ink }}>{fmtJpy(d.t1)}</b></div>
                                          <div>止损价 SL：<b style={{ color: d.sl != null ? C.red : C.faint }}>{d.sl != null ? fmtJpy(d.sl) : t("wl.noData")}</b></div>
                                          <div>上涨空间：<b style={{ color: upside != null ? retColor(upside) : C.faint }}>{upside != null ? fmtPct(upside) : t("wl.noData")}</b></div>
                                          <div>距离目标：<b style={{ color: C.ink }}>{gap != null ? `${Math.round(gap).toLocaleString()} 日元` : t("wl.noData")}</b></div>
                                        </div>
                                      ) : <div style={{ color: C.faint }}>{t("wl.noData")}</div>}
                                    </div>
                                    <div>
                                      <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.ink }}>成交量 / 新闻 / 披露</div>
                                      <div className="space-y-0.5" style={{ color: C.sub }}>
                                        <div>成交量变化：{d.indOk && d.volChangePct != null ? <b style={{ color: retColor(d.volChangePct) }}>{fmtPct(d.volChangePct)}<span className="ml-1 text-[10px]" style={{ color: C.faint }}>({Math.round(d.volToday ?? 0).toLocaleString()} / 20d {Math.round(d.volAvg20 ?? 0).toLocaleString()})</span></b> : <b style={{ color: C.faint }}>{t("wl.noData")}</b>}</div>
                                        <div>新闻：{d.newsOk && d.news && (d.news.today + d.news.yst + d.news.d3) > 0 ? <b style={{ color: C.ink }}>{d.news.today} / {d.news.yst} / {d.news.d3}</b> : <b style={{ color: C.faint }}>{t("wl.noData")}</b>}</div>
                                        <div>TDnet：{d.discOk && d.disc && d.disc.count7d > 0 ? <b style={{ color: C.ink }}>{d.disc.count7d}</b> : <b style={{ color: C.faint }}>{t("wl.noData")}</b>}</div>
                                        {d.disc?.latest && <div className="mt-0.5 flex items-start gap-1.5"><span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ color: C.purple, background: `${C.purple}14` }}>{DISC_LABEL[d.disc.latest.category ?? "OTHER"] ?? DISC_LABEL.OTHER}</span><span className="text-[11px]" style={{ color: C.sub }}>{d.disc.latest.date} · {d.disc.latest.title.slice(0, 40)}</span></div>}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.ink }}>AI 推荐理由</div>
                                      {d.reasons.length ? <ul className="space-y-0.5" style={{ color: C.sub }}>{d.reasons.map((r, i) => <li key={i}>· {r}</li>)}</ul> : <div style={{ color: C.faint }}>{t("wl.noData")}</div>}
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
        </Card>

        {/* ═══ SECTION 6 · 数据与口径说明 ═══ */}
        <Card className="p-4">
          <div className="text-[12px] font-semibold mb-1.5" style={{ color: C.ink }}>{t("wl.notes")}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px]" style={{ color: C.sub }}>
            <span>{t("wl.src.rec")}：DailyRecommendation · {t("wl.src.price")}：{src}</span>
            <span>Quote Source：{src} · Last Updated：<b className="tabular-nums" style={{ color: C.ink }}>{fmtStamp(data?.quoteUpdatedAt ?? lastUpdated)}</b></span>
            <span>{t("wl.todayBasis")}</span>
            <span>{t("wl.sinceBasis")}</span>
            <span>{t("wl.frozen")}</span>
            <span>{t("wl.refreshCond")}</span>
          </div>
        </Card>
      </div>

      {/* 备注编辑器 */}
      {editNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setEditNote(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-3" style={{ color: C.ink }}>{t("wl.note")}</div>
            <textarea value={editNote.text} onChange={(e) => setEditNote({ ...editNote, text: e.target.value })} maxLength={500} rows={4} className="w-full rounded-xl p-3 text-[13px] resize-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} placeholder={t("wl.notePlaceholder")} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEditNote(null)} className="h-9 px-4 rounded-full text-[13px] font-medium bg-white" style={{ border: `1px solid ${C.line}`, color: C.sub }}>{t("wl.cancel")}</button>
              <button onClick={() => { patch(editNote.id, { note: editNote.text }); setEditNote(null); }} className="h-9 px-4 rounded-full text-[13px] font-semibold text-white" style={{ background: C.blue }}>{t("wl.save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, color, live }: { label: string; value: string; sub?: string; color?: string; live?: boolean }) {
  return (
    <div className="dash-card p-4" style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16 }}>
      <div className="text-[11px] font-medium flex items-center gap-1" style={{ color: C.faint }}>{label}{live && <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />}</div>
      <div className="text-[22px] font-semibold tabular-nums mt-1" style={{ color: color ?? C.ink }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: C.sub }}>{sub}</div>}
    </div>
  );
}

function Mover({ label, it, val }: { label: string; it: { symbol: string; name: string | null } | null; val: number | null }) {
  return (
    <div className="rounded-xl p-3" style={{ background: C.tile }}>
      <div className="text-[10px]" style={{ color: C.faint }}>{label}</div>
      {it ? (
        <>
          <div className="text-[16px] font-bold tabular-nums mt-0.5" style={{ color: retColor(val) }}>{fmtPct(val)}</div>
          <div className="text-[11px] truncate" style={{ color: C.sub }}>{it.name ?? it.symbol}</div>
        </>
      ) : <div className="text-[13px] mt-1" style={{ color: C.faint }}>—</div>}
    </div>
  );
}
