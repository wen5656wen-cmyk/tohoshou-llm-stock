"use client";

// ── 决策中心 · 今日决策（P9-DECISION-01 老板投资模式）─────────────────────────
// 老板 30 秒内知道：今天买不买 / 买什么 / 为什么 / 买多少 / 何时卖。
// 纯展示层：只读复用 closing-decision + decision-center 现有 API；
// 禁止重算/新增算法/改评分/改 Portfolio Builder/改 DB。
//
// 结构：①今日决策(verdict+市场+机会数) ②第一推荐(单一最优标的) ③建议组合(分散配置方案)
//       ④今日回避(0~3 动态) —— 已按指示移除「现金比例」(Portfolio Builder 固定归一 100%，恒为 0，无信息量)。
//
// 诚实性护栏（不得隐藏底层矛盾）：
//   · 第一推荐与建议组合是引擎的两个不同产物 → 各自标注语义；top1 未入组合时如实说明原因。
//   · 组合成分若 top10.inBuyZone=false → 打「现价已脱离买区」徽章（如实呈现，不伪造一致性）。
//   · 回避列表必须先排除 组合∪第一推荐；recommended ∩ avoid 必须为空，冲突则剔除并 warn。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppButton, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";
import ExplainReportButton from "@/components/explain/ExplainReportButton";
// P9-DECISION-02：回避判据唯一来源（与「收盘决策 · 今日放弃股票」共用，保证两页结论一致）
import { buildAvoidList, recommendedSymbols, type AvoidReasonKey } from "@/lib/decision/avoid";
// P10-RESEARCH-01：催化剂 / 两级风险 / 比较视图（纯展示派生，不改任何引擎）
import { buildCatalysts, buildRiskView, starStr, L2_NOTE, type Catalyst, type RiskView } from "@/lib/explain/gap";
import ExplainCompare from "@/components/explain/ExplainCompare";

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
}
interface ClosingApi {
  ok: boolean; empty?: boolean; date?: string; decidedAtJst?: string | null;
  verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null;
  market?: { regime: string | null; volatility: number | null; newsRiskCount?: number | null; qualifiedCount?: number | null };
  top1?: Top1 | null; portfolio?: Leg[]; portfolioNote?: string | null; top10?: Top10Row[]; summary?: string | null;
}
interface DcApi { ok: boolean; dateJst?: string; market?: { regime: string | null; riskLevel: string | null; volatility: number | null } }

const VERDICT_TONE: Record<string, "green" | "amber" | "red"> = { BUY_TODAY: "green", WATCH_ONLY: "amber", STAY_CASH: "red" };
const VERDICT_ICON: Record<string, string> = { BUY_TODAY: "🟢", WATCH_ONLY: "🟡", STAY_CASH: "⚪" };
const jpy = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString()}`);
const pct1 = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`);

/** 回避原因文案（判据/排序/排除规则均在 lib/decision/avoid.ts 中，两页共用） */
const AVOID_LABEL: Record<AvoidReasonKey, string> = {
  news: "近期利空", risk: "风险偏高", dump: "放量下跌", zone: "已脱离买区/追高",
};

