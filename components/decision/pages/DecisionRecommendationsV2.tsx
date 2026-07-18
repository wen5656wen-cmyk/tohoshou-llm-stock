"use client";

// ── AI Recommendations V2（P14-DEV-04 · /decision-v2?tab=picks|recommendations）────
// 正式 AI Buy List / Execution List。SSOT = /api/decision/recommendations（只读聚合：
// closing.top10 执行 + StockScore.recommendationV2 真实等级 + Yahoo 实时报价）。
// Master–Detail：左 Top10 表选中 → 右详情/执行/新闻/风险/相似/信心。筛选排序写 URL。
// 缺失字段（上涨概率/建议仓位/模型一致性/历史案例）诚实显 —，不伪造。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct, fmtScore, fmtJstClock, upDownColor, riskTone } from "@/lib/decision/ds";
import { deriveLiveStatus } from "@/lib/decision/live-status";
import { NewsCatalystPanel, RiskPanel, type NewsItem, type CatItem, type RiskItem } from "@/components/decision/ds/panels";

type Reco = {
  rank: number; symbol: string; name: string; sector: string | null;
  currentPrice: number | null; todayChangePct: number | null;
  entryLow: number | null; entryHigh: number | null; target1: number | null; stopLoss: number | null;
  upside: number | null; downside: number | null; aiScore: number | null; gptScore: number | null;
  riskLevel: string | null; level: string | null; inBuyZone: boolean | null; newsSentiment: number | null;
  holdPeriod: string | null; reason: string | null; gptNote: string | null;
};
type Resp = { empty?: boolean; summary?: { total: number; strongBuy: number; buy: number; watch: number; skip: number; avgAiScore: number | null; avgUpside: number | null; avgRisk: string | null; totalPosition: number | null }; recommendations?: Reco[]; metadata?: { date: string; decidedAtJst: string | null; gptModel: string | null; versionNote: string }; asOf?: string | null; sourceStatus?: { quote?: string } };
const LV_TONE: Record<string, Tone> = { STRONG_BUY: "red", BUY: "amber", WATCH: "blue", SKIP: "neutral" };
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

export default function DecisionRecommendationsV2() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Record<string, { news: NewsItem[]; cats: CatItem[] }>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/decision/recommendations", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) { setData(j); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

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

  // 选中股详情懒加载（新闻/催化剂，按 symbol 缓存，避免请求风暴）
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

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("dv.nav.picks")} /></div>;
  if (!data || data.empty) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>;

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
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
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
        <button onClick={() => router.replace("/decision-v2?tab=picks", { scroll: false })} className="h-6 px-2 rounded-full" style={{ background: COLORS.tile, color: COLORS.primary }}>{t("dv.rc.reset")}</button>
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

              {/* ⑧①② News + Catalyst */}
              <NewsCatalystPanel news={d?.news ?? []} catalysts={d?.cats ?? []} />

              {/* ⑧③ Risk（个股） */}
              <RiskPanel titleKey="dv.ov.risk" overall={selected.riskLevel ?? "—"} overallTone={riskTone(selected.riskLevel)}
                items={([
                  { labelKey: "dv.ov.rk.index", level: selected.riskLevel ?? "—", tone: riskTone(selected.riskLevel) },
                  { labelKey: "dv.ov.rk.news", level: (selected.newsSentiment ?? 0) < 0 ? "MED" : "LOW", tone: riskTone((selected.newsSentiment ?? 0) < 0 ? "MED" : "LOW") },
                  { labelKey: "dv.ov.rk.vol", level: selected.riskLevel ?? "—", tone: riskTone(selected.riskLevel) },
                ] as RiskItem[])} />

              {/* ⑧④ Similar Ideas（同板块，真实关联） */}
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

              {/* ⑧⑤ AI Confidence */}
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
