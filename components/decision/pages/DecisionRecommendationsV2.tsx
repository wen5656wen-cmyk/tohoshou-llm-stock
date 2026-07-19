"use client";

// ── 股票中心 V2（P2 · /decision-v2?tab=picks&view=ai|all|fav）────────────────────
// 全站股票枢纽：顶部搜索任意股票 + 收盘决策状态带 + 三视图切换。
//   ① AI 推荐（view=ai，默认）：正式 AI Buy List（SSOT=/api/decision/recommendations，
//      Master–Detail 保留：左 Top10 表选中 → 右详情/执行/新闻/风险/相似/信心）。
//   ② 全市场（view=all）：/api/screener 全市场浏览 + 等级筛选 + 加入自选。
//   ③ 自选（view=fav）：/api/watchlist 收藏 CRUD。
// 状态带 = 收盘决策择时/组合面（verdict + 建仓只数），点入口跳决策总览看明细（不搬内容）。
// 任意股票行/搜索命中 → StockDetailModal 研究报告。缺失字段诚实显 —，不伪造。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct, fmtScore, upDownColor } from "@/lib/decision/ds";
import { deriveLiveStatus } from "@/lib/decision/live-status";
import { buildChartBars, type ChartBar } from "@/components/charts/LightweightStockChart";
import StockSearch from "@/components/decision/StockSearch";
import StockDetailModal, { type ReportTarget } from "@/components/decision/StockDetailModal";
import { getPrimaryName } from "@/lib/company-name";

const LightweightStockChart = dynamic(() => import("@/components/charts/LightweightStockChart"), { ssr: false });

type Verdict = { action: string | null; reason: string | null; portfolioCount: number; top1: { symbol: string; name: string } | null };
type Reco = {
  rank: number; symbol: string; name: string; sector: string | null;
  currentPrice: number | null; todayChangePct: number | null;
  entryLow: number | null; entryHigh: number | null; target1: number | null; stopLoss: number | null;
  upside: number | null; downside: number | null; aiScore: number | null; gptScore: number | null;
  riskLevel: string | null; level: string | null; inBuyZone: boolean | null; newsSentiment: number | null;
  holdPeriod: string | null; reason: string | null; gptNote: string | null;
};
type Resp = { empty?: boolean; verdict?: Verdict; summary?: { total: number; strongBuy: number; buy: number; watch: number; skip: number; avgAiScore: number | null; avgUpside: number | null; avgRisk: string | null; totalPosition: number | null }; recommendations?: Reco[]; metadata?: { date: string; decidedAtJst: string | null; gptModel: string | null; versionNote: string }; asOf?: string | null; sourceStatus?: { quote?: string } };
type ScreenerRow = { symbol: string; name: string; nameZh: string | null; sector: string | null; market?: string | null; adaptiveScore: number | null; recommendationV2: string | null; latestClose: number | null; return5d: number | null };
type FavScore = { latestClose: number | null; adaptiveScore: number | null; recommendationV2: string | null; realtimePrice: number | null; changePct: number | null } | null;
type FavRow = { symbol: string; name: string; nameZh: string | null; sector: string | null; market?: string | null; score: FavScore };

const LV_TONE: Record<string, Tone> = { STRONG_BUY: "red", BUY: "amber", WATCH: "blue", SKIP: "neutral" };
const LV_COLOR: Record<string, string> = { STRONG_BUY: COLORS.danger, BUY: COLORS.warning, WATCH: COLORS.primary, SKIP: COLORS.textMuted };
const MKT_TONE: Record<string, Tone> = { STRONG_BUY: "red", BUY: "amber", HOLD: "blue", WATCH: "blue", AVOID: "neutral" };
const starsFor = (a: number | null) => { const n = a == null ? 0 : a >= 80 ? 5 : a >= 70 ? 4 : a >= 60 ? 3 : a >= 45 ? 2 : 1; return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); };
const gradeFor = (a: number | null) => (a == null ? "—" : a >= 85 ? "A+" : a >= 78 ? "A" : a >= 70 ? "B+" : a >= 60 ? "B" : "C");
function aiBar(a: number | null) {
  const v = a ?? 0;
  const c = v >= 80 ? COLORS.danger : v >= 70 ? COLORS.warning : v >= 45 ? COLORS.primary : COLORS.textMuted;
  return (
    <span className="inline-flex items-center gap-1.5 justify-end">
      <span className="tabular-nums font-semibold" style={{ color: c }}>{a == null ? "—" : Math.round(v)}</span>
      <span className="inline-block rounded-full" style={{ width: 30, height: 4, background: COLORS.track }}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: c }} /></span>
    </span>
  );
}

