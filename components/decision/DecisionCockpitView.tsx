"use client";

// ── 决策中心 · AI 市场驾驶舱（P9-DECISION-01 重做）───────────────────────────
// 原则：只展示帮助老板赚钱的「市场信息」，不展示任何开发者/系统内部指标。
// 已移除：Feature Platform(Integrity/Shadow/Promotion) · System(Health/Cron/Web/DB/Deploy/Build/Version) · Pipeline。
//
// 数据来源（全部现有只读 API，零后端改动 / 零新算法）：
//   · /api/admin/decision-center → market(regime/riskLevel/volatility/topix/nikkei)
//   · /api/ai-theme              → 17 主题 × 成分股(return5d/return20d) + 40 标准分类 + 5 层
//   · /api/admin/closing-decision→ top10(riskLevel/newsSentiment/inBuyZone) → 风险提示
//   · /api/disclosures           → TDnet 真实披露(category/sentiment/importance) → 今日催化剂
//
// ⚠️ 诚实口径：
//   ·「主题动能」= 成分股 5日/20日涨幅均值（真实价格数据）。**不是机构资金流** —— 库中无按主题的
//     机构资金流数据源（InstitutionalFlow 仅市场级），故不提供「资金流向」，也绝不用评分值伪装。
//   · 任一区块无可靠真实数据 → 显示「暂无可靠数据」，不降级为猜测。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";
import { getThemeLabel, getLayerLabel } from "@/lib/i18n/theme-labels";

interface Market { regime: string | null; riskLevel: string | null; volatility: number | null; topix: number | null; topixChange: number | null; nikkei: number | null; nikkeiChange: number | null }
interface DcApi { ok?: boolean; dateJst?: string; market?: Market }
interface ThemeStock { symbol: string; theme: string; subTheme: string | null; supplyChainLayer: string | null; return5d: number | null; return20d: number | null; scored: boolean }
interface ThemeSummary { theme: string; count: number }
interface ThemeApi { stocks?: ThemeStock[]; themes?: ThemeSummary[] }
interface Top10Row { symbol: string; name: string | null; riskLevel?: string | null; newsSentiment?: number | null; inBuyZone?: boolean | null }
interface ClosingApi { top10?: Top10Row[] }
interface Disc { symbol: string; title: string; category: string | null; sentiment: string | null; importance: number | null; publishedAt: string; stock?: { nameZh?: string | null; name?: string | null } | null }

