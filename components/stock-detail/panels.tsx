"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { fmtJpy, fmtPct, finalScoreHex, getRec } from "@/lib/rec-config";
import { getNameLines } from "@/lib/i18n/stock-name";
import { localeSector, localeMarket } from "@/lib/i18n/market-labels";
import { StalenessTag } from "@/components/StalenessTag";
import { ArrowRight, Bookmark, Star, AlertTriangle, ArrowUpRight, ShieldCheck } from "@/components/dashboard/icons";
import { stockDetail } from "@/lib/routes";
import { C, ScoreRing, Card, MetricCell, ScoreBar, recColor, riskColor, stratColor, retColor } from "./ui";
import type { IntelData, ScoreData, IndicatorData, StockInfo, GptData } from "./ui";

// ── Toolbar (back + watch + share + report) ───────────────────────────────────
export function Toolbar({ backLabel, onBack, watched, watchLoading, onToggleWatch, onShare, onReport }: {
  backLabel: string; onBack: () => void; watched: boolean; watchLoading: boolean;
  onToggleWatch: () => void; onShare: () => void; onReport: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 h-9">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors" style={{ color: C.sub }}>
        <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><ArrowRight size={15} /></span>{backLabel}
      </button>
      <div className="flex items-center gap-2">
        <button onClick={onReport} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-semibold dash-card dash-int" style={{ color: C.sub }}>
          <ShieldCheck size={14} /> 查看报告
        </button>
        <button onClick={onShare} title="分享" aria-label="分享" className="inline-flex items-center justify-center w-9 h-9 rounded-full dash-card dash-int" style={{ color: C.sub }}>
          <ArrowUpRight size={16} />
        </button>
        <button onClick={onToggleWatch} disabled={watchLoading}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-semibold dash-int disabled:opacity-50"
          style={watched ? { background: `${C.amber}14`, color: C.amber } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
          {watched ? <Star size={14} fill={C.amber} /> : <Bookmark size={14} />}
          {watched ? t("nav.watchlist") : t("nav.watchlist")}
        </button>
      </div>
    </div>
  );
}

// ── Hero card ─────────────────────────────────────────────────────────────────
export function Hero({ stock, score, ind, latestClose, latestDate, stratKey, hasStrat }: {
  stock: StockInfo; score: ScoreData | null; ind: IndicatorData | null;
  latestClose: number; latestDate: string; stratKey: string; hasStrat: boolean;
}) {
  const { t, lang } = useI18n();
  const recKey = score?.recommendationV2 ?? score?.recommendation ?? "HOLD";
  const rec = getRec(recKey);
  const nameLines = getNameLines(stock as never, lang);
  const rc = recColor(recKey);
  return (
    <div className="dash-card p-5 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {score?.marketRank != null && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ color: C.blue, background: `${C.blue}14` }}>#{score.marketRank}</span>}
            <h1 className="text-[26px] lg:text-[30px] font-semibold tracking-[-0.02em] leading-none truncate" style={{ color: C.ink }}>{nameLines[0]}</h1>
          </div>
          {nameLines[1] && <p className="text-[14px] mt-1" style={{ color: C.sub }}>{nameLines[1]}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span className="font-mono text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: C.sub, background: "#F4F4F6" }}>{stock.symbol}</span>
            {stock.market && <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: C.sub, background: "#F4F4F6" }}>{localeMarket(stock.market, lang)}</span>}
            {stock.sector && <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: C.blue, background: `${C.blue}12` }}>{localeSector(stock.sector, lang)}</span>}
            {stock.industry && <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: C.faint, background: "#F4F4F6" }}>{stock.industry}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-[13px] font-semibold px-3 py-1 rounded-full" style={{ color: rc, background: `${rc}14` }}>{rec.label}</span>
            {hasStrat && <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ color: stratColor(stratKey), background: `${stratColor(stratKey)}14` }}>{t(`strategy.${stratKey}` as never)}</span>}
            {score?.highRiskFlag && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md" style={{ color: C.red, background: `${C.red}12` }}><AlertTriangle size={12} /> {t("stock.high_risk")}</span>}
            {score?.computedAt && <StalenessTag date={score.computedAt} />}
          </div>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <div className="text-[30px] lg:text-[34px] font-semibold tabular-nums leading-none tracking-[-0.02em]" style={{ color: C.ink }}>{fmtJpy(latestClose)}</div>
            <div className="flex items-center justify-end gap-2 mt-1.5">
              {ind?.return5d != null && <span className="text-[13px] font-semibold tabular-nums" style={{ color: retColor(ind.return5d) }}>5D {fmtPct(ind.return5d)}</span>}
              {ind?.return20d != null && <span className="text-[13px] font-semibold tabular-nums" style={{ color: retColor(ind.return20d) }}>20D {fmtPct(ind.return20d)}</span>}
            </div>
            <div className="text-[11px] mt-1" style={{ color: C.faint }}>{latestDate} {t("stock.close_label")}</div>
          </div>
          {score?.adaptiveScore != null && <ScoreRing score={score.adaptiveScore} size={84} color={finalScoreHex(score.adaptiveScore)} />}
        </div>
      </div>
    </div>
  );
}

