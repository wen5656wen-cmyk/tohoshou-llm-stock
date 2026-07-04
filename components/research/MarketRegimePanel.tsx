"use client";

import { useEffect, useMemo, useState } from "react";
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

const RZH: Record<string, string> = { BULL: "牛市", SIDEWAYS: "震荡市", BEAR: "熊市" };
const RJUDGE: Record<string, string> = { BULL: "偏多", SIDEWAYS: "震荡", BEAR: "偏空" };
const RHEX: Record<string, string> = { BULL: RM.green, SIDEWAYS: RM.amber, BEAR: RM.red };
const RTONE: Record<string, Tone> = { BULL: "green", SIDEWAYS: "amber", BEAR: "red" };
function rzh(s: string) { return RZH[s] ?? s; }
function fx(v: number | null, d = 1) { return v == null ? "—" : v.toFixed(d); }

// 风险等级 = 波动率阈值映射（沿用 AI指挥中心既有口径 <20 低 / ≤25 中 / >25 高），非新算指标
function riskFromVol(v: number | null): { label: string; tone: Tone } {
  if (v == null) return { label: "暂无数据", tone: "neutral" };
  if (v < 20) return { label: "低风险", tone: "green" };
  if (v <= 25) return { label: "中风险", tone: "amber" };
  return { label: "高风险", tone: "red" };
}

