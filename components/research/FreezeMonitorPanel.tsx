"use client";

import { useEffect, useState } from "react";
import { PanelHeader } from "./PanelHeader";

// V3 Freeze Monitor（P3-T4）：冻结验证期监控。只读，不影响生产。

type Freeze = {
  freeze: { version: string; commit: string; startDate: string; endDate: string; targetReadiness: number };
  day: number; totalDays: number; over: boolean; shadowDays: number;
  readiness: number; grade: string; gateReady: boolean;
  regime: string | null; weights: Record<string, number> | null; latestCalibDate: string | null;
  replay: { asOfRange: string[]; days: number; verdict: { v3Win: number; v3Lose: number; cells: number; v3Better: boolean }; forward: { h: number; v2: number | null; v3: number | null; spread: number | null }[] } | null;
  history: { date: string; regime: string; readiness: number; grade: string; sb: number | null }[];
};
const DIM_ZH: Record<string, string> = { technical: "技术面", fundamental: "基本面", alpha: "Alpha", news: "新闻", flow: "资金" };
function gradeColor(g: string) { return g === "A" ? "#16a34a" : g === "B" ? "#2563eb" : g === "C" ? "#d97706" : "#dc2626"; }
function pc(v: number | null | undefined) { return v == null ? "#94a3b8" : v > 0 ? "#16a34a" : v < 0 ? "#dc2626" : "#334155"; }
const fx = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

export function FreezeMonitorPanel() {
  const [d, setD] = useState<Freeze | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/scoring-v3/freeze").then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).then(setD).catch((e) => setErr(String(e))); }, []);

  return (
    <div className="p-6 max-w-[1400px]">
      <PanelHeader title="V3 Freeze Monitor" desc="V3 Shadow 冻结验证期：停止一切算法修改，仅自动收集真实前向证据，到期做最终上线评审。" phase="P3-T4"
        dataDate={d?.latestCalibDate} computedAt={d?.freeze ? `${d.freeze.startDate} → ${d.freeze.endDate}` : null} statusText="冻结中（SCORING_ENGINE=v2）" error={err} loading={!d && !err} />

      {d ? (
        <>
          {/* Freeze 进度 + 状态 */}
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="rounded-xl border-2 p-4" style={{ borderColor: "#2563eb", background: "#2563eb0d" }}>
              <div className="text-[11px] text-slate-400 font-medium">Freeze 版本</div>
              <div className="text-lg font-bold text-slate-900">{d.freeze.version}</div>
              <div className="text-[11px] text-slate-500 font-mono">commit {d.freeze.commit}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium">冻结进度</div>
              <div className="text-2xl font-black text-slate-900 tabular-nums">第 {d.day} / {d.totalDays} 天</div>
              <div className="h-2 bg-slate-100 rounded mt-2 overflow-hidden"><div className="h-full bg-blue-500 rounded" style={{ width: `${Math.min(100, (d.day / d.totalDays) * 100)}%` }} /></div>
              <div className="text-[11px] text-slate-500 mt-1">{d.over ? "✅ 已到期，可做最终评审" : `${d.freeze.endDate} 最终评审`}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium">Shadow 累计</div>
              <div className="text-2xl font-black text-slate-900 tabular-nums">{d.shadowDays} <span className="text-sm">日</span></div>
              <div className="text-[11px] text-slate-500 mt-1">每日 10:15 自动累计</div>
            </div>
            <div className="rounded-xl border-2 p-4" style={{ borderColor: gradeColor(d.grade), background: `${gradeColor(d.grade)}0d` }}>
              <div className="text-[11px] text-slate-400 font-medium">Production Readiness</div>
              <div className="text-2xl font-black tabular-nums" style={{ color: gradeColor(d.grade) }}>{d.readiness.toFixed(1)} <span className="text-sm">/ {d.freeze.targetReadiness}</span></div>
              <div className="text-sm font-bold px-2 py-0.5 rounded inline-block mt-1" style={{ background: d.gateReady ? "#dcfce7" : "#fef3c7", color: d.gateReady ? "#16a34a" : "#d97706" }}>{d.gateReady ? "✅ 达标" : `⛔ 未达 (Grade ${d.grade})`}</div>
            </div>
          </div>

          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {/* 动态权重 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">冻结权重 · {d.regime === "BULL" ? "🟢牛市" : d.regime === "BEAR" ? "🔴熊市" : "🟡震荡市"}（冻结期内不变）</div>
              <div className="flex flex-wrap gap-2">
                {d.weights ? (["technical", "fundamental", "alpha", "news", "flow"] as const).map((k) => (
                  <div key={k} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm"><span className="text-slate-500">{DIM_ZH[k]} </span><b className="tabular-nums">{((d.weights![k] ?? 0) * 100).toFixed(1)}%</b></div>
                )) : <span className="text-slate-400 text-sm">—</span>}
              </div>
            </div>

            {/* 最新前向收益 V2 vs V3 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 font-medium mb-2">最新前向收益（Replay Top20）{d.replay ? `· ${d.replay.days}日 · V3胜 ${d.replay.verdict.v3Win}/${d.replay.verdict.cells}` : ""}</div>
              {d.replay ? (
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-400 border-b border-slate-100"><th className="text-left py-1">横期</th><th className="text-right py-1">V2</th><th className="text-right py-1">V3</th><th className="text-right py-1">V3−V2</th></tr></thead>
                  <tbody>
                    {d.replay.forward.map((f) => (
                      <tr key={f.h} className="border-b border-slate-50">
                        <td className="py-1 text-slate-600">T+{f.h}</td>
                        <td className="py-1 text-right tabular-nums" style={{ color: pc(f.v2) }}>{fx(f.v2)}%</td>
                        <td className="py-1 text-right tabular-nums font-semibold" style={{ color: pc(f.v3) }}>{fx(f.v3)}%</td>
                        <td className="py-1 text-right tabular-nums font-bold" style={{ color: pc(f.spread) }}>{f.spread != null && f.spread >= 0 ? "+" : ""}{fx(f.spread)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <span className="text-slate-400 text-sm">等待每日 Replay 累计…</span>}
            </div>
          </div>

          {/* 冻结禁改声明 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-amber-800">
            🔒 冻结期内禁止修改：Dynamic Weight / Calibration / Threshold / Risk / Confidence / Quality / Explain / ScoreV3 / Alpha / Market Regime / Feature Flag / Backtest / Shadow Logic。Cron 全部继续自动运行，SCORING_ENGINE=v2 保持，切换需人工确认。
          </div>

          {/* 每日 Readiness 历史 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-[11px] text-slate-400 font-medium mb-2">每日累计（Readiness / STRONG_BUY）</div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 border-b border-slate-100"><th className="text-left py-1">日期</th><th className="text-left py-1">市场</th><th className="text-right py-1">Readiness</th><th className="text-center py-1">Grade</th><th className="text-right py-1">STRONG_BUY</th></tr></thead>
                <tbody>
                  {d.history.map((h) => (
                    <tr key={h.date} className="border-b border-slate-50">
                      <td className="py-1 font-mono text-slate-500">{h.date}</td>
                      <td className="py-1 text-slate-500">{h.regime === "BULL" ? "牛" : h.regime === "BEAR" ? "熊" : "震荡"}</td>
                      <td className="py-1 text-right tabular-nums font-medium">{h.readiness.toFixed(1)}</td>
                      <td className="py-1 text-center font-bold" style={{ color: gradeColor(h.grade) }}>{h.grade}</td>
                      <td className="py-1 text-right tabular-nums text-slate-600">{h.sb ?? "—"}</td>
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
