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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct, fmtScore, fmtJstClock, upDownColor, riskTone } from "@/lib/decision/ds";
import { deriveLiveStatus } from "@/lib/decision/live-status";
import { NewsCatalystPanel, RiskPanel, type NewsItem, type CatItem, type RiskItem } from "@/components/decision/ds/panels";
import StockSearch from "@/components/decision/StockSearch";
import StockDetailModal, { type ReportTarget } from "@/components/decision/StockDetailModal";
import { getPrimaryName } from "@/lib/company-name";

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
const MKT_TONE: Record<string, Tone> = { STRONG_BUY: "red", BUY: "amber", HOLD: "blue", WATCH: "blue", AVOID: "neutral" };
const DISC_LABEL: Record<string, string> = { EARNINGS: "财报", FORECAST_REVISION: "业绩修正", EQUITY: "增发", BUYBACK: "回购", MATERIAL: "重大", DIVIDEND: "分红", OTHER: "披露" };

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
          : <AiRecoView data={data} loading={loading} />}

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

// ═══════════════════════ ① AI 推荐（保留原 Master–Detail）═══════════════════════
function AiRecoView({ data, loading }: { data: Resp | null; loading: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [detail, setDetail] = useState<Record<string, { news: NewsItem[]; cats: CatItem[] }>>({});

  const recos = useMemo(() => data?.recommendations ?? [], [data]);
  const fLevel = sp.get("level") || "";
  const fRisk = sp.get("risk") || "";
  const fZone = sp.get("zone") || "";
  const sort = sp.get("sort") || "rank";
  const sym = sp.get("sym") || "";

  const setQ = useCallback((patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    router.replace(`/decision-v2?${q.toString()}`, { scroll: false });
  }, [sp, router]);

  const filtered = useMemo(() => {
    let list = recos.filter((r) =>
      (!fLevel || r.level === fLevel) && (!fRisk || r.riskLevel === fRisk) && (!fZone || (fZone === "1" ? r.inBuyZone === true : true)));
    if (sort === "rank") list = [...list].sort((a, b) => a.rank - b.rank);
    else if (sort === "ai") list = [...list].sort((a, b) => (b.aiScore ?? -1e9) - (a.aiScore ?? -1e9));
    else if (sort === "upside") list = [...list].sort((a, b) => (b.upside ?? -1e9) - (a.upside ?? -1e9));
    else if (sort === "today") list = [...list].sort((a, b) => (b.todayChangePct ?? -1e9) - (a.todayChangePct ?? -1e9));
    else if (sort === "price") list = [...list].sort((a, b) => (b.currentPrice ?? -1e9) - (a.currentPrice ?? -1e9));
    return list;
  }, [recos, fLevel, fRisk, fZone, sort]);

  const selected = recos.find((r) => r.symbol === sym) ?? recos[0] ?? null;

  useEffect(() => {
    if (!selected || detail[selected.symbol]) return;
    let alive = true;
    const g = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [nw, dc] = await Promise.all([g(`/api/news?symbol=${encodeURIComponent(selected.symbol)}&limit=6`), g(`/api/disclosures?symbol=${encodeURIComponent(selected.symbol)}&limit=8`)]);
      if (!alive) return;
      const seen = new Set<string>();
      const news: NewsItem[] = (Array.isArray(nw) ? nw : []).filter((n: { title: string }) => { const k = n.title?.trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 5).map((n: { id: number; title: string; publishedAt: string; sentiment: string | null; source: string | null }) => ({ id: String(n.id), title: n.title, time: fmtJstClock(n.publishedAt), symbol: selected.symbol, sentiment: n.sentiment, source: n.source }));
      const cats: CatItem[] = (Array.isArray(dc) ? dc : []).slice(0, 6).map((d: { id: number; category: string | null; publishedAt: string; sentiment: string | null; stock?: { name?: string | null }; symbol: string }) => ({ id: String(d.id), category: d.category ?? "OTHER", catLabel: DISC_LABEL[d.category ?? "OTHER"] ?? DISC_LABEL.OTHER, time: fmtJstClock(d.publishedAt), target: d.stock?.name ?? d.symbol, sentiment: d.sentiment }));
      setDetail((s) => ({ ...s, [selected.symbol]: { news, cats } }));
    })();
    return () => { alive = false; };
  }, [selected, detail]);

  if (loading) return <div className="py-10"><AppLoading label={t("dv.sc.view.ai")} /></div>;
  if (!data || data.empty) return <div className="py-16 text-center text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>;

  const sm = data.summary!;
  const meta = data.metadata!;
  const d = selected ? detail[selected.symbol] : undefined;
  const K = ({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) => (
    <div className="flex items-center justify-between py-0.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{k}</span><span className="text-[12px] font-semibold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</span>
    </div>
  );
  const Stat = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
    <div className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile }}><div className="text-[10px]" style={{ color: COLORS.textFaint }}>{k}</div><div className="text-[15px] font-bold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</div></div>
  );

  return (
    <div className="space-y-3">
      {/* ① Summary */}
      <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.rc.summaryTitle")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{data.asOf} · {t("dv.rc.model")} {meta.gptModel ?? "—"}（{t("dv.rc.notSnapshot")}）</span></div>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Stat k={t("dv.rc.total")} v={String(sm.total)} />
          <Stat k={t("dv.rc.lv.STRONG_BUY")} v={String(sm.strongBuy)} tone={COLORS.danger} />
          <Stat k={t("dv.rc.lv.BUY")} v={String(sm.buy)} tone={COLORS.warning} />
          <Stat k={t("dv.rc.lv.WATCH")} v={String(sm.watch)} tone={COLORS.primary} />
          <Stat k={t("dv.rc.lv.SKIP")} v={String(sm.skip)} />
          <Stat k="AI" v={fmtScore(sm.avgAiScore)} />
          <Stat k={t("dv.rc.avgUpside")} v={fmtPct(sm.avgUpside)} tone={(sm.avgUpside ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
          <Stat k={t("dv.rc.totalPos")} v="—" />
        </div>
      </AppCard>

      {/* filter / sort */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <span style={{ color: COLORS.textFaint }}>{t("dv.rc.filter")}:</span>
        {["STRONG_BUY", "BUY", "WATCH", "SKIP"].map((l) => (
          <button key={l} onClick={() => setQ({ level: fLevel === l ? "" : l })} className="h-6 px-2 rounded-full" style={{ background: fLevel === l ? COLORS.text : COLORS.tile, color: fLevel === l ? "#fff" : COLORS.textSecondary }}>{t(`dv.rc.lv.${l}` as Parameters<typeof t>[0])}</button>
        ))}
        {["LOW", "MEDIUM", "HIGH"].map((r) => (
          <button key={r} onClick={() => setQ({ risk: fRisk === r ? "" : r })} className="h-6 px-2 rounded-full" style={{ background: fRisk === r ? COLORS.text : COLORS.tile, color: fRisk === r ? "#fff" : COLORS.textSecondary }}>{r}</button>
        ))}
        <button onClick={() => setQ({ zone: fZone === "1" ? "" : "1" })} className="h-6 px-2 rounded-full" style={{ background: fZone === "1" ? COLORS.text : COLORS.tile, color: fZone === "1" ? "#fff" : COLORS.textSecondary }}>{t("dv.rc.st.INZONE")}</button>
        <span className="ml-2" style={{ color: COLORS.textFaint }}>{t("dv.rc.sortBy")}:</span>
        <select value={sort} onChange={(e) => setQ({ sort: e.target.value })} className="h-6 px-1.5 rounded-full bg-white" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
          <option value="rank">{t("dv.rc.rank")}</option><option value="ai">AI</option><option value="upside">{t("dv.rc.col.upside")}</option><option value="today">{t("dv.rc.col.today")}</option><option value="price">{t("dc.ov.currentPrice")}</option>
        </select>
        <button onClick={() => setQ({ level: "", risk: "", zone: "", sort: "", sym: "" })} className="h-6 px-2 rounded-full" style={{ background: COLORS.tile, color: COLORS.primary }}>{t("dv.rc.reset")}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
        {/* ② Top10 Table（Master） */}
        <div className="min-w-0">
          <AppCard>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                  {["#", t("wl.col.stock"), t("dc.ov.currentPrice"), t("dc.ov.target"), t("dc.ov.stopLossP"), t("dv.rc.col.upside"), t("dv.rc.col.today"), "AI", t("dv.rc.col.level"), t("wl.col.status")].map((h, i) => (
                    <th key={i} className={`py-1.5 font-medium ${i <= 1 ? "text-left pr-2 sticky bg-white" : "text-right px-2"}`} style={i <= 1 ? { left: i === 0 ? 0 : 24, background: COLORS.card } : undefined}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((r) => {
                    const es = execState(r); const on = selected?.symbol === r.symbol;
                    return (
                      <tr key={r.symbol} onClick={() => setQ({ sym: r.symbol })} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}`, background: on ? `${COLORS.primary}0c` : undefined }}>
                        <td className="py-1.5 pr-2 tabular-nums sticky left-0" style={{ color: COLORS.textFaint, background: on ? "#F5F8FF" : COLORS.card }}>{r.rank}</td>
                        <td className="py-1.5 pr-2 sticky" style={{ left: 24, background: on ? "#F5F8FF" : COLORS.card }}>
                          <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} onClick={(e) => e.stopPropagation()} className="hover:underline" style={{ color: COLORS.text }}>{r.name}</Link>
                          <span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.currentPrice)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{fmtJpy(r.target1)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.danger }}>{fmtJpy(r.stopLoss)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.upside) }}>{fmtPct(r.upside)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.todayChangePct) }}>{fmtPct(r.todayChangePct)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: COLORS.text }}>{fmtScore(r.aiScore)}</td>
                        <td className="py-1.5 px-2 text-right">{r.level ? <AppBadge tone={LV_TONE[r.level]}>{t(`dv.rc.lv.${r.level}` as Parameters<typeof t>[0])}</AppBadge> : <span style={{ color: COLORS.textFaint }}>—</span>}</td>
                        <td className="py-1.5 px-2 text-right"><AppBadge tone={es.tone}>{t(es.key as Parameters<typeof t>[0])}</AppBadge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>SSOT: {t("dc.tab.closing")} · {t("dv.rc.snapshotTag")} ({data.asOf}) · {t("dv.rc.probNote")}</div>
            </div>
          </AppCard>
        </div>

        {/* Right: 选中股详情 */}
        <div className="space-y-3 min-w-0">
          {selected ? (
            <>
              {/* ③ Detail + ④ Execution */}
              <AppCard header={<div className="flex items-center gap-2"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{selected.name}</span><span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{selected.symbol}</span>{selected.level && <AppBadge tone={LV_TONE[selected.level]}>{t(`dv.rc.lv.${selected.level}` as Parameters<typeof t>[0])}</AppBadge>}</div>}>
                {(selected.reason || selected.gptNote) && <p className="text-[12px] mb-2 leading-relaxed" style={{ color: COLORS.textSecondary }}><b style={{ color: COLORS.textFaint }}>{t("dv.rc.combined")}：</b>{selected.gptNote || selected.reason}</p>}
                <div className="grid grid-cols-2 gap-x-4">
                  <K k={t("dc.ov.currentPrice")} v={fmtJpy(selected.currentPrice)} />
                  <K k={t("dv.rc.ex.entry")} v={selected.entryLow != null ? `${fmtJpy(selected.entryLow)}~${fmtJpy(selected.entryHigh)}` : "—"} />
                  <K k={t("dv.rc.ex.tp")} v={fmtJpy(selected.target1)} tone={COLORS.success} />
                  <K k={t("dv.rc.ex.sl")} v={fmtJpy(selected.stopLoss)} tone={COLORS.danger} />
                  <K k={t("dv.rc.col.upside")} v={fmtPct(selected.upside)} tone={upDownColor(selected.upside)} />
                  <K k={t("dv.rc.col.downside")} v={fmtPct(selected.downside)} tone={COLORS.danger} />
                  <K k={t("dv.rc.col.prob")} v="—" />
                  <K k={t("dv.rc.ex.period")} v={selected.holdPeriod ?? "—"} />
                  <K k={t("dv.rc.ex.firstPos")} v="—" />
                  <K k={t("dv.rc.ex.state")} v={<AppBadge tone={execState(selected).tone}>{t(execState(selected).key as Parameters<typeof t>[0])}</AppBadge>} />
                </div>
              </AppCard>

              {/* News + Catalyst */}
              <NewsCatalystPanel news={d?.news ?? []} catalysts={d?.cats ?? []} />

              {/* Risk（个股） */}
              <RiskPanel titleKey="dv.ov.risk" overall={selected.riskLevel ?? "—"} overallTone={riskTone(selected.riskLevel)}
                items={([
                  { labelKey: "dv.ov.rk.index", level: selected.riskLevel ?? "—", tone: riskTone(selected.riskLevel) },
                  { labelKey: "dv.ov.rk.news", level: (selected.newsSentiment ?? 0) < 0 ? "MED" : "LOW", tone: riskTone((selected.newsSentiment ?? 0) < 0 ? "MED" : "LOW") },
                  { labelKey: "dv.ov.rk.vol", level: selected.riskLevel ?? "—", tone: riskTone(selected.riskLevel) },
                ] as RiskItem[])} />

              {/* Similar Ideas */}
              <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.rc.similar")}</span>}>
                {(() => {
                  const sim = recos.filter((r) => r.symbol !== selected.symbol && r.sector && r.sector === selected.sector).slice(0, 4);
                  return sim.length ? (
                    <div className="space-y-1">{sim.map((r) => (
                      <button key={r.symbol} onClick={() => setQ({ sym: r.symbol })} className="w-full flex items-center justify-between text-[12px] py-0.5">
                        <span className="truncate" style={{ color: COLORS.text }}>{r.name} <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></span>
                        <span className="tabular-nums" style={{ color: COLORS.textSecondary }}>AI {fmtScore(r.aiScore)}</span>
                      </button>))}
                    </div>
                  ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.rc.noReliable")}</div>;
                })()}
              </AppCard>

              {/* AI Confidence */}
              <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.rc.confidence")}</span>}>
                <div className="grid grid-cols-2 gap-x-4">
                  <K k="AI" v={fmtScore(selected.aiScore)} tone={COLORS.primary} />
                  <K k="GPT" v={fmtScore(selected.gptScore)} />
                  <K k={t("dv.rc.consistency")} v="—" />
                  <K k={t("dv.rc.dataComplete")} v="—" />
                  <K k={t("dv.rc.histCase")} v="—" />
                  <K k={t("dv.rc.modelVer")} v={meta.gptModel ?? "—"} />
                </div>
              </AppCard>
            </>
          ) : <AppCard><div className="text-[12px] py-6 text-center" style={{ color: COLORS.textFaint }}>{t("dv.rc.selectHint")}</div></AppCard>}
        </div>
      </div>
    </div>
  );
}
