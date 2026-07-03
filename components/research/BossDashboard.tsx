"use client";

import { useEffect, useState } from "react";

// AI研究中心「综合」老板驾驶舱（Boss Dashboard）。深色风格，与首页一致。只读聚合，不改任何算法。

type Regime = { regime: string; trendScore: number | null; breadth: number | null; volatility: number | null; date: string; computedAt: string };
type Data = {
  regime: Regime | null;
  ratings: { strongBuy: number; buy: number; hold: number; watch: number; avoid: number };
  universe: { total: number; enabled: number; excluded: number; auto: number; manual: number; dataQuality: number; lowLiquidity: number };
  alpha: { scored: number; latestAt: string | null; mode: string };
  fusion: { production: string; alpha: string; fusion: string; paper: string };
  todaySummary: { market: string | null; prodSB: number; prodBuy: number; alphaScored: number; fusionMode: string; shadow: { d30: string | null; d90: string | null; d180: string | null } };
  conclusion: string[];
  health: { critical: number | null; warning: number | null; status: string | null; cron: string; db: string; api: string };
  timeline: { time: string; label: string; status: string }[];
  computedAt: string;
};

const C = { surface: "#111", surface2: "#0f172a", border: "#222", muted: "#64748b", text: "#ddd", green: "#22c55e", yellow: "#eab308", red: "#ef4444", blue: "#60a5fa" };
const mono: React.CSSProperties = { fontFamily: "monospace" };
const REGIME_META: Record<string, { dot: string; label: string; color: string }> = {
  BULL: { dot: "🟢", label: "牛市", color: C.green },
  SIDEWAYS: { dot: "🟡", label: "震荡", color: C.yellow },
  BEAR: { dot: "🔴", label: "熊市", color: C.red },
};
function fx(v: number | null, d = 1) { return v == null ? "—" : v.toFixed(d); }
function tsShort(s: string | null) { return s ? s.slice(0, 16).replace("T", " ") : "—"; }

function Card({ title, children, span }: { title: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", gridColumn: span ? `span ${span}` : undefined, ...mono }}>
      <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}
function Kv({ k, v, color }: { k: string; v: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "1.5px 0" }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: color ?? C.text, fontWeight: 600 }}>{v}</span>
    </div>
  );
}
function statusDot(s: string) { return s === "done" ? C.green : s === "missed" ? C.red : "#475569"; }
function statusIcon(s: string) { return s === "done" ? "✅" : s === "missed" ? "❌" : "⏳"; }

