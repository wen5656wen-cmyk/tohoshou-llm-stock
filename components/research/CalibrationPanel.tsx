"use client";

import { useEffect, useState } from "react";
import { PanelHeader } from "./PanelHeader";

// V3 Calibration（P3-T3）：动态阈值 / Confidence / Data Quality / SB统计 / Readiness Gate / 历史。Shadow-only。

type Cal = {
  date: string | null; regime: string | null; computedAt: string | null;
  thresholds: { cutoffs: Record<string, number>; targets: Record<string, number> } | null;
  ratingDist: Record<string, number>;
  confidenceStats: { mean: number; p25: number; median: number; p75: number; buckets: Record<string, number> };
  quality: { coverage: Record<string, number>; overall: number };
  sbSector: Record<string, number>; sbMarketCap: Record<string, number>;
  sbStats: { count: number; frac: number; avgConfidence: number; lowLiquidity: number };
  readiness: number; readinessGrade: string;
  history: { date: string; regime: string; readiness: number; grade: string; sbStats: any; ratingDist: Record<string, number> }[];
};

const RATING_ZH: Record<string, string> = { STRONG_BUY: "强烈买入", BUY: "买入", HOLD: "持有", WATCH: "观察", AVOID: "回避" };
const DIM_ZH: Record<string, string> = { technical: "技术面", fundamental: "基本面", alpha: "Alpha", news: "新闻", flow: "资金" };
const GRADE_DESC: Record<string, string> = { A: "可直接替换", B: "建议继续 Shadow 一周", C: "需要调整", D: "禁止上线" };
function gradeColor(g: string) { return g === "A" ? "#16a34a" : g === "B" ? "#2563eb" : g === "C" ? "#d97706" : "#dc2626"; }

