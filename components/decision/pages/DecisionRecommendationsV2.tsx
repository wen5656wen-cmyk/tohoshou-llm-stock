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
// AI 评分分档配色（P17-04 §二）：90+深绿 / 80-89绿 / 70-79橙 / 60-69黄 / <60灰
const SCORE_COLOR = (a: number | null): string => (a == null ? COLORS.textMuted : a >= 90 ? "#1E8E3E" : a >= 80 ? COLORS.success : a >= 70 ? COLORS.warning : a >= 60 ? "#EAB308" : COLORS.textMuted);
// 上涨空间分档配色（P17-04 §一）：>20深绿 / 10-20绿 / 5-10浅绿 / 0-5灰 / <0红
const UP_COLOR = (v: number | null | undefined): string => (v == null ? COLORS.textFaint : v > 20 ? "#1E8E3E" : v >= 10 ? COLORS.success : v >= 5 ? "#5FCF80" : v >= 0 ? COLORS.textMuted : COLORS.danger);
// 收益风险比 = (目标价-当前价)/(当前价-止损价)
const rrRatio = (cur: number | null, target: number | null, stop: number | null): string => {
  if (cur == null || target == null || stop == null || cur <= stop || target <= cur) return "—";
  return `${((target - cur) / (cur - stop)).toFixed(1)} : 1`;
};
// 列表 AI 评分单元：数字(按分档配色) + 等级
function aiCell(a: number | null) {
  const c = SCORE_COLOR(a);
  return (
    <span className="inline-flex items-baseline gap-1 justify-end">
      <span className="tabular-nums font-bold" style={{ color: c }}>{a == null ? "—" : Math.round(a)}</span>
      <span className="text-[10px] font-bold" style={{ color: c }}>{gradeFor(a)}</span>
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
  const [favSet, setFavSet] = useState<Set<string>>(new Set());
  const openDetail = (symbol: string, name?: string) => setDetail({ symbol, name: name ?? symbol });

  useEffect(() => {
    let alive = true;
    fetch("/api/decision/recommendations", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) { setData(j); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // 自选成员（真实 watchlist）——加入按钮据此显示 加入/已加入，避免已加入仍显「加入」
  const loadFav = useCallback(() => {
    fetch("/api/watchlist", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((j: unknown) => setFavSet(new Set((Array.isArray(j) ? j : []).map((x: { symbol: string }) => x.symbol)))).catch(() => {});
  }, []);
  useEffect(() => { loadFav(); }, [loadFav]);
  const toggleFav = useCallback(async (symbol: string, meta?: { name?: string | null; sector?: string | null; market?: string | null }) => {
    const has = favSet.has(symbol);
    setFavSet((s) => { const n = new Set(s); if (has) n.delete(symbol); else n.add(symbol); return n; });
    if (has) await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" }).catch(() => {});
    else await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, ...meta }) }).catch(() => {});
  }, [favSet]);

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
        <div className="flex-1 min-w-[220px] max-w-[460px]"><StockSearch onPick={openDetail} endpoint="/api/screener" pickRows={(j) => (Array.isArray(j?.scores) ? j.scores : [])} mapRow={(r) => ({ symbol: r.symbol, name: r.name, nameZh: r.nameZh, price: r.latestClose, changeRate: null })} /></div>
        <div className="flex flex-wrap p-1 rounded-xl gap-0.5" style={{ background: COLORS.track }}>
          {(["ai", "all", "fav", "holdings", "wait", "watch", "allstk"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold" style={{ background: view === v ? COLORS.card : "transparent", color: view === v ? COLORS.text : COLORS.textSecondary, boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.08)" : undefined }}>{t(`dv.sc.view.${v}` as Parameters<typeof t>[0])}</button>
          ))}
        </div>
      </div>

      {/* 收盘决策状态带（择时/组合面 → 入口跳决策总览） */}
      <VerdictBand verdict={data?.verdict ?? null} slim={view !== "ai"} onOverview={() => router.replace("/decision-v2?tab=overview", { scroll: false })} />

      {/* 视图内容 */}
      {view === "all" || view === "allstk" ? <MarketBrowseView onDetail={openDetail} favSet={favSet} toggleFav={toggleFav} />
        : view === "fav" ? <WatchlistView onDetail={openDetail} onChanged={loadFav} />
          : view === "holdings" || view === "wait" || view === "watch" ? <GroupListView kind={view} onDetail={openDetail} favSet={favSet} toggleFav={toggleFav} />
            : <AiRecoView data={data} loading={loading} onDetail={openDetail} favSet={favSet} toggleFav={toggleFav} />}

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
function MarketBrowseView({ onDetail, favSet, toggleFav }: { onDetail: (s: string, n?: string) => void; favSet: Set<string>; toggleFav: (s: string, m?: { name?: string | null; sector?: string | null; market?: string | null }) => void }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);
  const [level, setLevel] = useState("");

  useEffect(() => {
    let alive = true; setRows(null);
    const url = `/api/screener?limit=50&sort=adaptiveScore${level ? `&recommendationV2=${level}` : ""}`;
    fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setRows(Array.isArray(j?.scores) ? j.scores : []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [level]);

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
                      <td className="py-1.5 px-2 text-right"><button onClick={(e) => { e.stopPropagation(); toggleFav(r.symbol, { name: r.name, sector: r.sector, market: r.market }); }} className="h-6 px-2 rounded-full text-[11px] whitespace-nowrap" style={{ border: `1px solid ${favSet.has(r.symbol) ? COLORS.success : COLORS.border}`, color: favSet.has(r.symbol) ? COLORS.success : COLORS.primary, background: favSet.has(r.symbol) ? `${COLORS.success}14` : COLORS.card }}>{favSet.has(r.symbol) ? "✓ " + t("dv.sc.added") : t("dv.pf.btnAdd")}</button></td>
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
function WatchlistView({ onDetail, onChanged }: { onDetail: (s: string, n?: string) => void; onChanged: () => void }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<FavRow[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/watchlist", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((j) => setRows(Array.isArray(j) ? j : [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const remove = async (sym: string) => {
    setRows((rs) => (rs ? rs.filter((x) => x.symbol !== sym) : rs));
    await fetch(`/api/watchlist?symbol=${encodeURIComponent(sym)}`, { method: "DELETE" }).catch(() => {});
    onChanged(); // 同步 Shell favSet，使全市场/AI 视图的加入按钮状态一致
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

// ═══════════════════════ ④ 我的持仓 / 等待买点 / 观察名单（P17-04 §四，复用现有端点）═══════════════════════
type NormRow = { symbol: string; name: string; nameZh: string | null; aiScore: number | null; upside: number | null; currentPrice: number | null; today: number | null };
function GroupListView({ kind, onDetail, favSet, toggleFav }: { kind: "holdings" | "wait" | "watch"; onDetail: (s: string, n?: string) => void; favSet: Set<string>; toggleFav: (s: string, m?: { name?: string | null; sector?: string | null; market?: string | null }) => void }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<NormRow[] | null>(null);
  useEffect(() => {
    let alive = true; setRows(null);
    (async () => {
      if (kind === "holdings") {
        const j = await fetch("/api/holdings", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const hs: Array<Record<string, unknown>> = Array.isArray(j?.holdings) ? j.holdings : [];
        const norm = hs.map((h) => { const cp = h.currentPrice as number | null, tg = h.target as number | null; return { symbol: h.symbol as string, name: h.name as string, nameZh: (h.nameZh as string | null) ?? null, aiScore: (h.ai as number | null) ?? null, currentPrice: cp, today: (h.todayChangePct as number | null) ?? null, upside: tg != null && cp ? ((tg - cp) / cp) * 100 : null }; });
        if (alive) setRows(norm);
      } else {
        const j = await fetch("/api/admin/decision-overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const arr: Array<Record<string, unknown>> = (kind === "wait" ? j?.waitList : j?.backups) ?? [];
        const names: Record<string, { name: string | null; nameZh: string | null }> = j?.names ?? {};
        const norm = (Array.isArray(arr) ? arr : []).map((c) => { const sym = c.symbol as string, cp = c.currentPrice as number | null, tg = c.targetPrice1 as number | null; return { symbol: sym, name: names[sym]?.name ?? (c.name as string), nameZh: names[sym]?.nameZh ?? null, aiScore: (c.aiScore as number | null) ?? null, currentPrice: cp, today: (c.changePct as number | null) ?? null, upside: tg != null && cp ? ((tg - cp) / cp) * 100 : null }; });
        if (alive) setRows(norm);
      }
    })();
    return () => { alive = false; };
  }, [kind]);
  const disp = (r: NormRow) => getPrimaryName({ name: r.name, nameZh: r.nameZh }, lang);
  if (rows === null) return <div className="py-10"><AppLoading label={t("dv.sc.loading")} /></div>;
  if (rows.length === 0) return <AppCard><div className="py-12 text-center text-[13px]" style={{ color: COLORS.textFaint }}>{t("dv.sc.groupEmpty")}</div></AppCard>;
  return (
    <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t(`dv.sc.view.${kind}` as Parameters<typeof t>[0])}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{rows.length}</span></div>}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
            <th className="py-1.5 font-medium text-left pr-2">{t("wl.col.stock")}</th>
            <th className="py-1.5 font-medium text-right px-2">AI</th>
            <th className="py-1.5 font-medium text-right px-2">{t("dv.sc.upside")}</th>
            <th className="py-1.5 font-medium text-right px-2">{t("dc.ov.currentPrice")}</th>
            <th className="py-1.5 font-medium text-right px-2">{t("dv.rc.col.today")}</th>
            <th className="py-1.5 font-medium text-right px-2"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} onClick={() => onDetail(r.symbol, disp(r))} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                <td className="py-2 pr-2 text-left"><span style={{ color: COLORS.text }}>{disp(r)}</span><span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                <td className="py-2 px-2 text-right">{aiCell(r.aiScore)}</td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: UP_COLOR(r.upside) }}>{r.upside != null ? fmtPct(r.upside) : "—"}</td>
                <td className="py-2 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.currentPrice)}</td>
                <td className="py-2 px-2 text-right tabular-nums" style={{ color: upDownColor(r.today) }}>{fmtPct(r.today)}</td>
                <td className="py-2 px-2 text-right"><button onClick={(e) => { e.stopPropagation(); toggleFav(r.symbol, { name: r.name }); }} className="h-6 px-2 rounded-full text-[11px] whitespace-nowrap" style={{ border: `1px solid ${favSet.has(r.symbol) ? COLORS.success : COLORS.border}`, color: favSet.has(r.symbol) ? COLORS.success : COLORS.primary, background: favSet.has(r.symbol) ? `${COLORS.success}14` : COLORS.card }}>{favSet.has(r.symbol) ? "✓ " + t("dv.sc.added") : t("dv.pf.btnAdd")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
}

// ═══════════════════════ ① AI 推荐（按设计稿重建：左执行榜 + 右决策卡）═══════════════════════
function AiRecoView({ data, loading, onDetail, favSet, toggleFav }: { data: Resp | null; loading: boolean; onDetail: (s: string, n?: string) => void; favSet: Set<string>; toggleFav: (s: string, m?: { name?: string | null; sector?: string | null; market?: string | null }) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [chart, setChart] = useState<Record<string, ChartBar[]>>({});
  const [sortBy, setSortBy] = useState<"ai" | "upside">("ai");
  const [hover, setHover] = useState<string | null>(null);

  const recos = useMemo(() => data?.recommendations ?? [], [data]);
  const sym = sp.get("sym") || "";
  const setQ = useCallback((patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    router.replace(`/decision-v2?${q.toString()}`, { scroll: false });
  }, [sp, router]);

  const sorted = useMemo(() => {
    const list = [...recos];
    if (sortBy === "upside") list.sort((a, b) => (b.upside ?? -1e9) - (a.upside ?? -1e9));
    else list.sort((a, b) => a.rank - b.rank);
    return list;
  }, [recos, sortBy]);
  const activeSym = hover ?? sym;
  const selected = recos.find((r) => r.symbol === activeSym) ?? recos[0] ?? null;
  const pick = (sym2: string) => { setHover(null); setQ({ sym: sym2 }); };

  // 今日涨跌统计
  const breadth = useMemo(() => {
    const vals = sorted.map((r) => r.todayChangePct).filter((x): x is number => x != null);
    const up = vals.filter((v) => v > 0).length, down = vals.filter((v) => v < 0).length, flat = vals.length - up - down;
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { up, down, flat, avg };
  }, [sorted]);

  // 方向键上下浏览（P17-04 §七）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || !sorted.length) return;
      e.preventDefault();
      const idx = Math.max(0, sorted.findIndex((r) => r.symbol === activeSym));
      const ni = e.key === "ArrowDown" ? Math.min(idx + 1, sorted.length - 1) : Math.max(idx - 1, 0);
      setHover(sorted[ni].symbol);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sorted, activeSym]);

  // 选中股走势图懒加载（近 60 日日线，复用 /indicators）
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
  const riskColor = (r: string | null) => (r === "HIGH" ? COLORS.danger : r === "MEDIUM" || r === "MED" ? COLORS.warning : r === "LOW" ? COLORS.success : COLORS.textMuted);
  const riskLabel = (r: string | null) => (r === "HIGH" ? t("dv.sc.rk.HIGH") : r === "MEDIUM" || r === "MED" ? t("dv.sc.rk.MEDIUM") : r === "LOW" ? t("dv.sc.rk.LOW") : "—");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
      {/* 左：AI 买入执行榜 */}
      <div className="min-w-0">
        <AppCard header={<div className="flex items-center gap-2"><AppBadge tone="red">AI</AppBadge><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.sc.buyList")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("dv.sc.buyListSub")}</span></div>}>
          <div className="flex items-center gap-3 mb-2 text-[11px] flex-wrap" style={{ color: COLORS.textMuted }}>
            <span>{t("dv.sc.br.title")}</span>
            <span className="tabular-nums" style={{ color: COLORS.success }}>▲ {breadth.up}</span>
            <span className="tabular-nums" style={{ color: COLORS.danger }}>▼ {breadth.down}</span>
            <span className="tabular-nums" style={{ color: COLORS.textFaint }}>– {breadth.flat}</span>
            <span>{t("dv.sc.br.avg")} <b className="tabular-nums" style={{ color: upDownColor(breadth.avg) }}>{fmtPct(breadth.avg)}</b></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                <th className="py-1.5 font-medium text-left pr-2">#</th>
                <th className="py-1.5 font-medium text-left pr-2">{t("wl.col.stock")}</th>
                <th className="py-1.5 font-medium text-right px-2">{t("dv.rc.col.level")}</th>
                <th className="py-1.5 font-medium text-right px-2 cursor-pointer select-none" onClick={() => setSortBy("ai")} style={{ color: sortBy === "ai" ? COLORS.primary : undefined }}>AI{sortBy === "ai" ? " ↓" : ""}</th>
                <th className="py-1.5 font-medium text-right px-2 cursor-pointer select-none" onClick={() => setSortBy("upside")} style={{ color: sortBy === "upside" ? COLORS.primary : undefined }}>{t("dv.sc.upside")}{sortBy === "upside" ? " ↓" : ""}</th>
                <th className="py-1.5 font-medium text-right px-2">{t("dc.ov.currentPrice")}</th>
                <th className="py-1.5 font-medium text-right px-2">{t("dv.rc.col.today")}</th>
                <th className="py-1.5 font-medium text-left px-2">{t("dv.sc.col.zone")}</th>
                <th className="py-1.5 font-medium text-right px-2">{t("wl.col.status")}</th>
                <th className="py-1.5 font-medium text-right px-2"></th>
              </tr></thead>
              <tbody>
                {sorted.map((r) => {
                  const es = execState(r); const on = s?.symbol === r.symbol;
                  return (
                    <tr key={r.symbol} onMouseEnter={() => setHover(r.symbol)} onClick={() => pick(r.symbol)} onDoubleClick={() => onDetail(r.symbol, r.name)} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}`, background: on ? `${COLORS.primary}0c` : undefined }}>
                      <td className="py-2 pr-2 tabular-nums text-left" style={{ color: COLORS.textFaint }}>{r.rank}</td>
                      <td className="py-2 pr-2 text-left"><button onClick={(e) => { e.stopPropagation(); onDetail(r.symbol, r.name); }} className="hover:underline text-left" style={{ color: COLORS.text, background: "none", border: "none", padding: 0, cursor: "pointer" }}>{r.name}</button><span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                      <td className="py-2 px-2 text-right">{r.level ? <AppBadge tone={LV_TONE[r.level]}>{t(`dv.rc.lv.${r.level}` as Parameters<typeof t>[0])}</AppBadge> : <span style={{ color: COLORS.textFaint }}>—</span>}</td>
                      <td className="py-2 px-2 text-right">{aiCell(r.aiScore)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: UP_COLOR(r.upside) }}>{r.upside != null ? fmtPct(r.upside) : "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.currentPrice)}</td>
                      <td className="py-2 px-2 text-right tabular-nums" style={{ color: upDownColor(r.todayChangePct) }}>{fmtPct(r.todayChangePct)}</td>
                      <td className="py-2 px-2 text-left tabular-nums text-[11px]" style={{ color: COLORS.textSecondary }}>{r.entryLow != null ? `${fmtJpy(r.entryLow)}~${fmtJpy(r.entryHigh)}` : "—"}</td>
                      <td className="py-2 px-2 text-right"><AppBadge tone={es.tone}>{t(es.key as Parameters<typeof t>[0])}</AppBadge></td>
                      <td className="py-2 px-2 text-right"><button onClick={(e) => { e.stopPropagation(); toggleFav(r.symbol, { name: r.name, sector: r.sector }); }} className="h-6 px-2 rounded-full text-[11px] whitespace-nowrap" style={{ border: `1px solid ${favSet.has(r.symbol) ? COLORS.success : COLORS.border}`, color: favSet.has(r.symbol) ? COLORS.success : COLORS.primary, background: favSet.has(r.symbol) ? `${COLORS.success}14` : COLORS.card }}>{favSet.has(r.symbol) ? "✓ " + t("dv.sc.added") : t("dv.pf.btnAdd")}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>SSOT: {t("dc.tab.closing")} · {t("dv.rc.snapshotTag")} ({data.asOf}) · {t("dv.sc.hint.nav")}</div>
          </div>
        </AppCard>
      </div>

      {/* 右：AI 决策卡（P17-04 §三：AI 决策优先于 K 线） */}
      <div className="min-w-0">
        {s ? (
          <AppCard>
            {/* header：代码/名称 · 价格/今日 */}
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-[17px] font-extrabold tabular-nums" style={{ color: COLORS.text }}>{s.symbol}</div><div className="text-[12px]" style={{ color: COLORS.textSecondary }}>{s.name}</div></div>
              <div className="text-right"><div className="text-[19px] font-extrabold tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(s.currentPrice)}</div><div className="text-[12px] font-semibold tabular-nums" style={{ color: upDownColor(s.todayChangePct) }}>{fmtPct(s.todayChangePct)}</div></div>
            </div>

            {/* 第一块：AI Score + AI 动作 + 星级 */}
            <div className="flex items-end gap-3 mt-3">
              <div>
                <div className="text-[10px]" style={{ color: COLORS.textMuted }}>{t("dv.sc.aiScore")}</div>
                <div className="flex items-baseline gap-1.5"><span className="text-[24px] font-extrabold tabular-nums leading-none" style={{ color: SCORE_COLOR(s.aiScore) }}>{fmtScore(s.aiScore)}</span><span className="text-[13px] font-bold" style={{ color: SCORE_COLOR(s.aiScore) }}>{gradeFor(s.aiScore)}</span></div>
                <div className="text-[13px] mt-0.5" style={{ color: COLORS.warning, letterSpacing: "1px" }}>{starsFor(s.aiScore)}</div>
              </div>
              <div className="ml-auto text-right">
                {s.level && <div className="text-[16px] font-extrabold leading-tight" style={{ color: LV_COLOR[s.level] ?? COLORS.textSecondary }}>{t(`dv.rc.lv.${s.level}` as Parameters<typeof t>[0])}</div>}
                <div className="text-[10px] mt-0.5" style={{ color: COLORS.textMuted }}>{t("dv.sc.action")}</div>
              </div>
            </div>

            {/* 上涨空间 / 预计持有 / 风险等级 */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <P k={t("dv.sc.upside")} v={fmtPct(s.upside)} tone={UP_COLOR(s.upside)} />
              <P k={t("dv.rc.ex.period")} v={s.holdPeriod ?? "—"} />
              <P k={t("dv.sc.risk")} v={riskLabel(s.riskLevel)} tone={riskColor(s.riskLevel)} />
            </div>

            {/* 第二块：AI 总结 */}
            {(s.gptNote || s.reason) && (
              <div className="mt-3">
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: COLORS.success, background: `${COLORS.success}1f` }}>{t("dv.sc.band.closing")} 15:15 · GPT</span>
                <p className="text-[12px] leading-relaxed mt-1.5" style={{ color: COLORS.textSecondary }}><b style={{ color: COLORS.text }}>{t("dv.sc.concl")}</b>{s.gptNote || s.reason}</p>
              </div>
            )}

            {/* 第三块：买入区 / 目标价 / 止损价 / 收益风险比 */}
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <P k={t("dv.rc.ex.entry")} v={s.entryLow != null ? `${fmtJpy(s.entryLow)}~${fmtJpy(s.entryHigh)}` : "—"} tone={COLORS.primary} />
              <P k={t("dv.rc.ex.tp")} v={s.target1 != null ? <>{fmtJpy(s.target1)} <span className="text-[11px] font-semibold">{fmtPct(s.upside)}</span></> : "—"} tone={COLORS.success} />
              <P k={t("dv.rc.ex.sl")} v={s.stopLoss != null ? <>{fmtJpy(s.stopLoss)} <span className="text-[11px] font-semibold">{fmtPct(s.downside)}</span></> : "—"} tone={COLORS.danger} />
              <P k={t("dv.sc.rr")} v={rrRatio(s.currentPrice, s.target1, s.stopLoss)} />
            </div>

            {/* 第四块：K 线（决策之后） */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: COLORS.textFaint }}><span>{t("dv.sc.chart60")}</span><span>MA5 · MA20 · MA60</span></div>
              {bars.length ? <LightweightStockChart data={bars} height={140} theme="light" /> : <div className="flex items-center justify-center rounded-lg" style={{ height: 140, background: COLORS.tile, color: COLORS.textFaint, fontSize: 12 }}>—</div>}
            </div>

            {/* 第五块：操作 */}
            <div className="flex gap-2 mt-4">
              <button onClick={() => onDetail(s.symbol, s.name)} className="flex-1 text-[13px] font-semibold py-2.5 rounded-lg" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text, background: COLORS.card }}>{t("dv.sc.report")}</button>
              <button onClick={() => toggleFav(s.symbol, { name: s.name, sector: s.sector })} className="flex-1 text-[13px] font-semibold py-2.5 rounded-lg" style={{ background: favSet.has(s.symbol) ? COLORS.success : COLORS.primary, color: "#fff", border: `1px solid ${favSet.has(s.symbol) ? COLORS.success : COLORS.primary}` }}>{favSet.has(s.symbol) ? "✓ " + t("dv.sc.added") : t("dv.sc.addFav")}</button>
            </div>
          </AppCard>
        ) : <AppCard><div className="text-[12px] py-6 text-center" style={{ color: COLORS.textFaint }}>{t("dv.rc.selectHint")}</div></AppCard>}
      </div>
    </div>
  );
}