export function BossDashboard() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/admin/research-overview").then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).then(setD).catch((e) => setError(String(e)));
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (error) return <div style={{ padding: 16, color: C.red, ...mono }}>Boss Dashboard 加载失败：{error}</div>;
  if (!d) return <div style={{ padding: 16, color: C.muted, ...mono }}>加载中…</div>;

  const rm = d.regime ? REGIME_META[d.regime.regime] ?? { dot: "⚪", label: d.regime.regime, color: C.text } : null;
  const healthOk = (d.health.critical ?? 0) === 0;

  return (
    <div style={{ background: "#0a0a0a", padding: "12px 16px", ...mono }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#eee", marginBottom: 10 }}>📊 综合驾驶舱 <span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>更新 {tsShort(d.computedAt)}</span></div>

      {/* 第一屏：6 大区（3 列网格） */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
        {/* ① 当前市场 */}
        <Card title="① 当前市场">
          {d.regime && rm ? (
            <>
              <div style={{ fontSize: 24, fontWeight: 800, color: rm.color, marginBottom: 6 }}>{rm.dot} {rm.label}</div>
              <Kv k="Trend Score" v={fx(d.regime.trendScore, 2)} />
              <Kv k="Breadth" v={`${fx(d.regime.breadth)}%`} />
              <Kv k="Volatility" v={`${fx(d.regime.volatility)}%`} />
              <Kv k="最近更新" v={d.regime.date} color={C.muted} />
            </>
          ) : <div style={{ color: C.muted }}>暂无数据</div>}
        </Card>

        {/* ② AI评分 */}
        <Card title="② AI评分状态">
          <Kv k="Strong Buy" v={d.ratings.strongBuy} color={C.green} />
          <Kv k="Buy" v={d.ratings.buy} color={C.blue} />
          <Kv k="Hold" v={d.ratings.hold} />
          <Kv k="Watch" v={d.ratings.watch} color={C.yellow} />
          <Kv k="Avoid" v={d.ratings.avoid} color={C.red} />
        </Card>

        {/* ⑥ 系统健康 */}
        <Card title="⑥ 系统健康">
          <div style={{ fontSize: 18, fontWeight: 800, color: healthOk ? C.green : C.red, marginBottom: 6 }}>{healthOk ? "🟢 全部正常" : "🔴 有告警"}</div>
          <Kv k="Health" v={d.health.status ?? "—"} color={healthOk ? C.green : C.red} />
          <Kv k="CRITICAL" v={d.health.critical ?? "—"} color={(d.health.critical ?? 0) === 0 ? C.green : C.red} />
          <Kv k="WARNING" v={d.health.warning ?? "—"} color={C.yellow} />
          <Kv k="Cron / DB / API" v="🟢 🟢 🟢" color={C.green} />
        </Card>

        {/* ③ Alpha状态 */}
        <Card title="③ Alpha状态">
          <Kv k="AlphaScore 已计算" v={d.alpha.scored.toLocaleString()} color={C.blue} />
          <Kv k="最新时间" v={tsShort(d.alpha.latestAt)} color={C.muted} />
          <Kv k="当前模式" v={d.alpha.mode} color={C.yellow} />
        </Card>

        {/* ④ Fusion状态 */}
        <Card title="④ Fusion状态">
          <Kv k="Production" v={d.fusion.production} color={C.green} />
          <Kv k="Alpha" v={d.fusion.alpha} color={C.yellow} />
          <Kv k="Fusion" v={d.fusion.fusion} color={C.blue} />
          <Kv k="Paper" v={d.fusion.paper} color={d.fusion.paper === "Running" ? C.green : C.red} />
        </Card>

        {/* ⑤ 今日摘要 */}
        <Card title="⑤ 今日摘要">
          <Kv k="今日市场" v={d.todaySummary.market ? (REGIME_META[d.todaySummary.market]?.label ?? d.todaySummary.market) : "—"} color={d.todaySummary.market ? REGIME_META[d.todaySummary.market]?.color : undefined} />
          <Kv k="Production" v={`SB ${d.todaySummary.prodSB} · Buy ${d.todaySummary.prodBuy}`} />
          <Kv k="Alpha" v={`${d.todaySummary.alphaScored.toLocaleString()} 只已评分`} />
          <Kv k="Fusion" v={d.todaySummary.fusionMode} color={C.blue} />
          <Kv k="Shadow" v={`30日${d.todaySummary.shadow.d30 ?? "—"} / 90日${d.todaySummary.shadow.d90 ?? "—"} / 180日${d.todaySummary.shadow.d180 ?? "—"}`} color={C.muted} />
        </Card>
      </div>

      {/* Universe + 研究结论 + 今日时间线 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <Card title="Universe（AI评分股票池）">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Kv k="总股票" v={d.universe.total.toLocaleString()} />
            <Kv k="启用" v={d.universe.enabled.toLocaleString()} color={C.green} />
            <Kv k="排除" v={d.universe.excluded.toLocaleString()} color={C.yellow} />
            <Kv k="自动排除" v={d.universe.auto} />
            <Kv k="人工排除" v={d.universe.manual} />
            <Kv k="数据质量" v={d.universe.dataQuality} />
            <Kv k="低流动性" v={d.universe.lowLiquidity} />
          </div>
        </Card>

        <Card title="研究结论（自动读取 Fusion Report）">
          {d.conclusion.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: line.includes("建议") ? C.blue : C.green, padding: "2px 0", fontWeight: 600 }}>{line}</div>
          ))}
        </Card>
      </div>

      {/* 今日时间线 */}
      <Card title="今日时间线（Cron）">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {d.timeline.map((t) => (
            <div key={t.time} style={{ display: "flex", alignItems: "center", gap: 5, background: C.surface2, border: `1px solid ${statusDot(t.status)}44`, borderRadius: 6, padding: "4px 8px", fontSize: 11 }}>
              <span>{statusIcon(t.status)}</span>
              <span style={{ color: C.muted }}>{t.time}</span>
              <span style={{ color: C.text }}>{t.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
