"use client";

// ── 上线就绪度（原 V3 校准中心）· 研究区 ③ AI 分析 ────────────────────────────
//
// 纯展示层：只读 /api/scoring-v3/calibration，展示动态阈值 / Confidence /
// 数据质量 / 就绪度。不改任何 API / 校准 / 评分算法。
//
// ⚠️ P21-T5-3B 修复的既有缺陷：
//   route 在无数据时返回 `{ date: null }`（不含 confidenceStats / quality / sbStats），
//   而组件只判 `!d` 就继续访问 `d.confidenceStats.mean.toFixed(1)` → TypeError → 整页白屏。
//   现在改为 `hasData` 逐字段校验，缺数据显示诚实空态，绝不对 undefined 调 toFixed()。
//
// ⚠️ 同时清理三个指向已下线 Tab 的跳转（freeze / v3 / overview 在 P21-T2/T5-3A 已删）。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  RM, ResearchPanelShell, ResearchStatusBadge, ResearchButton,
  ResearchKpiGrid, ResearchKpiCard, ResearchSection, ResearchInsightCard,
  ResearchTimeline, ResearchTable, RTh, RTd, rowHoverClass,
  ResearchLoadingState, ResearchEmptyState, ResearchErrorState,
  type Tone, type TimelineStep,
} from "./kit";
import { AsOfBar, SummaryCard, ScopeNote } from "./PanelFrame";

type Cal = {
  date: string | null; regime: string | null; computedAt: string | null;
  thresholds: { cutoffs: Record<string, number>; targets: Record<string, number> } | null;
  ratingDist?: Record<string, number>;
  confidenceStats?: { mean: number; p25: number; median: number; p75: number; buckets: Record<string, number> };
  quality?: { coverage: Record<string, number>; overall: number };
  sbSector?: Record<string, number>; sbMarketCap?: Record<string, number>;
  sbStats?: { count: number; frac: number; avgConfidence: number; lowLiquidity: number };
  readiness?: number; readinessGrade?: string;
  history?: { date: string; regime: string; readiness: number; grade: string; sbStats: { count?: number } | null; ratingDist: Record<string, number> }[];
};

const DIM_KEYS = ["technical", "fundamental", "alpha", "news", "flow"] as const;
const CUT_KEYS = ["sb", "buy", "hold", "watch"] as const;
const GRADE_TONE: Record<string, Tone> = { A: "green", B: "blue", C: "amber", D: "red" };
const GRADE_HEX: Record<string, string> = { A: RM.green, B: RM.blue, C: RM.amber, D: RM.red };