// ── Metric strip ──────────────────────────────────────────────────────────────
export function MetricStrip({ score, ind, stock, latestClose }: { score: ScoreData | null; ind: IndicatorData | null; stock: StockInfo; latestClose: number }) {
  const { t } = useI18n();
  const volRatio = (ind?.latestVolume != null && ind?.avgVolume20d != null && ind.avgVolume20d > 0) ? ind.latestVolume / ind.avgVolume20d : null;
  const w52 = (stock.high52w != null && stock.low52w != null && stock.high52w > stock.low52w) ? Math.round(((latestClose - stock.low52w) / (stock.high52w - stock.low52w)) * 100) : null;
  const cells = [
    { label: t("stock.52w_high"), value: fmtJpy(stock.high52w) },
    { label: t("stock.52w_low"), value: fmtJpy(stock.low52w) },
    { label: "52W", value: w52 != null ? `${w52}%` : "—" },
    { label: "RSI", value: ind?.rsi14 != null ? ind.rsi14.toFixed(0) : "—", color: ind?.rsi14 == null ? undefined : ind.rsi14 >= 70 ? C.red : ind.rsi14 <= 30 ? C.green : C.ink },
    { label: t("stock.5d_return"), value: fmtPct(ind?.return5d ?? null), color: retColor(ind?.return5d) },
    { label: t("stock.20d_return"), value: fmtPct(ind?.return20d ?? null), color: retColor(ind?.return20d) },
    { label: t("stock.60d_return"), value: fmtPct(ind?.return60d ?? null), color: retColor(ind?.return60d) },
    { label: t("ts.volume_ratio"), value: volRatio != null ? `${volRatio.toFixed(2)}x` : "—", color: volRatio != null && volRatio >= 1.5 ? C.amber : undefined },
    { label: t("screener.col_opportunity"), value: score?.opportunityScore != null ? score.opportunityScore.toFixed(0) : "—" },
    { label: t("screener.col_percentile"), value: score?.percentileRank != null ? `${score.percentileRank.toFixed(0)}%` : "—" },
  ];
  return (
    <div className="dash-card grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-10 divide-x divide-y xl:divide-y-0" style={{ borderColor: C.line }}>
      {cells.map((c) => <MetricCell key={c.label} label={c.label} value={c.value} color={c.color} />)}
    </div>
  );
}

