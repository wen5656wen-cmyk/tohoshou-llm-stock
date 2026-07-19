"use client";

// ── P18-M1-H1/H2 · Mission Health Guard + Audit（只读运维页，硬编码中文）─────────
// 顶部：Mission Health Guard（15 检查，CRITICAL 明确高亮）。下方：Audit Timeline，
// 点任一笔 Trade 完整回放 Signal→Decision→Explain→Execution→Position→NAV。只读，绝不改交易。
import { useEffect, useState } from "react";

type Check = { n: number; key: string; label: string; level: "PASS" | "WARNING" | "CRITICAL" | "INFO"; value: string; detail?: string };
type Health = { status: "PASS" | "WARNING" | "CRITICAL"; critical: number; warning: number; checks: Check[] } | null;
type Replay = {
  tradeId: string; executedAt: string; missionType: string; periodLabel: string; symbol: string; name: string; action: string; qty: number;
  signalTime: string | null; marketPriceAt: string | null; priceSource: string | null; executionPrice: number | null; suggestedLow: number | null; suggestedHigh: number | null;
  aiScore: number | null; industryHeat: number | null; newsImpact: number | null; riskLevel: string | null; recommendation: string | null; rulesTriggered: string[]; strategyVersion: string | null; explainWhy: string | null;
  positionBefore: { qty: number; avgCost: number } | null; positionAfter: { qty: number; avgCost: number } | null; cashBefore: number | null; cashAfter: number | null; realizedPnl: number | null; returnPct: number | null; missionReturn: number | null; alpha: number | null;
};