// 执行状态：live-status → 5 态
function execState(r: Reco): { key: string; tone: Tone } {
  const st = deriveLiveStatus({ price: r.currentPrice, entryLow: r.entryLow, entryHigh: r.entryHigh, target: r.target1, stop: r.stopLoss });
  switch (st) {
    case "IN_ZONE": return { key: "dv.rc.st.INZONE", tone: "green" };
    case "BELOW_ZONE": return { key: "dv.rc.st.READY", tone: "green" };
    case "ABOVE_ZONE": case "REACHED_TARGET": return { key: "dv.rc.st.WATCH", tone: "amber" };
    case "BELOW_STOP": return { key: "dv.rc.st.INVALID", tone: "red" };
    default: return { key: "dv.rc.st.NA", tone: "neutral" };
  }
}

// ═══════════════════════ Shell（搜索 + 状态带 + 三视图）═══════════════════════
export default function DecisionRecommendationsV2() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const view = sp.get("view") || "ai";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ReportTarget | null>(null);
  const openDetail = (symbol: string, name?: string) => setDetail({ symbol, name: name ?? symbol });

  useEffect(() => {
    let alive = true;
    fetch("/api/decision/recommendations", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) { setData(j); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const setView = (v: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("tab", "picks"); q.set("view", v);
    ["level", "risk", "zone", "sort", "sym"].forEach((k) => q.delete(k)); // 切视图清 AI 筛选态，避免串味
    router.replace(`/decision-v2?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      {/* 搜索任意股票 + 三视图切换 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] max-w-[460px]"><StockSearch onPick={openDetail} /></div>
        <div className="inline-flex p-1 rounded-xl gap-0.5" style={{ background: COLORS.track }}>
          {(["ai", "all", "fav"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold" style={{ background: view === v ? COLORS.card : "transparent", color: view === v ? COLORS.text : COLORS.textSecondary, boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.08)" : undefined }}>{t(`dv.sc.view.${v}` as Parameters<typeof t>[0])}</button>
          ))}
        </div>
      </div>

      {/* 收盘决策状态带（择时/组合面 → 入口跳决策总览） */}
      <VerdictBand verdict={data?.verdict ?? null} slim={view !== "ai"} onOverview={() => router.replace("/decision-v2?tab=overview", { scroll: false })} />

      {/* 视图内容 */}
      {view === "all" ? <MarketBrowseView onDetail={openDetail} />
        : view === "fav" ? <WatchlistView onDetail={openDetail} />
          : <AiRecoView data={data} loading={loading} onDetail={openDetail} />}

      <StockDetailModal report={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

// ═══════════════════════ 收盘决策状态带 ═══════════════════════
function VerdictBand({ verdict, slim, onOverview }: { verdict: Verdict | null; slim: boolean; onOverview: () => void }) {
  const { t } = useI18n();
  const action = verdict?.action ?? null;
  const conf = action === "BUY_TODAY" ? { tone: COLORS.success, wash: `${COLORS.success}14` }
    : action === "WATCH_ONLY" ? { tone: COLORS.warning, wash: `${COLORS.warning}1f` }
      : action === "STAY_CASH" ? { tone: COLORS.textMuted, wash: COLORS.tile }
        : { tone: COLORS.textFaint, wash: COLORS.tile };
  const pad = slim ? 7 : 10;
  return (
    <div className="flex items-center gap-2.5 flex-wrap rounded-xl px-3.5" style={{ background: conf.wash, borderLeft: `3px solid ${conf.tone}`, border: `1px solid ${COLORS.border}`, paddingTop: pad, paddingBottom: pad }}>
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-md" style={{ background: conf.tone, color: "#fff" }}>
        {action ? t(`dv.sc.vd.${action}` as Parameters<typeof t>[0]) : t("dv.sc.band.noVerdict")}
      </span>
      {action && (
        <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>
          <b style={{ color: COLORS.text }}>{t("dv.sc.band.closing")}</b>
          {action === "BUY_TODAY" && verdict ? ` · ${t("dv.sc.band.build")} ${verdict.portfolioCount} ${t("dv.sc.band.units")}` : ""}
          {!slim ? <span style={{ color: COLORS.textFaint }}> · {t("dv.sc.band.live")}</span> : null}
        </span>
      )}
      <button onClick={onOverview} className="ml-auto text-[12px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: COLORS.primary, border: `1px solid ${COLORS.border}`, background: COLORS.card }}>{t("dv.sc.band.toOverview")} →</button>
    </div>
  );
}

// ═══════════════════════ ② 全市场浏览（screener）═══════════════════════
function MarketBrowseView({ onDetail }: { onDetail: (s: string, n?: string) => void }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);
  const [level, setLevel] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true; setRows(null);
    const url = `/api/screener?limit=50&sort=adaptiveScore${level ? `&recommendationV2=${level}` : ""}`;
    fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setRows(Array.isArray(j?.scores) ? j.scores : []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [level]);

  const addFav = async (r: ScreenerRow) => {
    setAdded((s) => new Set(s).add(r.symbol));
    await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: r.symbol, name: r.name, sector: r.sector, market: r.market }) }).catch(() => {});
  };
  const disp = (r: { name: string; nameZh: string | null }) => getPrimaryName({ name: r.name, nameZh: r.nameZh }, lang);

  return (
    <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.sc.all.title")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("dv.sc.all.hint")}</span></div>}>
      <div className="flex items-center gap-1.5 flex-wrap text-[11px] mb-2">
        {["", "STRONG_BUY", "BUY", "HOLD", "WATCH"].map((l) => (
          <button key={l || "all"} onClick={() => setLevel(l)} className="h-6 px-2.5 rounded-full" style={{ background: level === l ? COLORS.text : COLORS.tile, color: level === l ? "#fff" : COLORS.textSecondary }}>{l ? t(`dv.sc.lv.${l}` as Parameters<typeof t>[0]) : t("dv.sc.all.filterAll")}</button>
        ))}
      </div>
      {rows === null ? <div className="py-8"><AppLoading label={t("dv.sc.loading")} /></div>
        : rows.length === 0 ? <div className="text-[12px] py-8 text-center" style={{ color: COLORS.textFaint }}>{t("dv.sc.all.empty")}</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                  {[t("wl.col.stock"), t("dc.ov.currentPrice"), t("dv.sc.col.ret5d"), "AI", t("dv.rc.col.level"), t("dv.sc.col.sector"), ""].map((h, i) => (
                    <th key={i} className={`py-1.5 font-medium ${i === 0 ? "text-left pr-2" : i >= 5 ? "text-left px-2" : "text-right px-2"}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.symbol} onClick={() => onDetail(r.symbol, disp(r))} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                      <td className="py-1.5 pr-2"><span style={{ color: COLORS.text }}>{disp(r)}</span><span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                      <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.latestClose)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.return5d) }}>{fmtPct(r.return5d)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: COLORS.text }}>{fmtScore(r.adaptiveScore)}</td>
                      <td className="py-1.5 px-2 text-right">{r.recommendationV2 ? <AppBadge tone={MKT_TONE[r.recommendationV2] ?? "neutral"}>{t(`dv.sc.lv.${r.recommendationV2}` as Parameters<typeof t>[0])}</AppBadge> : <span style={{ color: COLORS.textFaint }}>—</span>}</td>
                      <td className="py-1.5 px-2 text-left"><span className="text-[11px]" style={{ color: COLORS.textSecondary }}>{r.sector ?? "—"}</span></td>
                      <td className="py-1.5 px-2 text-right"><button onClick={(e) => { e.stopPropagation(); addFav(r); }} className="h-6 px-2 rounded-full text-[11px]" style={{ border: `1px solid ${added.has(r.symbol) ? COLORS.success : COLORS.border}`, color: added.has(r.symbol) ? COLORS.success : COLORS.primary, background: COLORS.card }}>{added.has(r.symbol) ? "✓" : t("dv.pf.btnAdd")}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </AppCard>
  );
}