export function MarketRegimePanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
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
        <ResearchErrorState message={error} hint={<>请运行 <code style={{ color: RM.sub }}>npm run fetch-global-market</code> 后重算市场状态。</>}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>} />
      </ResearchPanelShell>
    );
  }
  if (loading) return <ResearchPanelShell>{hero}<ResearchLoadingState label="正在加载市场状态…" /></ResearchPanelShell>;
  if (!cur) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchEmptyState title="暂无市场状态数据" desc="市场状态尚未生成或 API 暂无返回。"
          actions={<><ResearchButton variant="primary" onClick={goFusion} disabled={!goFusion}>查看 AI融合策略研究</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton></>} />
      </ResearchPanelShell>
    );
  }

  const t0 = data!.timeline[0];

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI —— 全部为 /api/regime 已有字段；无字段处显示暂无数据 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label="市场状态" value={<span style={{ color: RHEX[cur.regime] }}>{rzh(cur.regime)}</span>} sub={`AI 判断 · ${RJUDGE[cur.regime] ?? "—"}`} />
        <ResearchKpiCard label="风险等级" value={<span className="text-[18px]">{risk.label}</span>} sub="由波动率映射" tone={risk.tone} />
        <ResearchKpiCard label="状态评分" value={fx(cur.regimeScore, 2)} sub="regimeScore" tone={RTONE[cur.regime]} />
        <ResearchKpiCard label="趋势" value={fx(cur.trendScore, 2)} sub="trendScore" />
        <ResearchKpiCard label="市场宽度" value={`${fx(cur.breadth)}%`} sub="Breadth · 上涨占比" />
        <ResearchKpiCard label="波动率" value={`${fx(cur.volatility)}%`} sub="Volatility" />
      </ResearchKpiGrid>

      {/* Market Insight —— 今日市场摘要（真实字段的确定性展示层复述，非模型编造） */}
      <MarketInsight current={cur} risk={risk} />

      {/* 市场状态分布 + 色带 */}
      <ResearchSection title="市场状态分布" desc={`近 ${totalDays} 个交易日 · 牛/震荡/熊 天数占比`} right={<ResearchButton onClick={exportCsv} disabled={!data?.timeline.length}>导出CSV</ResearchButton>}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(["BULL", "SIDEWAYS", "BEAR"] as const).map((r) => (
            <div key={r} className="rounded-xl px-4 py-3" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
              <div className="text-[11px]" style={{ color: RM.muted }}>{rzh(r)}</div>
              <div className="mt-1 text-[22px] font-semibold tabular-nums" style={{ color: RHEX[r] }}>{dist[r]}<span className="text-[12px] ml-1" style={{ color: RM.faint }}>天</span></div>
              <div className="text-[11px] tabular-nums" style={{ color: RM.faint }}>{((dist[r] / totalDays) * 100).toFixed(0)}% 占比</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] mb-1.5" style={{ color: RM.faint }}>状态色带（旧 → 新）</div>
        <div className="flex gap-[1px] h-7 rounded-lg overflow-hidden" style={{ border: `1px solid ${RM.border}` }}>
          {[...data!.timeline].reverse().map((r) => (
            <div key={r.date} title={`${r.date} · ${rzh(r.regime)} · 评分 ${fx(r.regimeScore, 2)}`} style={{ background: RHEX[r.regime], flex: 1, opacity: 0.9 }} />
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px]" style={{ color: RM.sub }}>
          {(["BULL", "SIDEWAYS", "BEAR"] as const).map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: RHEX[r] }} />{rzh(r)}</span>
          ))}
        </div>
      </ResearchSection>

      {/* Market Timeline —— 状态切换点 */}
      <ResearchSection title="市场状态时间轴" desc="按时间序列检测到的状态切换点（最近在前）">
        {transitions.length === 0 ? (
          <ResearchEmptyState title="近期无状态切换" desc={`近 ${totalDays} 个交易日市场状态保持稳定，无牛/震荡/熊切换。`} />
        ) : (
          <div className="space-y-1.5">
            {transitions.map((tr) => (
              <div key={tr.date} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                <span className="text-[12px] font-mono shrink-0 w-24" style={{ color: RM.sub }}>{tr.date}</span>
                <span className="text-[12px] font-semibold" style={{ color: RHEX[tr.from] }}>{rzh(tr.from)}</span>
                <span style={{ color: RM.faint }}>→</span>
                <span className="text-[12px] font-semibold" style={{ color: RHEX[tr.to] }}>{rzh(tr.to)}</span>
                <ResearchStatusBadge tone={RTONE[tr.to]}>切换为{rzh(tr.to)}</ResearchStatusBadge>
              </div>
            ))}
          </div>
        )}
      </ResearchSection>

      {/* 市场指标 —— TOPIX + 均线（/api/regime 已有；日经/VIX/USDJPY 不在本 API，不伪造） */}
      <ResearchSection title="市场指标" desc={`TOPIX 收盘与均线 · ${t0?.date ?? cur.date}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ResearchKpiCard label="TOPIX 收盘" value={t0?.topixClose == null ? "暂无数据" : t0.topixClose.toFixed(1)} sub="topixClose" tone="blue" />
          <ResearchKpiCard label="MA20" value={t0?.ma20 == null ? "暂无数据" : t0.ma20.toFixed(1)} sub="20 日均线" />
          <ResearchKpiCard label="MA60" value={t0?.ma60 == null ? "暂无数据" : t0.ma60.toFixed(1)} sub="60 日均线" />
          <ResearchKpiCard label="MA120" value={t0?.ma120 == null ? "暂无数据" : t0.ma120.toFixed(1)} sub="120 日均线" />
        </div>
        <div className="mt-3 text-[12px]" style={{ color: RM.faint }}>日经 225 / VIX / USDJPY 不在本 API 范围 · 见 <button onClick={goOverview} disabled={!goOverview} className="font-semibold disabled:opacity-40" style={{ color: RM.blue }}>AI 指挥中心</button></div>
      </ResearchSection>

      {/* 完整状态历史表 */}
      <ResearchSection title="状态历史" desc={`每日市场状态明细 · 共 ${data!.timeline.length} 行`}>
        <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
          <ResearchTable minWidth={720}>
            <thead>
              <tr>
                <RTh>日期</RTh><RTh>状态</RTh><RTh align="right">评分</RTh><RTh align="right">趋势</RTh>
                <RTh align="right">市场宽度</RTh><RTh align="right">波动率</RTh><RTh align="right">TOPIX</RTh>
              </tr>
            </thead>
            <tbody>
              {data!.timeline.map((r) => (
                <tr key={r.date} className={rowHoverClass}>
                  <RTd mono color={RM.sub}>{r.date}</RTd>
                  <RTd><ResearchStatusBadge tone={RTONE[r.regime]}>{rzh(r.regime)}</ResearchStatusBadge></RTd>
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
  const regime = current?.regime;
  const accent = regime ? RHEX[regime] : RM.sub;
  const statusText = loading ? "运行中" : error ? "暂无数据" : current ? "已就绪" : "暂无数据";
  const statusTone: Tone = loading ? "amber" : error || !current ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>市场状态</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Market Regime Intelligence</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>市场环境分析 · 风险监控 · AI市场判断</p>
        {current && (
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[34px] font-bold leading-none tracking-[-0.02em]" style={{ color: accent }}>{regime ? RZH[regime] : "—"}</span>
              <span className="text-[13px] font-semibold" style={{ color: accent }}>AI 判断 · {regime ? RJUDGE[regime] : "—"}</span>
            </div>
            <span className="h-6 w-px" style={{ background: RM.border }} />
            <span className="text-[12px]" style={{ color: RM.sub }}>风险 <b style={{ color: RM.ink }}>{risk.label}</b></span>
            <span className="text-[12px]" style={{ color: RM.sub }}>置信度 <b style={{ color: RM.faint }}>暂无数据</b></span>
            <span className="text-[12px]" style={{ color: RM.faint }}>最近更新 <span className="tabular-nums" style={{ color: RM.sub }}>{computedAt ? new Date(computedAt).toLocaleString("zh-CN") : current.date}</span></span>
          </div>
        )}
      </div>
      <div className="shrink-0"><ResearchButton onClick={onFusion} disabled={!onFusion}>查看 AI融合策略研究 →</ResearchButton></div>
    </div>
  );
}

// ── MarketInsight ─────────────────────────────────────────────────────────────
function MarketInsight({ current, risk }: { current: Current; risk: { label: string; tone: Tone } }) {
  const judge = RJUDGE[current.regime] ?? "—";
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="md:col-span-2">
        <ResearchInsightCard title="今日市场摘要" tone={RTONE[current.regime]}>
          AI 市场判断：当前处于<span style={{ color: RHEX[current.regime], fontWeight: 600 }}>{rzh(current.regime)}</span>，倾向<b style={{ color: RM.ink }}>{judge}</b>。
          市场宽度 <b style={{ color: RM.ink }}>{fx(current.breadth)}%</b>，波动率 <b style={{ color: RM.ink }}>{fx(current.volatility)}%</b>（{risk.label}），
          状态评分 <b style={{ color: RM.ink }}>{fx(current.regimeScore, 2)}</b>、趋势 <b style={{ color: RM.ink }}>{fx(current.trendScore, 2)}</b>。
        </ResearchInsightCard>
      </div>
      <ResearchInsightCard title="研究说明" tone="neutral">
        市场状态为只读研究判断，<b style={{ color: RM.ink }}>不直接影响正式 AI 推荐</b>。风险等级由波动率按既有阈值映射。
      </ResearchInsightCard>
    </div>
  );
}
