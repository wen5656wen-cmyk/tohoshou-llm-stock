"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { fmtAsOf } from "./PanelFrame";
import {
  RM,
  ResearchPanelShell,
  ResearchStatusBadge,
  ResearchButton,
  ResearchKpiGrid,
  ResearchKpiCard,
  ResearchSection,
  ResearchInsightCard,
  ResearchTable,
  RTh,
  RTd,
  rowHoverClass,
  ResearchLoadingState,
  ResearchEmptyState,
  ResearchErrorState,
  type Tone,
} from "./kit";

// 市场状态 — Market Regime Intelligence（AI 研究中心 · 市场与融合组）。
// 纯展示层：只读现有 /api/regime，展示牛市/震荡市/熊市判断、风险与市场指标。
// 不改任何 API / Market Regime 判断逻辑 / 评分。风险等级/市场判断均为已有字段的展示层映射。

type Row = {
  date: string; regime: string; regimeScore: number | null; trendScore: number | null;
  breadth: number | null; volatility: number | null; topixClose: number | null;
  ma20: number | null; ma60: number | null; ma120: number | null;
};
type Current = { date: string; regime: string; regimeScore: number | null; trendScore: number | null; breadth: number | null; volatility: number | null };
type Resp = {
  current: Current | null;
  distribution: { BULL: number; SIDEWAYS: number; BEAR: number };
  computedAt: string | null;
  timeline: Row[];
};

const RKEY: Record<string, string> = { BULL: "dc.regime.BULL", SIDEWAYS: "dc.regime.SIDEWAYS", BEAR: "dc.regime.BEAR" };
const RJUDGE: Record<string, string> = { BULL: "rp.areg.j.bull", SIDEWAYS: "rp.areg.j.side", BEAR: "rp.areg.j.bear" };
const RHEX: Record<string, string> = { BULL: RM.green, SIDEWAYS: RM.amber, BEAR: RM.red };
const RTONE: Record<string, Tone> = { BULL: "green", SIDEWAYS: "amber", BEAR: "red" };
function rlabel(r: string, tx: (k: string) => string) { return RKEY[r] ? tx(RKEY[r]) : r; }
function fx(v: number | null, d = 1) { return v == null ? "—" : v.toFixed(d); }

// 风险等级 = 波动率阈值映射（沿用 AI指挥中心既有口径 <20 低 / ≤25 中 / >25 高），非新算指标
function riskFromVol(v: number | null): { label: string; tone: Tone } {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  if (v == null) return { label: "common.no_data", tone: "neutral" };
  if (v < 20) return { label: "rp.areg.risk.low", tone: "green" };
  if (v <= 25) return { label: "rp.areg.risk.mid", tone: "amber" };
  return { label: "rp.areg.risk.high", tone: "red" };
}