const REGIME_LABEL: Record<string, string> = { BULL: "Bullish", SIDEWAYS: "Neutral", BEAR: "Bearish" };
const pct1 = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default function DecisionCockpitView() {
  const { t, lang } = useI18n();
  const [dc, setDc] = useState<DcApi | null>(null);
  const [th, setTh] = useState<ThemeApi | null>(null);
  const [cl, setCl] = useState<ClosingApi | null>(null);
  const [disc, setDisc] = useState<Disc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      try {
        const [a, b, c, d] = await Promise.all([
          get("/api/admin/decision-center"), get("/api/ai-theme"),
          get("/api/admin/closing-decision"), get("/api/disclosures?limit=40"),
        ]);
        if (!alive) return;
        setDc(a); setTh(b); setCl(c); setDisc(Array.isArray(d) ? d : null);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "load failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <AppLoading />;
  if (error) return <AppEmptyState title={t("dc.ov.loadFail")} desc={error} />;

  const m = dc?.market ?? null;
  const stocks = th?.stocks ?? [];
  const themes = th?.themes ?? [];

  // 主题动能：成分股 5日/20日涨幅均值（真实价格数据，非资金流）
  const momentum = themes
    .map((x) => {
      const g = stocks.filter((s) => s.theme === x.theme && s.scored);
      return {
        theme: x.theme, label: getThemeLabel(x.theme, lang), count: g.length,
        r5: avg(g.map((s) => s.return5d).filter((v): v is number => v != null)),
        r20: avg(g.map((s) => s.return20d).filter((v): v is number => v != null)),
      };
    })
    .filter((x) => x.count > 0 && x.r5 != null)
    .sort((a, b) => (b.r5 ?? 0) - (a.r5 ?? 0));

  // 产业链热度 TOP10：按 5 日动能排序的标准分类(subTheme)
  const bySub = new Map<string, { layer: string | null; rs: number[] }>();
  for (const s of stocks) {
    if (!s.subTheme || !s.scored || s.return5d == null) continue;
    const e = bySub.get(s.subTheme) ?? { layer: s.supplyChainLayer, rs: [] };
    e.rs.push(s.return5d);
    bySub.set(s.subTheme, e);
  }
  const heat = [...bySub.entries()]
    .map(([k, v]) => ({ sub: k, layer: v.layer, n: v.rs.length, r5: avg(v.rs) as number }))
    .sort((a, b) => b.r5 - a.r5)
    .slice(0, 10);

  const hot = momentum.slice(0, 5);

  // 今日催化剂：TDnet 真实披露（近 2 日，按重要度）
  const now = Date.now();
  const catalysts = (disc ?? [])
    .filter((d) => now - new Date(d.publishedAt).getTime() < 2 * 86400_000)
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 8);

  // 风险提示 TOP5：closing top10 的真实风险字段
  const risks = (cl?.top10 ?? [])
    .map((r) => {
      const rs: string[] = [];
      if ((r.newsSentiment ?? 0) < 0) rs.push("近期利空");
      if (String(r.riskLevel ?? "").toUpperCase() === "HIGH") rs.push("风险偏高");
      if (r.inBuyZone === false) rs.push("已脱离买区");
      return { symbol: r.symbol, name: r.name, rs };
    })
    .filter((r) => r.rs.length)
    .slice(0, 5);

  const NA = () => <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dc.ck.noReliable")}</div>;

  return (
    <div className="max-w-[1100px] mx-auto space-y-3">
      {/* 市场状态 */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.ov.marketState")}</span>}>
        {m ? (
          <div className="flex flex-wrap items-center gap-4">
            <AppBadge tone={m.regime === "BULL" ? "green" : m.regime === "BEAR" ? "red" : "amber"}>
              {REGIME_LABEL[m.regime ?? ""] ?? m.regime ?? "—"}
            </AppBadge>
            <Stat k={t("db.riskLevel")} v={m.riskLevel ?? "—"} />
            <Stat k="Volatility" v={m.volatility != null ? String(Math.round(m.volatility * 10) / 10) : "—"} />
            <Stat k="TOPIX" v={m.topix != null ? `${Math.round(m.topix * 10) / 10} (${pct1(m.topixChange)})` : "—"} tone={(m.topixChange ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
            <Stat k="Nikkei" v={m.nikkei != null ? `${Math.round(m.nikkei).toLocaleString()} (${pct1(m.nikkeiChange)})` : "—"} tone={(m.nikkeiChange ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
          </div>
        ) : <NA />}
      </AppCard>

      {/* 主题动能（口径明示：非资金流） */}
      <AppCard header={
        <div>
          <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.ck.momentum")}</span>
          <div className="text-[10px] mt-0.5" style={{ color: COLORS.textFaint }}>{t("dc.ck.momentumNote")}</div>
          <div className="text-[10px]" style={{ color: COLORS.textFaint }}>※ {t("dc.ck.fundFlowNA")}</div>
        </div>
      }>
        {momentum.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {momentum.map((x) => (
              <div key={x.theme} className="flex items-center justify-between px-2.5 py-2 rounded-lg" style={{ background: COLORS.tile }}>
                <span className="text-[12px] truncate" style={{ color: COLORS.text }}>
                  {x.label}<span className="ml-1 text-[10px]" style={{ color: COLORS.textFaint }}>{x.count}</span>
                </span>
                <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: (x.r5 ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>
                  {pct1(x.r5)} <span className="text-[10px]" style={{ color: COLORS.textFaint }}>/ {pct1(x.r20)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : <NA />}
      </AppCard>

      {/* 产业链热度 TOP10 */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.ck.heat")}</span>}>
        {heat.length ? (
          <div className="space-y-1">
            {heat.map((h, i) => (
              <div key={h.sub} className="flex items-center gap-2 py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span className="text-[11px] w-5 tabular-nums" style={{ color: COLORS.textFaint }}>{i + 1}</span>
                <span className="text-[12px] flex-1 truncate" style={{ color: COLORS.text }}>{h.sub}</span>
                {h.layer && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: COLORS.tile, color: COLORS.textSecondary }}>{getLayerLabel(h.layer, lang)}</span>}
                <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{h.n}</span>
                <span className="text-[12px] font-semibold tabular-nums w-16 text-right" style={{ color: h.r5 >= 0 ? COLORS.success : COLORS.danger }}>{pct1(h.r5)}</span>
              </div>
            ))}
          </div>
        ) : <NA />}
      </AppCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 今日催化剂 */}
        <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.ck.catalyst")}</span>}>
          {catalysts.length ? (
            <div className="space-y-1.5">
              {catalysts.map((d, i) => (
                <div key={i} className="flex items-start gap-2 py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <AppBadge tone={d.sentiment === "POSITIVE" ? "green" : d.sentiment === "NEGATIVE" ? "red" : "neutral"}>{d.category ?? "—"}</AppBadge>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] truncate" style={{ color: COLORS.text }}>{d.stock?.nameZh ?? d.stock?.name ?? d.symbol}</div>
                    <div className="text-[11px] truncate" style={{ color: COLORS.textSecondary }}>{d.title}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <NA />}
        </AppCard>

        {/* 风险提示 TOP5 */}
        <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.ck.riskTop")}</span>}>
          {risks.length ? (
            <div className="space-y-1.5">
              {risks.map((r) => (
                <div key={r.symbol} className="flex items-center justify-between gap-2 py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span style={{ color: COLORS.danger }}>⚠</span>
                    <span className="text-[12px] truncate" style={{ color: COLORS.text }}>{r.name ?? r.symbol}</span>
                    <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span>
                  </div>
                  <span className="text-[11px] shrink-0" style={{ color: COLORS.textSecondary }}>{r.rs.join(" / ")}</span>
                </div>
              ))}
            </div>
          ) : <NA />}
        </AppCard>
      </div>

      {/* 今日热点主题 TOP5 */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.ck.hotTheme")}</span>}>
        {hot.length ? (
          <div className="flex flex-wrap gap-2">
            {hot.map((h, i) => (
              <span key={h.theme} className="px-2.5 py-1.5 rounded-lg text-[12px]" style={{ background: COLORS.tile, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                <b style={{ color: COLORS.textFaint }}>{i + 1}.</b> {h.label}
                <b className="ml-1.5 tabular-nums" style={{ color: (h.r5 ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{pct1(h.r5)}</b>
              </span>
            ))}
          </div>
        ) : <NA />}
      </AppCard>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>
      {k} <b className="tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</b>
    </span>
  );
}