export default function DecisionOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t } = useI18n();
  const [c, setC] = useState<ClosingApi | null>(null);
  const [dc, setDc] = useState<DcApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [cj, dj] = await Promise.all([
          fetch("/api/admin/closing-decision", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/decision-center", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (!alive) return;
        setC(cj); setDc(dj);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "load failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // P10：第一推荐的催化剂 / 个股风险 / 全球市场（懒随主数据加载，失败各自安全空态）
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
      setP10({
        disc: Array.isArray(d) ? d : [],
        news: Array.isArray(n) ? n : [],
        explainRisks: Array.isArray(e?.risks) ? e.risks : null,
        gm: m?.globalMarket ?? null,
      });
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
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime)
    ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const vol = dc?.market?.volatility ?? c?.market?.volatility ?? null;
  const oppCount = c?.market?.qualifiedCount ?? null;

  // ── 第一推荐派生（全部来自真实字段）──
  const expReturn = top1?.target1 != null && top1?.price ? ((top1.target1 - top1.price) / top1.price) * 100 : null;
  const slPct = top1?.stopLoss != null && top1?.price ? ((top1.stopLoss - top1.price) / top1.price) * 100 : null;
  const rr = expReturn != null && slPct != null && slPct !== 0 ? Math.abs(expReturn / slPct) : null;

  // AI 推荐理由 ≤3（真实来源：verdictReason + top10 内该股 reason / gptNote），无则不编造
  const top1Row = top1 ? t10.get(top1.symbol) : null;
  const reasons = [top1Row?.reason, top1Row?.gptNote, c?.verdictReason]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .map((x) => x.trim())
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 3);

  // ── 今日回避：判据/排除/排序/上限/断言 全部委托给 SSOT（与收盘决策「今日放弃股票」同源）──
  const recommended = recommendedSymbols(top1, legs);
  const avoidRes = buildAvoidList(top10, recommended);
  const avoid = avoidRes.items;

  const top1InPortfolio = top1 ? legs.some((l) => l.symbol === top1.symbol) : true;

  // ── P10：③今日最大催化剂 / ④今日最大风险（两级） ──
  const cat: Catalyst[] = top1 ? buildCatalysts(p10.disc, p10.news, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10), 5) : [];
  const riskView: RiskView | null = top1
    ? buildRiskView(p10.explainRisks, {
        nasdaqChange: p10.gm?.nasdaqChange ?? null, vix: p10.gm?.vix ?? null,
        usdjpy: p10.gm?.usdjpy ?? null, regime: regime,
      })
    : null;

  const Row = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
    <div className="flex items-center justify-between py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{k}</span>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</span>
    </div>
  );

  return (
    <div className="max-w-[760px] mx-auto space-y-3">
      {/* ① 今日决策 */}
      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{verdict ? VERDICT_ICON[verdict] : "—"}</span>
            <div>
              <div className="text-[20px] font-bold tracking-tight" style={{ color: COLORS.text }}>
                {verdict ? t(`dc.verdict.${verdict}` as Parameters<typeof t>[0]) : t("dc.ov.noData")}
              </div>
              <div className="text-[11px]" style={{ color: COLORS.textFaint }}>
                {c?.date ?? "—"} {c?.decidedAtJst ?? ""} JST
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("dc.ov.marketState")}</span>
            <AppBadge tone={regime === "BULL" ? "green" : regime === "BEAR" ? "red" : "amber"}>{regimeLabel}</AppBadge>
            {vol != null && <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("db.riskLevel")} {Math.round(vol * 10) / 10}</span>}
            {oppCount != null && (
              <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>
                {t("dc.ov.oppCount")} <b style={{ color: COLORS.primary }}>{oppCount}</b>
              </span>
            )}
          </div>
        </div>
        {c?.verdictReason && (
          <p className="text-[12px] mt-2 pt-2" style={{ color: COLORS.textSecondary, borderTop: `1px solid ${COLORS.borderSoft}` }}>
            ▸ {c.verdictReason}
          </p>
        )}
      </AppCard>

      {/* ② 第一推荐 —— 单一最优标的 */}
      <AppCard
        header={
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⭐ {t("dc.ov.firstPick")}</span>
              <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.ov.singleBest")}</span>
            </div>
            <AppButton size="sm" variant="ghost" onClick={() => onNavigate("closing")}>{t("dc.ov.viewDetail")} →</AppButton>
          </div>
        }
      >
        {top1 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[16px] font-bold" style={{ color: COLORS.text }}>{top1.name ?? top1.symbol}</span>
              <span className="text-[11px] font-mono" style={{ color: COLORS.textFaint }}>{top1.symbol}</span>
              {top1.confidence && <AppBadge tone="blue">{t("dc.ov.confidence")} {top1.confidence}</AppBadge>}
              <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>AI {top1.aiScore ?? "—"} · GPT {top1.gptScore ?? "—"}</span>
              <ExplainReportButton symbol={top1.symbol} name={top1.name} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
              <Row k={t("dc.ov.currentPrice")} v={`${jpy(top1.price)} (${pct1(top1.changePct)})`} />
              <Row k={t("dc.ov.entryRange")} v={top1.entryLow != null && top1.entryHigh != null ? `${jpy(top1.entryLow)} ~ ${jpy(top1.entryHigh)}` : "—"} />
              <Row k={t("dc.ov.target")} v={top1.target1 != null ? `T1 ${jpy(top1.target1)}${top1.target2 != null ? ` → T2 ${jpy(top1.target2)}` : ""}` : "—"} />
              <Row k={t("dc.ov.stopLossP")} v={jpy(top1.stopLoss)} tone={COLORS.danger} />
              <Row k={t("dc.ov.expReturn")} v={expReturn != null ? pct1(expReturn) : "—"} tone={(expReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
              <Row k={t("dc.ov.rr")} v={rr != null ? `${rr.toFixed(1)} : 1` : "—"} />
              <Row k={t("dc.ov.holdPeriod")} v={top1.holdPeriod ?? "—"} />
            </div>
            {reasons.length > 0 && (
              <div className="pt-2" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                <div className="text-[11px] mb-1" style={{ color: COLORS.textFaint }}>{t("dc.ov.reasons")}</div>
                <ul className="space-y-0.5">
                  {reasons.map((r, i) => (
                    <li key={i} className="text-[12px] flex gap-1.5" style={{ color: COLORS.textSecondary }}>
                      <span style={{ color: COLORS.primary }}>{i + 1}.</span><span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* ③ 建议组合 —— 分散配置方案 */}
      <AppCard
        header={
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.ov.portfolio")}</span>
              <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.ov.diversified")}</span>
            </div>
            <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{t("db.holdCount")} {legs.length}</span>
          </div>
        }
      >
        {legs.length ? (
          <div className="space-y-2">
            {legs.map((l) => {
              const row = t10.get(l.symbol);
              const outOfZone = row?.inBuyZone === false;
              return (
                <div key={l.symbol} className="pb-2" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-semibold truncate" style={{ color: COLORS.text }}>{l.name ?? l.symbol}</span>
                      <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{l.symbol}</span>
                      {l.sector && <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{l.sector}</span>}
                    </div>
                    <span className="text-[14px] font-bold tabular-nums" style={{ color: COLORS.primary }}>{Math.round(l.weight)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: COLORS.tile }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, l.weight)}%`, background: COLORS.primary }} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] tabular-nums" style={{ color: COLORS.textSecondary }}>
                    {l.entryLow != null && l.entryHigh != null && <span>{t("dc.ov.entryRange")} {jpy(l.entryLow)}~{jpy(l.entryHigh)}</span>}
                    {l.target1 != null && <span>T1 {jpy(l.target1)}</span>}
                    {l.stopLoss != null && <span style={{ color: COLORS.danger }}>SL {jpy(l.stopLoss)}</span>}
                  </div>
                  {/* 如实呈现底层矛盾：组合含此股但 top10 判定已脱离买区 */}
                  {outOfZone && (
                    <div className="mt-1 text-[11px] px-2 py-1 rounded" style={{ background: `${COLORS.warning}14`, color: COLORS.warning }}>
                      ⚠️ {t("dc.ov.outOfZone")}
                    </div>
                  )}
                </div>
              );
            })}
            {c?.portfolioNote && <p className="text-[11px]" style={{ color: COLORS.textFaint }}>{c.portfolioNote}</p>}
            {/* 第一推荐未入组合 → 如实说明，不强行并入 */}
            {top1 && !top1InPortfolio && (
              <p className="text-[11px] px-2 py-1.5 rounded" style={{ background: COLORS.tile, color: COLORS.textSecondary }}>
                ℹ️ {t("dc.ov.top1NotInPort")}
              </p>
            )}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* ④ 今日回避（0~3 动态，不凑数） */}
      <AppCard
        header={
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>
              {t("dc.ov.avoid")}{avoid.length > 0 ? `（${avoid.length}）` : ""}
            </span>
            {avoidRes.totalCandidates > avoid.length && (
              <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.showTop3")} / {avoidRes.totalCandidates}</span>
            )}
          </div>
        }
      >
        {avoid.length ? (
          <div className="space-y-1.5">
            {avoid.map((a) => (
              <div key={a.symbol} className="flex items-start justify-between gap-2 py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ color: COLORS.danger }}>✗</span>
                  <span className="text-[13px] font-medium truncate" style={{ color: COLORS.text }}>{a.name ?? a.symbol}</span>
                  <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{a.symbol}</span>
                </div>
                <span className="text-[11px] text-right shrink-0" style={{ color: COLORS.textSecondary }}>{a.reasonKeys.map((k) => AVOID_LABEL[k]).join(" / ")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.avoidNone")}</div>
        )}
      </AppCard>

      {/* ③ 今日最大催化剂 + ④ 今日最大风险（两级） */}
      {top1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AppCard header={
            <div>
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🔥 今日最大催化剂</span>
              <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{top1.name ?? top1.symbol}</span>
            </div>
          }>
            {cat.length ? (
              <div className="space-y-1.5">
                {cat.map((x, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]" style={{ opacity: x.stale ? 0.5 : 1 }}>
                    <span className="shrink-0" style={{ color: COLORS.warning }}>{starStr(x.stars)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] shrink-0" style={{ background: COLORS.tile, color: COLORS.textSecondary }}>{x.label}</span>
                    <span className="min-w-0 truncate" style={{ color: COLORS.text }}>{x.title}</span>
                    <span className="ml-auto text-[10px] shrink-0" style={{ color: COLORS.textFaint }}>{x.date}</span>
                  </div>
                ))}
                <div className="text-[10px] pt-1" style={{ color: COLORS.textFaint }}>
                  来源：TDnet 披露 + 新闻（已去重）· 灰色 = 超过 7 天 · 类别取自结构化字段，不做主观扩写
                </div>
              </div>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>暂无数据</div>}
          </AppCard>

          <AppCard header={
            <div>
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⚠️ 今日最大风险</span>
              <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>
                {riskView?.level === 1 ? `个股信号 · ${top1.name ?? top1.symbol}` : "市场级"}
              </span>
            </div>
          }>
            {riskView?.note && (
              <div className="text-[11px] mb-1.5 px-2 py-1 rounded" style={{ background: `${COLORS.warning}12`, color: COLORS.warning }}>
                ℹ️ {riskView.note}
              </div>
            )}
            {riskView?.items.length ? (
              <div className="space-y-1.5">
                {riskView.items.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="shrink-0" style={{ color: COLORS.danger }}>{starStr(r.stars)}</span>
                    <span style={{ color: COLORS.text }}>{r.title}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{L2_NOTE}</div>}
          </AppCard>
        </div>
      )}

      {/* ①② 为什么买 A / 为什么没买 B —— 比较视图（第一推荐 vs 今日回避首位） */}
      {top1 && avoid.length > 0 && (
        <ExplainCompare symbolA={top1.symbol} symbolB={avoid[0].symbol} />
      )}
    </div>
  );
}