export function MarketRegimePanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/regime?limit=200")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const cur = data?.current ?? null;
  const dist = data?.distribution ?? { BULL: 0, SIDEWAYS: 0, BEAR: 0 };
  const totalDays = dist.BULL + dist.SIDEWAYS + dist.BEAR || 1;
  const risk = riskFromVol(cur?.volatility ?? null);

  // 状态切换点：从时间序列相邻日 regime 变化处提取（展示层 diff，非新指标）
  const transitions = useMemo(() => {
    const t = data?.timeline ?? [];
    if (t.length < 2) return [];
    const asc = [...t].reverse(); // 旧 → 新
    const out: { date: string; from: string; to: string }[] = [];
    for (let i = 1; i < asc.length; i++) {
      if (asc[i].regime !== asc[i - 1].regime) out.push({ date: asc[i].date, from: asc[i - 1].regime, to: asc[i].regime });
    }
    return out.reverse().slice(0, 8); // 最近在前
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const header = ["date", "regime", "regimeScore", "trendScore", "breadth", "volatility", "topixClose", "ma20", "ma60", "ma120"];
    const lines = [header.join(",")];
    for (const r of data.timeline) lines.push([r.date, r.regime, r.regimeScore ?? "", r.trendScore ?? "", r.breadth ?? "", r.volatility ?? "", r.topixClose ?? "", r.ma20 ?? "", r.ma60 ?? "", r.ma120 ?? ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "market-regime.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const goFusion = onNavigate ? () => onNavigate("fusion") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;

  const hero = <MarketHero current={cur} computedAt={data?.computedAt ?? null} loading={loading} error={!!error} risk={risk} onFusion={goFusion} />;

  if (error) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchErrorState message={error} hint={tx("rp.areg.errHint")}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.areg.backFactors")}</ResearchButton>} />
      </ResearchPanelShell>
    );
  }
  if (loading) return <ResearchPanelShell>{hero}<ResearchLoadingState /></ResearchPanelShell>;
  if (!cur) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchEmptyState title={tx("common.no_data")} desc={tx("rp.areg.emptyDesc")}
          actions={<><ResearchButton variant="primary" onClick={goFusion} disabled={!goFusion}>{tx("rp.areg.toFusion")}</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.areg.backFactors")}</ResearchButton></>} />
      </ResearchPanelShell>
    );
  }

  const t0 = data!.timeline[0];

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI —— 全部为 /api/regime 已有字段；无字段处显示暂无数据 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label={tx("rw.a.regime")} value={<span style={{ color: RHEX[cur.regime] }}>{rlabel(cur.regime, tx)}</span>} sub={RJUDGE[cur.regime] ? tx(RJUDGE[cur.regime]) : "—"} />
        <ResearchKpiCard label={tx("db.riskLevel")} value={<span className="text-[18px]">{tx(risk.label)}</span>} sub={tx("rp.areg.riskSub")} tone={risk.tone} />
        <ResearchKpiCard label={tx("rp.areg.kScore")} value={fx(cur.regimeScore, 2)} sub="regimeScore" tone={RTONE[cur.regime]} />
        <ResearchKpiCard label={tx("rp.areg.kTrend")} value={fx(cur.trendScore, 2)} sub="trendScore" />
        <ResearchKpiCard label={tx("rp.areg.kBreadth")} value={`${fx(cur.breadth)}%`} sub={tx("rp.areg.kBreadthSub")} />
        <ResearchKpiCard label={tx("rp.areg.kVol")} value={`${fx(cur.volatility)}%`} sub="Volatility" />
      </ResearchKpiGrid>

      {/* Market Insight —— 今日市场摘要（真实字段的确定性展示层复述，非模型编造） */}
      <MarketInsight current={cur} risk={risk} />

      {/* 市场状态分布 + 色带 */}
      <ResearchSection title={tx("rp.areg.distTitle")} desc={tx("rp.areg.distDesc").replace("{n}", String(totalDays))} right={<ResearchButton onClick={exportCsv} disabled={!data?.timeline.length}>{tx("rp.areg.exportCsv")}</ResearchButton>}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(["BULL", "SIDEWAYS", "BEAR"] as const).map((r) => (
            <div key={r} className="rounded-xl px-4 py-3" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
              <div className="text-[11px]" style={{ color: RM.muted }}>{rlabel(r, tx)}</div>
              <div className="mt-1 text-[22px] font-semibold tabular-nums" style={{ color: RHEX[r] }}>{dist[r]}<span className="text-[12px] ml-1" style={{ color: RM.faint }}>d</span></div>
              <div className="text-[11px] tabular-nums" style={{ color: RM.faint }}>{((dist[r] / totalDays) * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] mb-1.5" style={{ color: RM.faint }}>{tx("rp.areg.band")}</div>
        <div className="flex gap-[1px] h-7 rounded-lg overflow-hidden" style={{ border: `1px solid ${RM.border}` }}>
          {[...data!.timeline].reverse().map((r) => (
            <div key={r.date} title={`${r.date} · ${rlabel(r.regime, tx)} · ${fx(r.regimeScore, 2)}`} style={{ background: RHEX[r.regime], flex: 1, opacity: 0.9 }} />
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px]" style={{ color: RM.sub }}>
          {(["BULL", "SIDEWAYS", "BEAR"] as const).map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: RHEX[r] }} />{rlabel(r, tx)}</span>
          ))}
        </div>
      </ResearchSection>

      {/* Market Timeline —— 状态切换点 */}
      <ResearchSection title={tx("rp.areg.tlTitle")} desc={tx("rp.areg.tlDesc")}>
        {transitions.length === 0 ? (
          <ResearchEmptyState title={tx("rp.areg.noSwitch")} desc={tx("rp.areg.noSwitchDesc").replace("{n}", String(totalDays))} />
        ) : (
          <div className="space-y-1.5">
            {transitions.map((tr) => (
              <div key={tr.date} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                <span className="text-[12px] font-mono shrink-0 w-24" style={{ color: RM.sub }}>{tr.date}</span>
                <span className="text-[12px] font-semibold" style={{ color: RHEX[tr.from] }}>{rlabel(tr.from, tx)}</span>
                <span style={{ color: RM.faint }}>→</span>
                <span className="text-[12px] font-semibold" style={{ color: RHEX[tr.to] }}>{rlabel(tr.to, tx)}</span>
                <ResearchStatusBadge tone={RTONE[tr.to]}>{rlabel(tr.to, tx)}</ResearchStatusBadge>
              </div>
            ))}
          </div>
        )}
      </ResearchSection>

      {/* 市场指标 —— TOPIX + 均线（/api/regime 已有；日经/VIX/USDJPY 不在本 API，不伪造） */}
      <ResearchSection title={tx("rp.areg.indicators")} desc={`TOPIX · ${t0?.date ?? cur.date}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ResearchKpiCard label={tx("rp.areg.topixClose")} value={t0?.topixClose == null ? tx("common.no_data") : t0.topixClose.toFixed(1)}  tone="blue" />
          <ResearchKpiCard label="MA20" value={t0?.ma20 == null ? tx("common.no_data") : t0.ma20.toFixed(1)} sub="MA20" />
          <ResearchKpiCard label="MA60" value={t0?.ma60 == null ? tx("common.no_data") : t0.ma60.toFixed(1)} sub="MA60" />
          <ResearchKpiCard label="MA120" value={t0?.ma120 == null ? tx("common.no_data") : t0.ma120.toFixed(1)} sub="MA120" />
        </div>
        
      </ResearchSection>

      {/* 完整状态历史表 */}
      <ResearchSection title={tx("rp.areg.histTitle")} desc={tx("rp.areg.histDesc").replace("{n}", String(data!.timeline.length))}>
        <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
          <ResearchTable minWidth={720}>
            <thead>
              <tr>
                <RTh>{tx("rp.areg.colDate")}</RTh><RTh>{tx("rw.a.regime")}</RTh><RTh align="right">{tx("rp.areg.kScore")}</RTh><RTh align="right">{tx("rp.areg.kTrend")}</RTh>
                <RTh align="right">{tx("rp.areg.kBreadth")}</RTh><RTh align="right">{tx("rp.areg.kVol")}</RTh><RTh align="right">TOPIX</RTh>
              </tr>
            </thead>
            <tbody>
              {data!.timeline.map((r) => (
                <tr key={r.date} className={rowHoverClass}>
                  <RTd mono color={RM.sub}>{r.date}</RTd>
                  <RTd><ResearchStatusBadge tone={RTONE[r.regime]}>{rlabel(r.regime, tx)}</ResearchStatusBadge></RTd>
                  <RTd align="right" mono>{fx(r.regimeScore, 2)}</RTd>
                  <RTd align="right" mono>{fx(r.trendScore, 2)}</RTd>
                  <RTd align="right" mono>{fx(r.breadth)}%</RTd>
                  <RTd align="right" mono>{fx(r.volatility)}%</RTd>
                  <RTd align="right" mono color={RM.sub}>{r.topixClose == null ? "—" : r.topixClose.toFixed(0)}</RTd>
                </tr>
              ))}
            </tbody>
          </ResearchTable>
        </div>
      </ResearchSection>
    </ResearchPanelShell>
  );
}

// ── MarketHero ────────────────────────────────────────────────────────────────
function MarketHero({ current, computedAt, loading, error, risk, onFusion }: {
  current: Current | null; computedAt: string | null; loading: boolean; error: boolean;
  risk: { label: string; tone: Tone }; onFusion?: () => void;
}) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const regime = current?.regime;
  const accent = regime ? RHEX[regime] : RM.sub;
  const statusText = loading ? tx("common.loading") : current && !error ? tx("rp.aanal.ready") : tx("common.no_data");
  const statusTone: Tone = loading ? "amber" : error || !current ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>{tx("rw.a.regime")}</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Market Regime Intelligence</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>{tx("rp.areg.subtitle")}</p>
        {current && (
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[34px] font-bold leading-none tracking-[-0.02em]" style={{ color: accent }}>{regime && RKEY[regime] ? tx(RKEY[regime]) : "—"}</span>
              <span className="text-[13px] font-semibold" style={{ color: accent }}>{regime && RJUDGE[regime] ? tx(RJUDGE[regime]) : "—"}</span>
            </div>
            <span className="h-6 w-px" style={{ background: RM.border }} />
            <span className="text-[12px]" style={{ color: RM.sub }}>{tx("db.riskLevel")} <b style={{ color: RM.ink }}>{tx(risk.label)}</b></span>
            
            <span className="text-[12px]" style={{ color: RM.faint }}>{tx("common.asOf.data")} <span className="tabular-nums" style={{ color: RM.sub }}>{fmtAsOf(computedAt) ?? current.date}</span></span>
          </div>
        )}
      </div>
      <div className="shrink-0"><ResearchButton onClick={onFusion} disabled={!onFusion}>{tx("rp.areg.toFusion")} →</ResearchButton></div>
    </div>
  );
}

// ── MarketInsight ─────────────────────────────────────────────────────────────
function MarketInsight({ current, risk }: { current: Current; risk: { label: string; tone: Tone } }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const judge = RJUDGE[current.regime] ? tx(RJUDGE[current.regime]) : "—";
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="md:col-span-2">
        <ResearchInsightCard title={tx("rp.areg.summary")} tone={RTONE[current.regime]}>
          {tx("rp.areg.summaryBody").replace("{regime}", rlabel(current.regime, tx)).replace("{judge}", judge).replace("{b}", String(fx(current.breadth))).replace("{v}", String(fx(current.volatility))).replace("{risk}", tx(risk.label)).replace("{s}", String(fx(current.regimeScore, 2))).replace("{t}", String(fx(current.trendScore, 2)))}
        </ResearchInsightCard>
      </div>
      <ResearchInsightCard title={tx("rp.areg.noteTitle")} tone="neutral">
        {tx("rp.areg.noteBody")}
      </ResearchInsightCard>
    </div>
  );
}