// ═══════════════════════ ③ 自选（watchlist）═══════════════════════
function WatchlistView({ onDetail }: { onDetail: (s: string, n?: string) => void }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<FavRow[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/watchlist", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((j) => setRows(Array.isArray(j) ? j : [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const remove = async (sym: string) => {
    setRows((rs) => (rs ? rs.filter((x) => x.symbol !== sym) : rs));
    await fetch(`/api/watchlist?symbol=${encodeURIComponent(sym)}`, { method: "DELETE" }).catch(() => {});
  };
  const disp = (r: { name: string; nameZh: string | null }) => getPrimaryName({ name: r.name, nameZh: r.nameZh }, lang);

  if (rows === null) return <div className="py-10"><AppLoading label={t("dv.sc.loading")} /></div>;
  if (rows.length === 0) return (
    <AppCard><div className="py-12 text-center">
      <div className="text-[14px] font-semibold" style={{ color: COLORS.text }}>{t("dv.sc.fav.empty")}</div>
      <div className="text-[12px] mt-1.5" style={{ color: COLORS.textFaint }}>{t("dv.sc.fav.emptyHint")}</div>
    </div></AppCard>
  );

  return (
    <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.sc.fav.title")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{rows.length}</span></div>}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
            {[t("wl.col.stock"), t("dc.ov.currentPrice"), t("dv.rc.col.today"), "AI", t("dv.rc.col.level"), ""].map((h, i) => (
              <th key={i} className={`py-1.5 font-medium ${i === 0 ? "text-left pr-2" : i >= 5 ? "text-right px-2" : "text-right px-2"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const price = r.score?.realtimePrice ?? r.score?.latestClose ?? null;
              const rec = r.score?.recommendationV2 ?? null;
              return (
                <tr key={r.symbol} onClick={() => onDetail(r.symbol, disp(r))} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                  <td className="py-1.5 pr-2"><span style={{ color: COLORS.text }}>{disp(r)}</span><span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                  <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(price)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.score?.changePct ?? null) }}>{fmtPct(r.score?.changePct ?? null)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: COLORS.text }}>{fmtScore(r.score?.adaptiveScore ?? null)}</td>
                  <td className="py-1.5 px-2 text-right">{rec ? <AppBadge tone={MKT_TONE[rec] ?? "neutral"}>{t(`dv.sc.lv.${rec}` as Parameters<typeof t>[0])}</AppBadge> : <span style={{ color: COLORS.textFaint }}>—</span>}</td>
                  <td className="py-1.5 px-2 text-right"><button onClick={(e) => { e.stopPropagation(); remove(r.symbol); }} className="h-6 px-2 rounded-full text-[11px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary, background: COLORS.card }}>{t("dv.sc.fav.remove")}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
}

// ═══════════════════════ ① AI 推荐（按设计稿重建：左执行榜 + 右决策卡）═══════════════════════
function AiRecoView({ data, loading, onDetail }: { data: Resp | null; loading: boolean; onDetail: (s: string, n?: string) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [chart, setChart] = useState<Record<string, ChartBar[]>>({});
  const [added, setAdded] = useState<Set<string>>(new Set());

  const recos = useMemo(() => data?.recommendations ?? [], [data]);
  const sym = sp.get("sym") || "";
  const setQ = useCallback((patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    router.replace(`/decision-v2?${q.toString()}`, { scroll: false });
  }, [sp, router]);

  const sorted = useMemo(() => [...recos].sort((a, b) => a.rank - b.rank), [recos]);
  const selected = recos.find((r) => r.symbol === sym) ?? recos[0] ?? null;

  const addFav = async (r: Reco) => {
    setAdded((s) => new Set(s).add(r.symbol));
    await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: r.symbol, name: r.name, sector: r.sector }) }).catch(() => {});
  };

  // 选中股走势图懒加载（近 60 日日线，复用 /indicators，先全序列算 MA 再切窗）
  useEffect(() => {
    if (!selected || chart[selected.symbol]) return;
    let alive = true;
    (async () => {
      const ind = await fetch(`/api/stocks/${encodeURIComponent(selected.symbol)}/indicators`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive) return;
      const series = Array.isArray(ind?.series?.all) && ind.series.all.length ? ind.series.all : (ind?.series?.last250 ?? []);
      setChart((s) => ({ ...s, [selected.symbol]: series.length ? buildChartBars(series, 60) : [] }));
    })();
    return () => { alive = false; };
  }, [selected, chart]);

  if (loading) return <div className="py-10"><AppLoading label={t("dv.sc.view.ai")} /></div>;
  if (!data || data.empty) return <div className="py-16 text-center text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>;

  const s = selected;
  const bars = s ? (chart[s.symbol] ?? []) : [];
  const P = ({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) => (
    <div><div className="text-[10px]" style={{ color: COLORS.textMuted }}>{k}</div><div className="text-[13px] font-bold tabular-nums mt-0.5" style={{ color: tone ?? COLORS.text }}>{v}</div></div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
      {/* 左：AI 买入执行榜 */}
      <div className="min-w-0">
        <AppCard header={<div className="flex items-center gap-2"><AppBadge tone="red">AI</AppBadge><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.sc.buyList")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("dv.sc.buyListSub")}</span></div>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                {["#", t("wl.col.stock"), t("dv.rc.col.level"), "AI", t("dc.ov.currentPrice"), t("dv.rc.col.today"), t("dv.sc.col.zone"), t("wl.col.status"), ""].map((h, i) => (
                  <th key={i} className={`py-1.5 font-medium ${i <= 1 ? "text-left pr-2" : i === 6 ? "text-left px-2" : "text-right px-2"}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((r) => {
                  const es = execState(r); const on = s?.symbol === r.symbol;
                  return (
                    <tr key={r.symbol} onClick={() => setQ({ sym: r.symbol })} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}`, background: on ? `${COLORS.primary}0c` : undefined }}>
                      <td className="py-2 pr-2 tabular-nums" style={{ color: COLORS.textFaint }}>{r.rank}</td>
                      <td className="py-2 pr-2"><button onClick={(e) => { e.stopPropagation(); onDetail(r.symbol, r.name); }} className="hover:underline text-left" style={{ color: COLORS.text, background: "none", border: "none", padding: 0, cursor: "pointer" }}>{r.name}</button><span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                      <td className="py-2 px-2 text-right">{r.level ? <AppBadge tone={LV_TONE[r.level]}>{t(`dv.rc.lv.${r.level}` as Parameters<typeof t>[0])}</AppBadge> : <span style={{ color: COLORS.textFaint }}>—</span>}</td>
                      <td className="py-2 px-2 text-right">{aiBar(r.aiScore)}</td>
                      <td className="py-2 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.currentPrice)}</td>
                      <td className="py-2 px-2 text-right tabular-nums" style={{ color: upDownColor(r.todayChangePct) }}>{fmtPct(r.todayChangePct)}</td>
                      <td className="py-2 px-2 text-left tabular-nums text-[11px]" style={{ color: COLORS.textSecondary }}>{r.entryLow != null ? `${fmtJpy(r.entryLow)}~${fmtJpy(r.entryHigh)}` : "—"}</td>
                      <td className="py-2 px-2 text-right"><AppBadge tone={es.tone}>{t(es.key as Parameters<typeof t>[0])}</AppBadge></td>
                      <td className="py-2 px-2 text-right"><button onClick={(e) => { e.stopPropagation(); addFav(r); }} className="h-6 px-2 rounded-full text-[11px] whitespace-nowrap" style={{ border: `1px solid ${added.has(r.symbol) ? COLORS.success : COLORS.border}`, color: added.has(r.symbol) ? COLORS.success : COLORS.primary, background: COLORS.card }}>{added.has(r.symbol) ? "✓" : t("dv.pf.btnAdd")}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>SSOT: {t("dc.tab.closing")} · {t("dv.rc.snapshotTag")} ({data.asOf})</div>
          </div>
        </AppCard>
      </div>

      {/* 右：AI 决策卡（按设计稿：价格/星级/结论/走势/计划/操作） */}
      <div className="min-w-0">
        {s ? (
          <AppCard>
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-[17px] font-extrabold tabular-nums" style={{ color: COLORS.text }}>{s.symbol}</div><div className="text-[12px]" style={{ color: COLORS.textSecondary }}>{s.name}</div></div>
              <div className="text-right"><div className="text-[19px] font-extrabold tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(s.currentPrice)}</div><div className="text-[12px] font-semibold tabular-nums" style={{ color: upDownColor(s.todayChangePct) }}>{fmtPct(s.todayChangePct)}</div></div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <span className="text-[15px]" style={{ color: COLORS.warning, letterSpacing: "1px" }}>{starsFor(s.aiScore)}</span>
              {s.level && <span className="text-[12px] font-bold" style={{ color: LV_COLOR[s.level] ?? COLORS.textSecondary }}>{t(`dv.rc.lv.${s.level}` as Parameters<typeof t>[0])}</span>}
              <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ color: COLORS.textSecondary, background: COLORS.tile }}>AI {fmtScore(s.aiScore)} · {gradeFor(s.aiScore)}</span>
            </div>

            {(s.gptNote || s.reason) && (
              <div className="mt-3">
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: COLORS.success, background: `${COLORS.success}1f` }}>{t("dv.sc.band.closing")} 15:15 · GPT</span>
                <p className="text-[12px] leading-relaxed mt-1.5" style={{ color: COLORS.textSecondary }}><b style={{ color: COLORS.text }}>{t("dv.sc.concl")}</b>{s.gptNote || s.reason}</p>
              </div>
            )}

            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: COLORS.textFaint }}><span>{t("dv.sc.chart60")}</span><span>MA5 · MA20 · MA60</span></div>
              {bars.length ? <LightweightStockChart data={bars} height={150} theme="light" /> : <div className="flex items-center justify-center rounded-lg" style={{ height: 150, background: COLORS.tile, color: COLORS.textFaint, fontSize: 12 }}>—</div>}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 pt-3" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <P k={t("dv.rc.ex.entry")} v={s.entryLow != null ? `${fmtJpy(s.entryLow)}~${fmtJpy(s.entryHigh)}` : "—"} tone={COLORS.primary} />
              <P k={t("dv.rc.ex.tp")} v={s.target1 != null ? <>{fmtJpy(s.target1)} <span className="text-[11px] font-semibold">{fmtPct(s.upside)}</span></> : "—"} tone={COLORS.success} />
              <P k={t("dv.rc.ex.sl")} v={s.stopLoss != null ? <>{fmtJpy(s.stopLoss)} <span className="text-[11px] font-semibold">{fmtPct(s.downside)}</span></> : "—"} tone={COLORS.danger} />
              <P k={t("dv.rc.ex.period")} v={s.holdPeriod ?? "—"} />
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => onDetail(s.symbol, s.name)} className="flex-1 text-[13px] font-semibold py-2.5 rounded-lg" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text, background: COLORS.card }}>{t("dv.sc.report")}</button>
              <button onClick={() => addFav(s)} className="flex-1 text-[13px] font-semibold py-2.5 rounded-lg" style={{ background: COLORS.primary, color: "#fff", border: `1px solid ${COLORS.primary}` }}>{added.has(s.symbol) ? "✓ " + t("dv.sc.addFav") : t("dv.sc.addFav")}</button>
            </div>
          </AppCard>
        ) : <AppCard><div className="text-[12px] py-6 text-center" style={{ color: COLORS.textFaint }}>{t("dv.rc.selectHint")}</div></AppCard>}
      </div>
    </div>
  );
}