export function CalibrationPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t, lang } = useI18n();
  const tx = t as (k: string) => string;
  const [d, setD] = useState<Cal | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scoring-v3/calibration")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setD)
      .catch((e) => setErr(String(e)));
  }, []);

  // ⚠️ 崩溃修复的核心：逐字段校验，任一缺失即视为无数据。
  const cs = d?.confidenceStats;
  const quality = d?.quality;
  const hasData = !!(d && d.date && cs && typeof cs.mean === "number" && quality && typeof quality.overall === "number");

  function exportCsv() {
    if (!d?.history?.length) return;
    const lines = ["date,regime,readiness,grade,STRONG_BUY,BUY,HOLD,WATCH,AVOID"];
    for (const h of d.history) {
      lines.push([h.date, h.regime, h.readiness, h.grade,
        h.ratingDist?.STRONG_BUY ?? 0, h.ratingDist?.BUY ?? 0, h.ratingDist?.HOLD ?? 0,
        h.ratingDist?.WATCH ?? 0, h.ratingDist?.AVOID ?? 0].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `v3-calibration-${d.date ?? "latest"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const goFactors = onNavigate ? () => onNavigate("factors") : undefined;
  const title = t("rw.v.calibration");
  const regimeLabel = d?.regime && ["BULL", "BEAR", "SIDEWAYS"].includes(d.regime)
    ? tx(`dc.regime.${d.regime}`) : (d?.regime ?? "—");

  if (err) {
    return (
      <ResearchPanelShell>
        <h2 className="text-[15px] font-semibold" style={{ color: RM.ink }}>{title}</h2>
        <ResearchErrorState message={err} hint={t("rp.v3cal.errHint")}
          actions={<ResearchButton onClick={goFactors} disabled={!goFactors}>{t("rp.v3cal.backFactors")}</ResearchButton>} />
      </ResearchPanelShell>
    );
  }
  if (!d) {
    return (
      <ResearchPanelShell>
        <h2 className="text-[15px] font-semibold" style={{ color: RM.ink }}>{title}</h2>
        <ResearchLoadingState />
      </ResearchPanelShell>
    );
  }
  if (!hasData) {
    // 诚实空态：不伪造任何数字，说明何时会有数据。
    return (
      <ResearchPanelShell>
        <h2 className="text-[15px] font-semibold" style={{ color: RM.ink }}>{title}</h2>
        <AsOfBar asOf={d.computedAt} source="AdaptiveScoreV3Calibration" />
        <ResearchEmptyState title={t("rp.v3cal.emptyTitle")} desc={t("rp.v3cal.emptyDesc")} />
        <ScopeNote>{t("rp.v3cal.scope")}</ScopeNote>
      </ResearchPanelShell>
    );
  }

  const grade = d.readinessGrade ?? "";
  const readiness = d.readiness ?? 0;
  const cov = quality!.coverage ?? {};
  const conf = cs!;
  const history = d.history ?? [];
  const sb = d.sbStats;

  const timelineSteps: TimelineStep[] = history.map((h, i) => ({
    label: `${h.date} · ${["BULL", "BEAR", "SIDEWAYS"].includes(h.regime) ? tx(`dc.regime.${h.regime}`) : h.regime}`,
    sub: <>{t("rp.v3cal.readiness")} <b style={{ color: RM.ink }}>{h.readiness.toFixed(1)}</b> · Grade {h.grade} · STRONG_BUY {h.ratingDist?.STRONG_BUY ?? h.sbStats?.count ?? "—"}</>,
    right: <ResearchStatusBadge tone={GRADE_TONE[h.grade] ?? "neutral"}>Grade {h.grade}</ResearchStatusBadge>,
    state: i === 0 ? "current" : "done",
  }));

  return (
    <ResearchPanelShell>
      <h2 className="text-[15px] font-semibold" style={{ color: RM.ink }}>{title}</h2>
      <AsOfBar asOf={d.computedAt} source="AdaptiveScoreV3Calibration" />

      <SummaryCard
        tone={GRADE_TONE[grade] ?? "neutral"}
        headline={`${t("rp.v3cal.readiness")} ${readiness.toFixed(1)} / 100 · Grade ${grade} — ${tx(`rp.v3cal.grade.${grade || "D"}`)}`}
        items={[
          { label: "Confidence", value: `${conf.mean.toFixed(1)}%` },
          { label: t("rp.v3cal.dataQuality"), value: `${quality!.overall}%` },
          { label: t("rp.v3cal.gate"), value: readiness >= 90 ? t("rp.v3cal.gatePass") : t("rp.v3cal.gateFail") },
        ]}
      />

      <ResearchKpiGrid>
        <ResearchKpiCard label={t("rp.v3cal.confMean")} value={`${conf.mean.toFixed(1)}%`} sub={`P25/P50/P75 ${conf.p25}/${conf.median}/${conf.p75}`} tone="blue" />
        <ResearchKpiCard label={t("rp.v3cal.dataQuality")} value={`${quality!.overall}%`} sub={t("rp.v3cal.dimCoverage")} tone="green" />
        <ResearchKpiCard label={t("rp.v3cal.readiness")} value={readiness.toFixed(1)} sub="/ 100" tone={GRADE_TONE[grade]} />
        <ResearchKpiCard label={t("rp.v3cal.gradeLabel")} value={`Grade ${grade}`} sub={tx(`rp.v3cal.grade.${grade || "D"}`)} tone={GRADE_TONE[grade]} />
        <ResearchKpiCard label={t("rp.v3cal.latest")} value={<span className="text-[15px]">{d.date ?? t("common.no_data")}</span>} sub={regimeLabel} />
        <ResearchKpiCard label={t("rp.v3cal.version")} value={<span className="text-[15px]">adaptive-v3</span>} sub="Adaptive Version" />
      </ResearchKpiGrid>

      <ResearchInsightCard title={t("rp.v3cal.recTitle")} tone={GRADE_TONE[grade]}>
        {t("rp.v3cal.readiness")} <b style={{ color: GRADE_HEX[grade] }}>{readiness.toFixed(1)}/100（Grade {grade}）</b> ·
        Confidence <b style={{ color: RM.ink }}>{conf.mean.toFixed(1)}%</b> ·
        {t("rp.v3cal.dataQuality")} <b style={{ color: RM.ink }}>{quality!.overall}%</b>。
        {readiness >= 90 ? t("rp.v3cal.gatePassNote") : t("rp.v3cal.gateFailNote")}
      </ResearchInsightCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ResearchSection title={t("rp.v3cal.thresholds")} desc={regimeLabel}>
          <div className="space-y-1.5">
            {CUT_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                <span className="text-[13px]" style={{ color: RM.sub }}>{tx(`rp.v3cal.cut.${k}`)}</span>
                <span className="text-[13px] tabular-nums">
                  <b style={{ color: RM.ink }}>≥{d.thresholds?.cutoffs[k]?.toFixed(1) ?? "—"}</b>{" "}
                  <span style={{ color: RM.faint }}>{t("rp.v3cal.topPct")} {((d.thresholds?.targets[k] ?? 0) * 100).toFixed(1)}%</span>
                </span>
              </div>
            ))}
          </div>
        </ResearchSection>

        <ResearchSection title={t("rp.v3cal.confDist")} desc={`${t("rp.v3cal.confMean")} ${conf.mean.toFixed(1)}%`}>
          <div className="grid grid-cols-3 gap-3">
            {([["high", RM.green], ["mid", RM.amber], ["low", RM.red]] as const).map(([lvl, c]) => {
              // buckets 的键是中文（API 既有口径），此处按语言取标签但用原键取值
              const rawKey = lvl === "high" ? "高" : lvl === "mid" ? "中" : "低";
              const v = conf.buckets?.[rawKey] ?? 0;
              return (
                <div key={lvl} className="rounded-xl px-3 py-3 text-center" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                  <div className="text-[22px] font-semibold tabular-nums" style={{ color: c }}>{v.toLocaleString()}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: RM.muted }}>{tx(`rp.v3cal.conf.${lvl}`)}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>P25 / P50 / P75：{conf.p25} / {conf.median} / {conf.p75}</div>
        </ResearchSection>

        <ResearchSection title={t("rp.v3cal.dataQuality")} desc={`${quality!.overall}%`}>
          <div className="space-y-2">
            {DIM_KEYS.map((k) => {
              const v = cov[k] ?? 0;
              const c = v >= 60 ? RM.green : v >= 20 ? RM.amber : RM.red;
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-[12px] w-16 shrink-0" style={{ color: RM.sub }}>{tx(`rp.v3cal.dim.${k}`)}</span>
                  <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: RM.card }}>
                    <div className="h-full rounded" style={{ width: `${v}%`, background: c }} />
                  </div>
                  <span className="text-[12px] tabular-nums w-12 text-right" style={{ color: RM.sub }}>{v.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </ResearchSection>

        <ResearchSection title={t("rp.v3cal.sbTitle")} desc={t("rp.v3cal.sbDesc")}>
          {sb ? (
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label={t("rp.v3cal.sbCount")} value={String(sb.count)} sub={`${sb.frac}%`} />
              <MiniStat label={t("rp.v3cal.sbConf")} value={`${sb.avgConfidence}%`} />
              <MiniStat label={t("rp.v3cal.sbLowLiq")} value={String(sb.lowLiquidity)} tone={sb.lowLiquidity > 0 ? "amber" : "green"} />
              <MiniStat label={t("rp.v3cal.sbCap")} value={Object.entries(d.sbMarketCap ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"} sub={`${Object.keys(d.sbMarketCap ?? {}).length}`} />
            </div>
          ) : <ResearchEmptyState title={t("common.no_data")} />}
        </ResearchSection>
      </div>

      <ResearchSection title={t("rp.v3cal.histTitle")} desc={t("rp.v3cal.histDesc")}
        right={<ResearchButton onClick={exportCsv} disabled={!history.length}>{t("rp.v3cal.exportCsv")}</ResearchButton>}>
        {timelineSteps.length === 0 ? (
          <ResearchEmptyState title={t("rp.v3cal.noHist")} desc={t("rp.v3cal.noHistDesc")} />
        ) : (
          <>
            <ResearchTimeline steps={timelineSteps} />
            <div className="mt-2" style={{ maxHeight: 320, overflow: "auto" }}>
              <ResearchTable minWidth={520}>
                <thead><tr>
                  <RTh>{t("rp.v3cal.colDate")}</RTh><RTh>{t("rp.v3cal.colRegime")}</RTh>
                  <RTh align="right">{t("rp.v3cal.readiness")}</RTh><RTh align="center">Grade</RTh>
                  <RTh align="right">STRONG_BUY</RTh>
                </tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.date} className={rowHoverClass}>
                      <RTd mono color={RM.sub}>{h.date}</RTd>
                      <RTd color={RM.sub}>{["BULL", "BEAR", "SIDEWAYS"].includes(h.regime) ? tx(`dc.regime.${h.regime}`) : h.regime}</RTd>
                      <RTd align="right" mono>{h.readiness.toFixed(1)}</RTd>
                      <RTd align="center" color={GRADE_HEX[h.grade]}><b>{h.grade}</b></RTd>
                      <RTd align="right" mono color={RM.sub}>{h.ratingDist?.STRONG_BUY ?? h.sbStats?.count ?? "—"}</RTd>
                    </tr>
                  ))}
                </tbody>
              </ResearchTable>
            </div>
          </>
        )}
      </ResearchSection>

      <ScopeNote>{t("rp.v3cal.scope")}</ScopeNote>
      <span className="hidden">{lang}</span>
    </ResearchPanelShell>
  );
}

function MiniStat({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: Tone }) {
  const c = tone === "green" ? RM.green : tone === "amber" ? RM.amber : tone === "red" ? RM.red : RM.ink;
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
      <div className="text-[11px]" style={{ color: RM.muted }}>{label}</div>
      <div className="text-[16px] font-semibold tabular-nums mt-0.5" style={{ color: c }}>
        {value}{sub && <span className="text-[12px] ml-1" style={{ color: RM.faint }}>{sub}</span>}
      </div>
    </div>
  );
}