// ── AI Decision panel (right, sticky) ─────────────────────────────────────────
export function DecisionPanel({ score, gpt, stratC, stratKey, aiConclusion, topReasons, topRisks, latestClose }: {
  score: ScoreData | null; gpt: GptData | null;
  stratC: { strategyType: string; confidence: number; targetReturnPct: number; stopLossPct: number; maxHoldingDays: number } | null;
  stratKey: string; aiConclusion: string | null; topReasons: string[]; topRisks: string[]; latestClose: number;
}) {
  const { t } = useI18n();
  const actionKey = score?.tradingAction ?? score?.recommendationV2 ?? "HOLD";
  const ac = recColor(score?.recommendationV2 ?? "HOLD");
  const conf = score?.overallConfidence ?? null;
  const plan = [
    { label: t("tp.entry_low"), val: score?.entryLow, color: C.ink },
    { label: t("tp.entry_high"), val: score?.entryHigh, color: C.ink },
    { label: t("tp.stop_loss"), val: score?.stopLoss, color: C.red },
    { label: t("tp.target1"), val: score?.target1, color: C.green },
    { label: t("tp.target2"), val: score?.target2, color: C.green },
  ].filter((p) => p.val != null);
  return (
    <Card title={t("ad.title")} pad={false} right={conf != null ? <span className="text-[11px] font-semibold tabular-nums" style={{ color: conf >= 70 ? C.green : conf >= 50 ? C.amber : C.red }}>{t("strategy.confidence")} {conf.toFixed(0)}%</span> : undefined}>
      <div className="p-5 space-y-3.5">
        {!score ? <p className="text-[13px]" style={{ color: C.faint }}>{t("ad.no_data")}</p> : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-bold px-4 py-1.5 rounded-full" style={{ color: ac, background: `${ac}14` }}>{score.tradingAction ? t(`action.${score.tradingAction}` as never) : getRec(score.recommendationV2).label}</span>
              {stratC && <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ color: stratColor(stratKey), background: `${stratColor(stratKey)}14` }}>{t(`strategy.${stratKey}` as never)} · {stratC.confidence}%</span>}
            </div>
            {aiConclusion && <p className="text-[13px] leading-relaxed rounded-xl px-3.5 py-3" style={{ color: C.sub, background: "#F7F7F9" }}>{aiConclusion}</p>}
            {stratC && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: t("strategy.target_return"), v: `+${stratC.targetReturnPct}%`, c: C.green },
                  { l: t("strategy.stop_loss"), v: `${stratC.stopLossPct}%`, c: C.red },
                  { l: t("strategy.max_days"), v: `${stratC.maxHoldingDays}${t("strategy.days_unit")}`, c: C.ink },
                  { l: t("strategy.allocation"), v: score.positionSizePct != null ? `${score.positionSizePct.toFixed(0)}%` : (stratKey === "SWING" ? "40%" : "30%"), c: C.ink },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl px-3 py-2" style={{ background: "#F7F7F9" }}>
                    <div className="text-[10px]" style={{ color: C.faint }}>{x.l}</div>
                    <div className="text-[15px] font-semibold tabular-nums" style={{ color: x.c }}>{x.v}</div>
                  </div>
                ))}
              </div>
            )}
            {plan.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {plan.map((p) => (
                  <div key={p.label} className="flex-1 min-w-[64px] rounded-lg px-2 py-1.5 text-center" style={{ background: "#F7F7F9" }}>
                    <div className="text-[9px]" style={{ color: C.faint }}>{p.label}</div>
                    <div className="text-[12px] font-semibold tabular-nums" style={{ color: p.color }}>{fmtJpy(p.val!)}</div>
                  </div>
                ))}
              </div>
            )}
            {topReasons.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.green }}>{t("ad.top_reasons")}</div>
                <ul className="space-y-1">{topReasons.map((r, i) => <li key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: C.sub }}><span style={{ color: C.green }}>✓</span>{r}</li>)}</ul>
              </div>
            )}
            {topRisks.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.red }}>{t("ad.top_risks")}</div>
                <ul className="space-y-1">{topRisks.map((r, i) => <li key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: C.sub }}><span style={{ color: C.amber }}>⚠</span>{r}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ── Risk panel ────────────────────────────────────────────────────────────────
