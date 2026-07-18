"use client";

// ── 决策中心 · 今日决策 V3（P13-DECISION-02 · Layout Only）──────────────────────
// TOHOSHOU 唯一老板首页。老板 20 秒内知道：①能不能买 ②买谁 ③为什么 ④怎么买 ⑤第二选择。
//
// 纯布局层：只读复用现有 API，零后端/评分/Portfolio/Schema 改动。
//   · /api/admin/closing-decision → verdict / top1 / portfolio / top10 / summary / market
//   · /api/admin/decision-center  → market(regime/riskLevel/vol/topix/nikkei)
//   · /api/ai-theme               → 今日热点主题（成分股 5日动能均值，非资金流）
//   · /api/disclosures            → 今日催化剂（折叠区）
//   · top1 明细：/api/explain·/api/news·/api/disclosures·/api/market-data → 风险/催化剂
//
// 去重纪律（同一 symbol 不重复出现）：
//   · 第一推荐(Section 2)=top1，只出现一次。
//   · 备选方案(Section 4)=组合 legs **排除 top1** → 只呈现「第二选择」及之后。
//   · 今日风险(Section 5)=top10 风险股 **排除 top1** → 与 Section 3 的 top1 风险不重复。
//   · 收盘决策/驾驶舱/AI 五选的重复展示统一收敛到本页；Top10/GPT/催化剂 收进折叠区。

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppButton, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";
import ExplainReportButton from "@/components/explain/ExplainReportButton";
import ExplainCompare from "@/components/explain/ExplainCompare";
import { buildAvoidList, recommendedSymbols, type AvoidReasonKey } from "@/lib/decision/avoid";
import { buildCatalysts, buildRiskView, starStr, L2_NOTE, type Catalyst, type RiskView } from "@/lib/explain/gap";
import { deriveLiveStatus, type LiveStatus } from "@/lib/decision/live-status";
import { verdictIcon, verdictTone } from "@/lib/decision/verdict";
import { themeMomentum } from "@/lib/decision/themes";

interface Top1 {
  symbol: string; name: string | null; aiScore: number | null; gptScore: number | null;
  confidence: string | null; price: number | null; changePct: number | null;
  entryLow: number | null; entryHigh: number | null;
  target1: number | null; target2: number | null; stopLoss: number | null; holdPeriod: string | null;
}
interface Leg {
  symbol: string; name: string | null; weight: number; sector?: string | null; reason?: string | null;
  entryLow?: number | null; entryHigh?: number | null; target1?: number | null; stopLoss?: number | null;
}
interface Top10Row {
  symbol: string; name: string | null; rank?: number | null; reason?: string | null; gptNote?: string | null;
  action?: string | null; riskLevel?: string | null; inBuyZone?: boolean | null;
  newsSentiment?: number | null; volumeRatio?: number | null; changePct?: number | null;
  aiScore?: number | null; gptScore?: number | null;
}
interface ClosingApi {
  ok: boolean; empty?: boolean; date?: string; decidedAtJst?: string | null;
  verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null;
  market?: { regime: string | null; volatility: number | null; newsRiskCount?: number | null; qualifiedCount?: number | null };
  top1?: Top1 | null; portfolio?: Leg[]; portfolioNote?: string | null; top10?: Top10Row[]; summary?: string | null;
  meta?: { gptModel?: string | null; gptAnalyzed?: number | null } | null;
}
interface DcMarket { regime: string | null; riskLevel: string | null; volatility: number | null; topix: number | null; topixChange: number | null; nikkei: number | null; nikkeiChange: number | null }
interface DcApi { ok: boolean; market?: DcMarket }
interface ThemeStock { symbol: string; theme: string; return5d: number | null; return20d: number | null; scored: boolean }
interface ThemeApi { stocks?: ThemeStock[]; themes?: { theme: string; count: number }[] }
interface Disc { symbol: string; title: string; category: string | null; sentiment: string | null; importance: number | null; publishedAt: string }