export function CalibrationPanel() {
  const [d, setD] = useState<Cal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/scoring-v3/calibration").then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).then(setD).catch((e) => setErr(String(e))); }, []);

  function exportCsv() {
    if (!d) return;
    const lines = ["date,regime,readiness,grade,STRONG_BUY,BUY,HOLD,WATCH,AVOID"];
    for (const h of d.history) lines.push([h.date, h.regime, h.readiness, h.grade, h.ratingDist?.STRONG_BUY ?? 0, h.ratingDist?.BUY ?? 0, h.ratingDist?.HOLD ?? 0, h.ratingDist?.WATCH ?? 0, h.ratingDist?.AVOID ?? 0].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `v3-calibration-${d.date ?? "latest"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const gate = d && d.readiness >= 90;

  return (
    <div className="p-6 max-w-[1400px]">
      <PanelHeader title="V3 Calibration" desc="评分标定：动态阈值 + Confidence + Data Quality + Production Readiness Gate（Shadow，不影响正式AI推荐）。" phase="P3-T3"
        dataDate={d?.date} computedAt={d?.computedAt} statusText="影子标定（不参与正式AI推荐）" error={err} loading={!d && !err} />

      {d ? (
        <>
          {/* Readiness Gate */}
          <div className="rounded-xl border-2 p-4 mb-4" style={{ borderColor: gradeColor(d.readinessGrade), background: `${gradeColor(d.readinessGrade)}0d` }}>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Production Readiness</div>
                <div className="text-3xl font-black tabular-nums" style={{ color: gradeColor(d.readinessGrade) }}>{d.readiness.toFixed(1)}<span className="text-lg"> / 100</span></div>
              </div>
              <div className="px-3 py-1.5 rounded-lg text-white font-bold text-lg" style={{ background: gradeColor(d.readinessGrade) }}>Grade {d.readinessGrade}</div>
              <div className="text-sm font-medium" style={{ color: gradeColor(d.readinessGrade) }}>{GRADE_DESC[d.readinessGrade]}</div>
              <div className="ml-auto text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: gate ? "#dcfce7" : "#fef3c7", color: gate ? "#16a34a" : "#d97706" }}>
                {gate ? "✅ 达到 90+ 可评估上线" : "⛔ 未达 90，暂缓上线"}
              </div>
            </div>
          </div>

          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {/* 今日动态阈值 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">今日动态阈值（scoreV3 切点 · 目标分位）· {d.regime === "BULL" ? "🟢牛市" : d.regime === "BEAR" ? "🔴熊市" : "🟡震荡市"}</div>
              {(["sb", "buy", "hold", "watch"] as const).map((k) => (
                <div key={k} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-500">{{ sb: "强烈买入", buy: "买入", hold: "持有", watch: "观察" }[k]}</span>
                  <span className="tabular-nums"><b className="text-slate-900">≥{d.thresholds?.cutoffs[k]?.toFixed(1) ?? "—"}</b> <span className="text-slate-400 text-xs">前{((d.thresholds?.targets[k] ?? 0) * 100).toFixed(1)}%</span></span>
                </div>
              ))}
            </div>

            {/* 评级分布 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">今日评级分布（标定后）</div>
              {["STRONG_BUY", "BUY", "HOLD", "WATCH", "AVOID"].map((k) => (
                <div key={k} className="flex justify-between text-sm py-0.5"><span className="text-slate-500">{RATING_ZH[k]}</span><span className="tabular-nums font-medium text-slate-800">{d.ratingDist[k] ?? 0}</span></div>
              ))}
            </div>

            {/* Confidence 分布 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">Confidence 分布</div>
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">均值</span><span className="tabular-nums font-bold text-slate-900">{d.confidenceStats.mean.toFixed(1)}%</span></div>
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">P25 / 中位 / P75</span><span className="tabular-nums text-slate-700">{d.confidenceStats.p25}/{d.confidenceStats.median}/{d.confidenceStats.p75}</span></div>
              <div className="flex gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">高 {d.confidenceStats.buckets["高"] ?? 0}</span>
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">中 {d.confidenceStats.buckets["中"] ?? 0}</span>
                <span className="px-2 py-0.5 rounded bg-red-50 text-red-700">低 {d.confidenceStats.buckets["低"] ?? 0}</span>
              </div>
            </div>

            {/* Data Quality */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">Data Quality（维度覆盖率 · 综合 {d.quality.overall}%）</div>
              {(["technical", "fundamental", "alpha", "news", "flow"] as const).map((k) => (
                <div key={k} className="flex items-center gap-2 text-sm py-0.5">
                  <span className="text-slate-500 w-16">{DIM_ZH[k]}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${d.quality.coverage[k] ?? 0}%`, background: (d.quality.coverage[k] ?? 0) >= 60 ? "#16a34a" : (d.quality.coverage[k] ?? 0) >= 20 ? "#d97706" : "#dc2626" }} /></div>
                  <span className="tabular-nums text-slate-700 w-12 text-right">{(d.quality.coverage[k] ?? 0).toFixed(0)}%</span>
                </div>
              ))}
            </div>

            {/* STRONG_BUY 统计 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">STRONG_BUY 统计</div>
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">数量 / 占比</span><span className="tabular-nums font-bold text-slate-900">{d.sbStats.count}（{d.sbStats.frac}%）</span></div>
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">平均 Confidence</span><span className="tabular-nums text-slate-700">{d.sbStats.avgConfidence}%</span></div>
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">低流动性（&lt;1億）</span><span className="tabular-nums" style={{ color: d.sbStats.lowLiquidity > 0 ? "#d97706" : "#16a34a" }}>{d.sbStats.lowLiquidity}</span></div>
            </div>

            {/* SB 市值分布 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">STRONG_BUY 市值分布</div>
              {Object.entries(d.sbMarketCap).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm py-0.5"><span className="text-slate-500">{k}</span><span className="tabular-nums text-slate-700">{v}</span></div>
              ))}
            </div>
          </div>

          {/* 历史 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center mb-2">
              <div className="text-[11px] text-slate-400 font-medium">历史变化（Readiness / SB 数量）</div>
              <button onClick={exportCsv} className="ml-auto text-xs px-3 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800">导出CSV</button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 border-b border-slate-100"><th className="text-left py-1">日期</th><th className="text-left py-1">市场</th><th className="text-right py-1">Readiness</th><th className="text-center py-1">Grade</th><th className="text-right py-1">SB</th></tr></thead>
                <tbody>
                  {d.history.map((h) => (
                    <tr key={h.date} className="border-b border-slate-50">
                      <td className="py-1 font-mono text-slate-500">{h.date}</td>
                      <td className="py-1 text-slate-500">{h.regime === "BULL" ? "牛" : h.regime === "BEAR" ? "熊" : "震荡"}</td>
                      <td className="py-1 text-right tabular-nums font-medium">{h.readiness.toFixed(1)}</td>
                      <td className="py-1 text-center font-bold" style={{ color: gradeColor(h.grade) }}>{h.grade}</td>
                      <td className="py-1 text-right tabular-nums text-slate-600">{h.ratingDist?.STRONG_BUY ?? h.sbStats?.count ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