export function RiskPanel({ risk }: { risk: IntelData["riskAnalysis"] }) {
  const { t } = useI18n();
  if (!risk) return null;
  const rows = [
    { label: t("ai_risk.technical"), level: risk.technical, descKey: `ai_risk.tech.${risk.technical}` },
    { label: t("ai_risk.news"), level: risk.news, descKey: `ai_risk.news.${risk.news}` },
    { label: t("ai_risk.fundamental"), level: risk.fundamental, descKey: `ai_risk.fund.${risk.fundamental}` },
    { label: t("ai_risk.volatility"), level: risk.volatility, descKey: `ai_risk.vol.${risk.volatility}` },
  ];
  return (
    <Card title={t("ai_risk.title")} right={<span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: riskColor(risk.overall), background: `${riskColor(risk.overall)}14` }}>{t(`risk.${risk.overall}` as never)}</span>}>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const pct = r.level === "LOW" ? 25 : r.level === "MEDIUM" ? 55 : r.level === "EXTREME" ? 95 : 80;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium" style={{ color: C.ink }}>{r.label}</span>
                <span className="text-[11px] font-semibold" style={{ color: riskColor(r.level) }}>{t(`risk.${r.level}` as never)}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#EEEEF1" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: riskColor(r.level) }} /></div>
              <div className="text-[10px] mt-0.5" style={{ color: C.faint }}>{t(r.descKey as never)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Company info + related ────────────────────────────────────────────────────
export function CompanyPanel({ stock, sectorComparison }: { stock: StockInfo; sectorComparison: IntelData["sectorComparison"] }) {
  const { t, lang } = useI18n();
  return (
    <Card title={t("pc.title")} right={sectorComparison ? <span className="text-[11px]" style={{ color: C.faint }}>#{sectorComparison.sectorRank ?? "—"} / {sectorComparison.sectorTotal}</span> : undefined}>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] mb-3">
        {stock.sector && <span style={{ color: C.faint }}>{t("screener.col_style") || "行业"}：<span className="font-medium" style={{ color: C.ink }}>{localeSector(stock.sector, lang)}</span></span>}
        {stock.industry && <span style={{ color: C.faint }}>{stock.industry}</span>}
        {stock.market && <span style={{ color: C.faint }}>{localeMarket(stock.market, lang)}</span>}
      </div>
      {sectorComparison ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { l: t("pc.your_rank"), v: `#${sectorComparison.sectorRank ?? "—"}` },
              { l: t("pc.sector_avg"), v: sectorComparison.sectorAvg.toFixed(1) },
              { l: t("pc.rel_strength"), v: `${(sectorComparison.myScore - sectorComparison.sectorAvg) >= 0 ? "+" : ""}${(sectorComparison.myScore - sectorComparison.sectorAvg).toFixed(1)}`, c: retColor(sectorComparison.myScore - sectorComparison.sectorAvg) },
            ].map((x) => (
              <div key={x.l} className="text-center rounded-xl py-2" style={{ background: "#F7F7F9" }}>
                <div className="text-[10px]" style={{ color: C.faint }}>{x.l}</div>
                <div className="text-[16px] font-semibold tabular-nums" style={{ color: x.c ?? C.ink }}>{x.v}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>{t("pc.top_in_sector")}</div>
          <div className="space-y-1">
            {sectorComparison.topStocks.map((s, i) => {
              const rk = getRec(s.recommendation ?? "HOLD");
              const name = (lang === "zh-CN" ? s.nameZh : null) ?? s.name;
              return (
                <Link key={s.symbol} href={stockDetail(s.symbol)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors hover:bg-[#F4F4F6]" style={s.isCurrent ? { background: `${C.blue}0d`, border: `1px solid ${C.blue}33` } : undefined}>
                  <span className="w-4 tabular-nums shrink-0" style={{ color: C.faint }}>{i + 1}</span>
                  <span className="font-mono shrink-0 w-14" style={{ color: C.faint }}>{s.symbol}</span>
                  <span className="flex-1 truncate font-medium" style={{ color: C.ink }}>{name}</span>
                  <span className="font-semibold tabular-nums shrink-0" style={{ color: finalScoreHex(s.adaptiveScore ?? 0) }}>{s.adaptiveScore?.toFixed(0) ?? "—"}</span>
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: recColor(s.recommendation), background: `${recColor(s.recommendation)}14` }}>{rk.label}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : <p className="text-[12px]" style={{ color: C.faint }}>{t("pc.phase2")}</p>}
    </Card>
  );
}