const jpy = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString()}`);
const pct1 = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`);

type StepStatus = "pass" | "warn" | "fail";
type BadgeKey = "tradable" | "watch" | "blocked";

export default function TodayDecisionView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t, lang } = useI18n();
  const rsn = (k: AvoidReasonKey) => t(`dc.td.rsn.${k}` as Parameters<typeof t>[0]);
  const [c, setC] = useState<ClosingApi | null>(null);
  const [dc, setDc] = useState<DcApi | null>(null);
  const [th, setTh] = useState<ThemeApi | null>(null);
  const [disc, setDisc] = useState<Disc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    let alive = true;
    const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      setLoading(true); setError(null);
      try {
        const [cj, dj, tj, gj] = await Promise.all([
          fetch("/api/admin/closing-decision", { cache: "no-store" }).then((r) => r.json()),
          get("/api/admin/decision-center"),
          get("/api/ai-theme"),
          get("/api/disclosures?limit=40"),
        ]);
        if (!alive) return;
        setC(cj); setDc(dj); setTh(tj); setDisc(Array.isArray(gj) ? gj : []);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "load failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // 第一推荐明细（催化剂 / 个股风险 / 全球市场）——懒随主数据加载，失败安全空态
  const [p10, setP10] = useState<{
    disc: { title: string; category?: string | null; sentiment?: string | null; publishedAt: string }[];
    news: { title?: string; publishedAt: string }[];
    explainRisks: { title: string; weight?: number | null }[] | null;
    gm: { nasdaqChange?: number | null; vix?: number | null; usdjpy?: number | null } | null;
  }>({ disc: [], news: [], explainRisks: null, gm: null });

  const top1Sym = c?.top1?.symbol ?? null;
  useEffect(() => {
    if (!top1Sym) return;
    let alive = true;
    const j = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [d, n, e, m] = await Promise.all([
        j(`/api/disclosures?symbol=${encodeURIComponent(top1Sym)}&limit=10`),
        j(`/api/news?symbol=${encodeURIComponent(top1Sym)}&limit=20`),
        j(`/api/explain/${encodeURIComponent(top1Sym)}?provider=rule`),
        j(`/api/market-data`),
      ]);
      if (!alive) return;
      setP10({ disc: Array.isArray(d) ? d : [], news: Array.isArray(n) ? n : [], explainRisks: Array.isArray(e?.risks) ? e.risks : null, gm: m?.globalMarket ?? null });
    })();
    return () => { alive = false; };
  }, [top1Sym]);

  if (loading) return <AppLoading label={t("db.title")} />;
  if (error) return <AppEmptyState title={t("dc.ov.loadFail")} desc={error} />;

  const verdict = c?.verdict ?? null;
  const top1 = c?.top1 ?? null;
  const legs = c?.portfolio ?? [];
  const top10 = c?.top10 ?? [];
  const t10 = new Map(top10.map((r) => [r.symbol, r]));
  const regime = dc?.market?.regime ?? c?.market?.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const vol = dc?.market?.volatility ?? c?.market?.volatility ?? null;
  const riskLevel = dc?.market?.riskLevel ?? null;
  const oppCount = c?.market?.qualifiedCount ?? null;
  const m = dc?.market ?? null;
  // 「一句 AI 总结」：取 summary 首句（组合明细在 Section 4 已呈现，此处不重复列举）
  const aiRaw = (c?.summary || c?.verdictReason || "").trim();
  const aiFirst = aiRaw.split(/[。\n｜]/).map((s) => s.trim()).filter(Boolean)[0] || "";
  const aiLine = aiFirst ? (aiRaw.includes("。") ? `${aiFirst}。` : aiFirst) : "";

  // ── 第一推荐派生 ──
  const expReturn = top1?.target1 != null && top1?.price ? ((top1.target1 - top1.price) / top1.price) * 100 : null;
  const slPct = top1?.stopLoss != null && top1?.price ? ((top1.stopLoss - top1.price) / top1.price) * 100 : null;
  const rr = expReturn != null && slPct != null && slPct !== 0 ? Math.abs(expReturn / slPct) : null;
  const top1Leg = top1 ? legs.find((l) => l.symbol === top1.symbol) : undefined;

  // ── 决策状态：判定统一来自 live-status SSOT（deriveLiveStatus），映射到 Today 的 4 态显示 ──
  type DsKey = "inZone" | "wait" | "invalid" | "pending";
  const DS_FROM_LIVE: Record<LiveStatus, DsKey> = {
    IN_ZONE: "inZone", BELOW_ZONE: "inZone", ABOVE_ZONE: "wait", REACHED_TARGET: "wait",
    BELOW_STOP: "invalid", WAIT_QUOTE: "pending", CANCELLED: "pending", NO_ZONE: "pending",
  };
  const decisionStatus: DsKey = top1
    ? DS_FROM_LIVE[deriveLiveStatus({ price: top1.price, entryLow: top1.entryLow, entryHigh: top1.entryHigh, target: top1.target1, stop: top1.stopLoss })]
    : "pending";
  const STATUS_ICON: Record<DsKey, string> = { inZone: "🟢", wait: "🟡", invalid: "🔴", pending: "⚪" };
  const STATUS_TONE: Record<DsKey, "green" | "amber" | "red" | "neutral"> = { inZone: "green", wait: "amber", invalid: "red", pending: "neutral" };

  // WHY BUY ≤3（真实来源，无则不编造）
  const top1Row = top1 ? t10.get(top1.symbol) : null;
  const whyBuy = [top1Row?.reason, top1Row?.gptNote, c?.verdictReason]
    .filter((x): x is string => !!x && x.trim().length > 0).map((x) => x.trim())
    .filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 3);

  // WHY RISK（top1 两级风险，≤3）
  const riskView: RiskView | null = top1 ? buildRiskView(p10.explainRisks, { nasdaqChange: p10.gm?.nasdaqChange ?? null, vix: p10.gm?.vix ?? null, usdjpy: p10.gm?.usdjpy ?? null, regime }) : null;
  const whyRisk = (riskView?.items ?? []).slice(0, 3);

  // ── P13-DECISION-03 决策过程（透明层，全部派生自现有字段，不改任何评分/门控/推荐）──
  // top1 = 模型第一名（closingScore 排名第一）；portfolio = 引擎的可交易合格集。
  // top1 ∈ portfolio ⟺ 通过质量门（可交易）。流动性信号来自 closing 引擎写入 top10.reason 的文案。
  const inPortfolio = !!top1Leg;
  const gateLiquidity = /流动性/.test(top1Row?.reason ?? "");
  const gateNews = (top1Row?.newsSentiment ?? 0) < 0;
  const gateZone = top1Row?.inBuyZone === false;
  const gateHighRisk = String(top1Row?.riskLevel ?? "").toUpperCase() === "HIGH";
  const hardFail = gateNews || gateHighRisk;
  const softWarn = gateLiquidity || gateZone || !inPortfolio;
  const badgeKey: BadgeKey = hardFail ? "blocked" : softWarn ? "watch" : "tradable";
  const gateOverall: StepStatus = hardFail ? "fail" : softWarn ? "warn" : "pass";
  const gates: { label: string; st: StepStatus }[] = [
    { label: t("dc.td.dp.gLiquidity"), st: gateLiquidity ? "warn" : "pass" },
    { label: t("dc.td.dp.gNews"), st: gateNews ? "fail" : "pass" },
    { label: t("dc.td.dp.gZone"), st: gateZone ? "warn" : "pass" },
    { label: t("dc.td.dp.gRisk"), st: gateHighRisk ? "fail" : "pass" },
  ];
  // 冲突主因（模型第一未进可交易组合时点名）
  const conflictReason = gateLiquidity ? t("dc.td.dp.gLiquidity") : gateNews ? t("dc.td.dp.gNews") : gateZone ? t("dc.td.dp.gZone") : gateHighRisk ? t("dc.td.dp.gRisk") : "—";

  // 备选方案 = 组合 legs 排除 top1（第二选择起）
  const alts = legs.filter((l) => l.symbol !== (top1?.symbol ?? ""));

  // 今日回避（折叠区）
  const recommended = recommendedSymbols(top1, legs);
  const avoidRes = buildAvoidList(top10, recommended);
  const avoid = avoidRes.items;

  // 今日催化剂（折叠区）
  const cat: Catalyst[] = top1 ? buildCatalysts(p10.disc, p10.news, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10), 5) : [];

  // ── Section 5 市场摘要 ──
  // 今日热点主题：成分股 5日动能均值 Top5（真实价格，非资金流）
  const hotThemes = themeMomentum(th?.stocks ?? [], th?.themes ?? [], lang).slice(0, 5);
  // 今日风险：top10 风险股，排除 top1，Top3
  const marketRisks = top10
    .filter((r) => r.symbol !== (top1?.symbol ?? ""))
    .map((r) => {
      const rs: string[] = [];
      if ((r.newsSentiment ?? 0) < 0) rs.push(rsn("news"));
      if (String(r.riskLevel ?? "").toUpperCase() === "HIGH") rs.push(rsn("risk"));
      if (r.inBuyZone === false) rs.push(rsn("zone"));
      return { symbol: r.symbol, name: r.name, rs };
    })
    .filter((r) => r.rs.length).slice(0, 3);

  const Row = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
    <div className="flex items-center justify-between py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{k}</span>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</span>
    </div>
  );

  // 决策过程步骤渲染
  const stColor = (s: StepStatus) => (s === "pass" ? COLORS.success : s === "warn" ? COLORS.warning : COLORS.danger);
  const stLabel = (s: StepStatus) => t(`dc.td.dp.${s}` as Parameters<typeof t>[0]);
  const stIcon = (s: StepStatus) => (s === "pass" ? "✓" : s === "warn" ? "⚠" : "✗");
  const Step = ({ n, label, st, main, sub, last, children }: { n: string; label: string; st: StepStatus; main?: string; sub?: string; last?: boolean; children?: ReactNode }) => (
    <div className="flex items-stretch gap-2.5">
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: `${stColor(st)}1a`, color: stColor(st), border: `1px solid ${stColor(st)}55` }}>{n}</div>
        {!last && <div className="w-px flex-1 my-1" style={{ background: COLORS.border, minHeight: 14 }} />}
      </div>
      <div className="flex-1 min-w-0" style={{ paddingBottom: last ? 0 : 12 }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold" style={{ color: COLORS.text }}>{label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${stColor(st)}14`, color: stColor(st) }}>{stIcon(st)} {stLabel(st)}</span>
        </div>
        {main && <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.text }}>{main}{sub && <span className="text-[11px] ml-1.5" style={{ color: COLORS.textFaint }}>{sub}</span>}</div>}
        {children}
      </div>
    </div>
  );

  return (
    <div className="max-w-[900px] mx-auto space-y-3">
      {/* ═══ SECTION 1 · 今日行动 Hero ═══ */}
      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{verdictIcon(verdict)}</span>
            <div>
              <div className="text-[24px] font-bold tracking-tight leading-tight" style={{ color: COLORS.text }}>
                {verdict ? t(`dc.verdict.${verdict}` as Parameters<typeof t>[0]) : t("dc.ov.noData")}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: COLORS.textFaint }}>{c?.date ?? "—"} {c?.decidedAtJst ?? ""} JST</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("dc.ov.marketState")}</span>
            <AppBadge tone={verdictTone(verdict)}>{regimeLabel}</AppBadge>
            {vol != null && <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("db.riskLevel")} {riskLevel ?? Math.round(vol * 10) / 10}</span>}
            {oppCount != null && <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("dc.ov.oppCount")} <b style={{ color: COLORS.primary }}>{oppCount}</b></span>}
          </div>
        </div>
        {aiLine && (
          <p className="text-[12.5px] mt-2.5 pt-2.5 leading-relaxed" style={{ color: COLORS.textSecondary, borderTop: `1px solid ${COLORS.borderSoft}` }}>
            <b style={{ color: COLORS.textFaint }}>{t("dc.td.aiSummary")}：</b>{aiLine}
          </p>
        )}
      </AppCard>

      {/* ═══ SECTION 2 · 第一推荐（单一巨大卡片）═══ */}
      <AppCard header={
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[14px] font-semibold" style={{ color: COLORS.text }}>⭐ {t("dc.ov.firstPick")}</span>
            <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.ov.singleBest")}</span>
          </div>
          <AppButton size="sm" variant="ghost" onClick={() => onNavigate("closing")}>{t("dc.ov.viewDetail")} →</AppButton>
        </div>
      }>
        {top1 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[22px] font-bold" style={{ color: COLORS.text }}>{top1.name ?? top1.symbol}</span>
              <span className="text-[12px] font-mono" style={{ color: COLORS.textFaint }}>{top1.symbol}</span>
              {top1.confidence && <AppBadge tone="blue">{t("dc.ov.confidence")} {top1.confidence}</AppBadge>}
              <span className="text-[13px]" style={{ color: COLORS.textSecondary }}>AI {top1.aiScore ?? "—"} · GPT {top1.gptScore ?? "—"}</span>
              <ExplainReportButton symbol={top1.symbol} name={top1.name} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Row k={t("dc.ov.currentPrice")} v={`${jpy(top1.price)} (${pct1(top1.changePct)})`} />
              <Row k={t("dc.ov.entryRange")} v={top1.entryLow != null && top1.entryHigh != null ? `${jpy(top1.entryLow)} ~ ${jpy(top1.entryHigh)}` : "—"} />
              <Row k={t("dc.ov.target")} v={top1.target1 != null ? `T1 ${jpy(top1.target1)}${top1.target2 != null ? ` → T2 ${jpy(top1.target2)}` : ""}` : "—"} />
              <Row k={t("dc.ov.stopLossP")} v={jpy(top1.stopLoss)} tone={COLORS.danger} />
              <Row k={t("dc.td.position")} v={top1Leg ? `${Math.round(top1Leg.weight)}%` : t("dc.td.positionSeeAlts")} tone={COLORS.primary} />
              <Row k={t("dc.ov.holdPeriod")} v={top1.holdPeriod ?? "—"} />
              <Row k={t("dc.ov.expReturn")} v={expReturn != null ? pct1(expReturn) : "—"} tone={(expReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
              <Row k={t("dc.ov.rr")} v={rr != null ? `${rr.toFixed(1)} : 1` : "—"} />
            </div>
            {/* P13-DECISION-04：决策状态（当前）+ 预期情景（计划） */}
            <div className="pt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{t("dc.td.status")}</span>
                <AppBadge tone={STATUS_TONE[decisionStatus]}>{STATUS_ICON[decisionStatus]} {t(`dc.td.st.${decisionStatus}` as Parameters<typeof t>[0])}</AppBadge>
              </span>
              <span className="text-[11.5px]" style={{ color: COLORS.textSecondary }}>
                <b style={{ color: COLORS.textFaint }}>{t("dc.td.scenario")}：</b>
                {t("dc.td.scExpect")} {top1.holdPeriod ?? "—"} · {t("dc.ov.target")} {jpy(top1.target1)}{top1.target2 != null ? ` → ${jpy(top1.target2)}` : ""} · {t("dc.ov.stopLossP")} {jpy(top1.stopLoss)}
              </span>
            </div>
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* ═══ SECTION 3 · 为什么推荐（WHY BUY / WHY RISK）═══ */}
      {top1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.success }}>✔ {t("dc.td.whyBuy")}</span>}>
            {whyBuy.length ? (
              <ul className="space-y-1.5">
                {whyBuy.map((r, i) => (
                  <li key={i} className="text-[12.5px] flex gap-2 leading-relaxed" style={{ color: COLORS.text }}>
                    <span style={{ color: COLORS.success }}>✔</span><span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dc.td.noWhyBuy")}</div>}
          </AppCard>
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.danger }}>⚠️ {t("dc.td.whyRisk")}</span>}>
            {riskView?.note && (
              <div className="text-[11px] mb-1.5 px-2 py-1 rounded" style={{ background: `${COLORS.warning}12`, color: COLORS.warning }}>ℹ️ {riskView.note}</div>
            )}
            {whyRisk.length ? (
              <ul className="space-y-1.5">
                {whyRisk.map((r, i) => (
                  <li key={i} className="text-[12.5px] flex gap-2" style={{ color: COLORS.text }}>
                    <span className="shrink-0" style={{ color: COLORS.danger }}>{starStr(r.stars)}</span><span>{r.title}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{L2_NOTE}</div>}
          </AppCard>
        </div>
      )}

      {/* ═══ SECTION · 决策过程（Decision Transparency）═══ */}
      {top1 && (
        <AppCard header={
          <div>
            <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.td.dp.title")}</span>
            <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.td.dp.hint")}</span>
          </div>
        }>
          <div>
            <Step n="1" label={t("dc.td.dp.step1")} st="pass" main={top1.name ?? top1.symbol} sub={`${top1.symbol} · AI ${top1.aiScore ?? "—"}`} />
            <Step n="2" label={t("dc.td.dp.step2")} st={gateOverall}>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {gates.map((g) => (
                  <span key={g.label} className="text-[11px] px-2 py-0.5 rounded-lg" style={{ background: `${stColor(g.st)}12`, color: stColor(g.st), border: `1px solid ${stColor(g.st)}33` }}>
                    {stIcon(g.st)} {g.label} · {stLabel(g.st)}
                  </span>
                ))}
              </div>
            </Step>
            <Step n="3" label={t("dc.td.dp.step3")} st="pass" main={`GPT ${top1.gptScore ?? "—"}`} sub={top1Row?.gptNote || t("dc.td.dp.gptOk")} />
            <Step n="4" label={t("dc.td.dp.step4")} st={hardFail ? "fail" : "pass"} last>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-[13px] font-bold" style={{ color: COLORS.text }}>
                  {t("dc.td.dp.final")}：{top1.name ?? top1.symbol} <span className="text-[11px] font-mono" style={{ color: COLORS.textFaint }}>{top1.symbol}</span>
                </span>
                <AppBadge tone="blue">{t("dc.td.badge.model")}</AppBadge>
                <AppBadge tone={badgeKey === "tradable" ? "green" : badgeKey === "watch" ? "amber" : "red"}>{t(`dc.td.badge.${badgeKey}` as Parameters<typeof t>[0])}</AppBadge>
              </div>
            </Step>
            {/* 冲突解释：模型第一名 ≠ 可交易首选（不隐藏、必须解释，且不构成第二个 Final） */}
            {!inPortfolio && legs[0] && (
              <div className="mt-1 text-[11.5px] px-3 py-2 rounded-lg leading-relaxed" style={{ background: `${COLORS.warning}12`, color: COLORS.textSecondary, border: `1px solid ${COLORS.warning}33` }}>
                ⚠️ {t("dc.td.dp.conflictLead")}<span className="mx-1">·</span>{t("dc.td.dp.reason")}：{conflictReason}
                <span className="mx-1">→</span>{t("dc.td.dp.conflictAlt")}：<b style={{ color: COLORS.primary }}>{legs[0].name ?? legs[0].symbol}</b> <span className="font-mono">{legs[0].symbol}</span>
              </div>
            )}
          </div>
        </AppCard>
      )}

      {/* ═══ SECTION 4 · 备选方案（Top5 横向卡片，排除 top1）═══ */}
      <AppCard header={
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.td.alts")}</span>
            <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.td.altsHint")}</span>
          </div>
          {alts.length > 0 && <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{t("db.holdCount")} {alts.length}</span>}
        </div>
      }>
        {alts.length ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {alts.map((l) => {
              const row = t10.get(l.symbol);
              const outOfZone = row?.inBuyZone === false;
              return (
                <div key={l.symbol} className="shrink-0 w-[210px] rounded-xl p-3" style={{ background: COLORS.tile, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[13px] font-semibold truncate" style={{ color: COLORS.text }}>{l.name ?? l.symbol}</span>
                    <span className="text-[15px] font-bold tabular-nums shrink-0" style={{ color: COLORS.primary }}>{Math.round(l.weight)}%</span>
                  </div>
                  <div className="text-[10px] font-mono mb-1.5" style={{ color: COLORS.textFaint }}>{l.symbol}{l.sector ? ` · ${l.sector}` : ""}</div>
                  <div className="space-y-0.5 text-[11px] tabular-nums" style={{ color: COLORS.textSecondary }}>
                    {l.entryLow != null && l.entryHigh != null && <div>{t("dc.ov.entryRange")} {jpy(l.entryLow)}~{jpy(l.entryHigh)}</div>}
                    {l.target1 != null && <div>T1 {jpy(l.target1)}</div>}
                    {l.stopLoss != null && <div style={{ color: COLORS.danger }}>SL {jpy(l.stopLoss)}</div>}
                  </div>
                  {outOfZone && <div className="mt-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${COLORS.warning}14`, color: COLORS.warning }}>⚠️ {t("dc.ov.outOfZone")}</div>}
                </div>
              );
            })}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.td.altsNone")}</div>}
        {c?.portfolioNote && <p className="text-[11px] mt-2" style={{ color: COLORS.textFaint }}>{c.portfolioNote}</p>}
      </AppCard>

      {/* ═══ SECTION 5 · 市场摘要（紧凑，不列几十个产业）═══ */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.td.market")}</span>}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <AppBadge tone={regime === "BULL" ? "green" : regime === "BEAR" ? "red" : "amber"}>{regimeLabel}</AppBadge>
          <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("db.riskLevel")} <b style={{ color: COLORS.text }}>{riskLevel ?? "—"}</b>{vol != null ? ` (${Math.round(vol * 10) / 10})` : ""}</span>
          {m?.topix != null && <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>TOPIX <b className="tabular-nums" style={{ color: (m.topixChange ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{Math.round(m.topix * 10) / 10} ({pct1(m.topixChange)})</b></span>}
          {m?.nikkei != null && <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>Nikkei <b className="tabular-nums" style={{ color: (m.nikkeiChange ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{Math.round(m.nikkei).toLocaleString()} ({pct1(m.nikkeiChange)})</b></span>}
        </div>
        {hotThemes.length > 0 && (
          <div className="mt-3 pt-2.5" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
            <div className="text-[11px] mb-1.5" style={{ color: COLORS.textFaint }}>{t("dc.ck.hotTheme")}</div>
            <div className="flex flex-wrap gap-2">
              {hotThemes.map((h, i) => (
                <span key={h.theme} className="px-2.5 py-1 rounded-lg text-[12px]" style={{ background: COLORS.tile, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  <b style={{ color: COLORS.textFaint }}>{i + 1}.</b> {h.label}
                  <b className="ml-1.5 tabular-nums" style={{ color: (h.r5 ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{pct1(h.r5)}</b>
                </span>
              ))}
            </div>
          </div>
        )}
        {marketRisks.length > 0 && (
          <div className="mt-3 pt-2.5" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
            <div className="text-[11px] mb-1.5" style={{ color: COLORS.textFaint }}>{t("dc.ck.riskTop")}</div>
            <div className="space-y-1">
              {marketRisks.map((r) => (
                <div key={r.symbol} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate" style={{ color: COLORS.text }}><span style={{ color: COLORS.danger }}>⚠ </span>{r.name ?? r.symbol} <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></span>
                  <span className="text-[11px] shrink-0" style={{ color: COLORS.textSecondary }}>{r.rs.join(" / ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </AppCard>

      {/* ═══ SECTION 6 · 更多分析（默认折叠）═══ */}
      <AppCard>
        <button onClick={() => setShowMore((v) => !v)} className="w-full flex items-center justify-between">
          <div className="text-left">
            <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{showMore ? "▾" : "▸"} {t("dc.td.more")}</span>
            <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.td.moreHint")}</span>
          </div>
        </button>

        {showMore && (
          <div className="mt-3 space-y-4">
            {/* 为什么没推荐（今日回避） */}
            <div>
              <div className="text-[12px] font-semibold mb-1.5" style={{ color: COLORS.text }}>{t("dc.td.whyNot")}{avoid.length > 0 ? `（${avoid.length}）` : ""}</div>
              {avoid.length ? (
                <div className="space-y-1">
                  {avoid.map((a) => (
                    <div key={a.symbol} className="flex items-center justify-between gap-2 py-1 text-[12px]" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                      <span className="truncate" style={{ color: COLORS.text }}><span style={{ color: COLORS.danger }}>✗ </span>{a.name ?? a.symbol} <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{a.symbol}</span></span>
                      <span className="text-[11px] shrink-0" style={{ color: COLORS.textSecondary }}>{a.reasonKeys.map((k) => rsn(k)).join(" / ")}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.avoidNone")}</div>}
            </div>

            {/* 今日催化剂 */}
            {cat.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold mb-1.5" style={{ color: COLORS.text }}>🔥 {t("dc.td.catalyst")} · {top1?.name ?? top1?.symbol}</div>
                <div className="space-y-1">
                  {cat.map((x, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]" style={{ opacity: x.stale ? 0.5 : 1 }}>
                      <span className="shrink-0" style={{ color: COLORS.warning }}>{starStr(x.stars)}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] shrink-0" style={{ background: COLORS.tile, color: COLORS.textSecondary }}>{x.label}</span>
                      <span className="min-w-0 truncate" style={{ color: COLORS.text }}>{x.title}</span>
                      <span className="ml-auto text-[10px] shrink-0" style={{ color: COLORS.textFaint }}>{x.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 完整 Top10（全部评分） */}
            {top10.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold mb-1.5" style={{ color: COLORS.text }}>{t("dc.td.top10")}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]" style={{ color: COLORS.text }}>
                    <thead>
                      <tr style={{ color: COLORS.textFaint }}>
                        <th className="text-left font-medium py-1 pr-2">#</th>
                        <th className="text-left font-medium py-1 pr-2">{t("dc.td.colStock")}</th>
                        <th className="text-right font-medium py-1 pr-2">AI</th>
                        <th className="text-right font-medium py-1 pr-2">GPT</th>
                        <th className="text-right font-medium py-1">{t("dc.td.gptNote")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top10.map((r, i) => (
                        <tr key={r.symbol} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                          <td className="py-1 pr-2 tabular-nums" style={{ color: COLORS.textFaint }}>{r.rank ?? i + 1}</td>
                          <td className="py-1 pr-2"><span className="truncate">{r.name ?? r.symbol}</span> <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                          <td className="py-1 pr-2 text-right tabular-nums">{r.aiScore ?? "—"}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{r.gptScore ?? "—"}</td>
                          <td className="py-1 text-right text-[11px] max-w-[280px] truncate" style={{ color: COLORS.textSecondary }}>{r.gptNote ?? r.reason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c?.meta?.gptModel && <div className="text-[10px] mt-1" style={{ color: COLORS.textFaint }}>GPT: {c.meta.gptModel}{c.meta.gptAnalyzed != null ? ` · ${c.meta.gptAnalyzed}` : ""}</div>}
              </div>
            )}

            {/* BUY 均值比较：第一推荐 vs 今日回避首位 */}
            {top1 && avoid.length > 0 && <ExplainCompare symbolA={top1.symbol} symbolB={avoid[0].symbol} />}
          </div>
        )}
      </AppCard>
    </div>
  );
}