const LEVEL_COLOR: Record<string, string> = { PASS: "#16A34A", WARNING: "#F59E0B", CRITICAL: "#EF4444", INFO: "#9CA3AF" };
const yen = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString("en-US")}`);
const clock = (iso: string | null | undefined) => (!iso ? "—" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso)) + " JST");

export default function MissionAuditPage() {
  const [health, setHealth] = useState<Health>(null);
  const [timeline, setTimeline] = useState<Replay[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("llmstock_admin_token") : null;
    fetch("/api/admin/mission-audit", token ? { headers: { "x-admin-token": token } } : undefined)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); setHealth(j.health ?? null); setTimeline(j.timeline ?? []); setLoading(false); })
      .catch((e) => { setErr(String(e)); setLoading(false); });
  }, []);

  if (loading) return <div className="max-w-[1200px] mx-auto p-6 text-sm text-neutral-500">加载中…</div>;

  return (
    <div className="max-w-[1200px] mx-auto p-4 sm:p-6 flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">🩺 Mission Health &amp; Audit</h1>
        <p className="text-xs text-neutral-500 mt-1">AI Mission Lab 独立健康检查 + 交易可审计回放（只读，不修改任何交易）</p>
      </div>
      {err ? <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: "#B91C1C" }}>错误：{err}</div> : null}

      {/* ── Health Guard ── */}
      {health ? (
        <section className="rounded-xl border" style={{ borderColor: "#E8EAED", background: "#fff" }}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: "#EEF0F4" }}>
            <span className="font-medium text-sm">Mission Health Guard</span>
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ color: LEVEL_COLOR[health.status], background: `${LEVEL_COLOR[health.status]}14` }}>
              {health.status}{health.critical ? ` · CRITICAL ${health.critical}` : ""}{health.warning ? ` · WARN ${health.warning}` : ""}
            </span>
          </div>
          {health.status === "CRITICAL" ? (
            <div className="px-5 py-2 text-sm font-medium" style={{ background: "#FEF2F2", color: "#B91C1C" }}>⚠ 存在 CRITICAL 项，请立即排查（下方红色）。</div>
          ) : null}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: "#EEF0F4" }}>
            {health.checks.map((c) => (
              <div key={c.key} className="px-4 py-2.5 flex items-start gap-2" style={{ background: "#fff" }}>
                <span className="mt-1.5 shrink-0" style={{ width: 8, height: 8, borderRadius: 8, background: LEVEL_COLOR[c.level] }} />
                <div className="min-w-0">
                  <div className="text-[13px]"><span className="text-neutral-400">{c.n}.</span> {c.label}</div>
                  <div className="text-[11px]" style={{ color: LEVEL_COLOR[c.level] }}>{c.level} · {c.value}</div>
                  {c.detail ? <div className="text-[11px] text-neutral-400 mt-0.5">{c.detail}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Audit Timeline ── */}
      <section className="rounded-xl border" style={{ borderColor: "#E8EAED", background: "#fff" }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "#EEF0F4" }}>
          <span className="font-medium text-sm">Audit Timeline · 交易回放</span>
          <span className="text-xs text-neutral-400">{timeline.length} 笔</span>
        </div>
        {timeline.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-neutral-400">暂无成交记录。首个交易日 2026-07-21 起产生可审计交易。</div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#EEF0F4" }}>
            {timeline.map((t) => (
              <div key={t.tradeId}>
                <button className="w-full flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-neutral-50 text-left" onClick={() => setOpen(open === t.tradeId ? null : t.tradeId)}>
                  <span className="text-[11px] text-neutral-400 w-32 shrink-0 tabular-nums">{clock(t.executedAt)}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "#F4F5F7" }}>{t.missionType}</span>
                  <span className="font-medium px-1.5 py-0.5 rounded text-white text-[11px]" style={{ background: t.action === "BUY" || t.action === "ADD" ? "#16A34A" : t.action === "SELL" || t.action === "SL" ? "#EF4444" : "#6B7280" }}>{t.action}</span>
                  <span>{t.name}<span className="text-neutral-400 ml-1">{t.symbol}</span></span>
                  <span className="text-neutral-500">×{t.qty.toLocaleString()} @ {yen(t.executionPrice)}</span>
                  {t.realizedPnl != null ? <span className="ml-auto tabular-nums" style={{ color: t.realizedPnl >= 0 ? "#16A34A" : "#EF4444" }}>{yen(t.realizedPnl)}</span> : <span className="ml-auto text-neutral-300">{open === t.tradeId ? "▲" : "▼"}</span>}
                </button>
                {open === t.tradeId ? <Replay t={t} /> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex gap-2 py-1"><span className="text-[11px] text-neutral-400 w-28 shrink-0">{k}</span><span className="text-[12px]">{v ?? "—"}</span></div>;
}
function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#fff", border: "1px solid #EEF0F4" }}>
      <div className="text-[11px] font-semibold text-neutral-500 mb-1">{title}</div>
      {children}
    </div>
  );
}
function Replay({ t }: { t: Replay }) {
  return (
    <div className="px-5 py-3 grid md:grid-cols-2 lg:grid-cols-3 gap-3" style={{ background: "#F7F8FA" }}>
      <Step title="① SIGNAL">
        <Row k="信号时间" v={clock(t.signalTime)} />
        <Row k="AI Score" v={t.aiScore ?? "—"} />
        <Row k="评级" v={t.recommendation ?? "—"} />
        <Row k="行业热度" v={t.industryHeat ?? "—"} />
        <Row k="新闻影响" v={t.newsImpact ?? "—"} />
        <Row k="风险" v={t.riskLevel ?? "—"} />
      </Step>
      <Step title="② DECISION / RULES">
        <Row k="策略版本" v={t.strategyVersion ?? "—"} />
        <Row k="触发规则" v={t.rulesTriggered.length ? t.rulesTriggered.join("、") : "—"} />
      </Step>
      <Step title="③ EXPLAIN">
        <div className="text-[12px] text-neutral-600 leading-relaxed">{t.explainWhy ?? "—"}</div>
      </Step>
      <Step title="④ EXECUTION">
        <Row k="行情时间" v={clock(t.marketPriceAt)} />
        <Row k="行情来源" v={t.priceSource ?? "—"} />
        <Row k="成交价" v={yen(t.executionPrice)} />
        <Row k="建议区间" v={`${yen(t.suggestedLow)} ~ ${yen(t.suggestedHigh)}`} />
      </Step>
      <Step title="⑤ POSITION">
        <Row k="成交前" v={t.positionBefore ? `${t.positionBefore.qty.toLocaleString()} @ ${yen(t.positionBefore.avgCost)}` : "无"} />
        <Row k="成交后" v={t.positionAfter ? `${t.positionAfter.qty.toLocaleString()} @ ${yen(t.positionAfter.avgCost)}` : "已清仓"} />
        <Row k="现金前" v={yen(t.cashBefore)} />
        <Row k="现金后" v={yen(t.cashAfter)} />
        {t.realizedPnl != null ? <Row k="实现盈亏" v={`${yen(t.realizedPnl)} (${t.returnPct ?? "—"}%)`} /> : null}
      </Step>
      <Step title="⑥ NAV">
        <Row k="Mission 收益" v={t.missionReturn != null ? `${t.missionReturn}%` : "—"} />
        <Row k="Alpha vs TOPIX" v={t.alpha != null ? `${t.alpha}%` : "—"} />
        <Row k="⑦ Review" v={<span className="text-neutral-400">M2</span>} />
      </Step>
    </div>
  );
}
