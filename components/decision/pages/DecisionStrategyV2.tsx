"use client";

// ── 今日简报 Daily Briefing（P19-T2 · /decision-v2?tab=strategy）─────────────────
// 唯一问题：今天系统运行到哪里、接下来要做什么、今天需要关注什么。
//
// 数据 SSOT = GET /api/decision/briefing（+ 既有 /api/health/status 取系统健康，保持其独立 asOf）。
// 硬规则：
//   · 时间轴状态措辞一律「已产出 / 进行中 / 未产出 / 已跳过」，**禁止**「已执行」
//     （判据是当日数据是否产出，非 cron 日志）
//   · 每个模块显示各自 As Of，**不同口径不得混排到同一时间标签下**
//   · 未接入的数据源（财报预定 / 除权息）显式标注并说明所需来源，绝不推测
//   · 「今日关注机会」只读收盘决策 TOP10 的既有标记分组，不新增评分/推荐逻辑
//   · 系统全量任务视图归 /admin/mission-control，本页只做入口，不搬内容
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct } from "@/lib/decision/ds";
import StockDetailModal, { type ReportTarget } from "@/components/decision/StockDetailModal";

type NodeState = "PRODUCED" | "RUNNING" | "PENDING" | "SKIPPED";
type Node = { key: string; schedule: string; state: NodeState; producedAt: string | null; etaMinutes: number | null; detail: Record<string, number | string | null>; evidence: string };
type TdnetItem = { symbol: string; title: string; category: string; sentiment: string | null; publishedAt: string | null; importance: number; url: string; held: boolean };
type CalItem = { title: string; eventType: string; scheduledAt: string | null; companyKey: string | null };
type TpSl = { symbol: string; name: string; kind: "HIT_TP" | "HIT_SL" | "NEAR_TP" | "NEAR_SL"; price: number; target: number | null; stop: number | null; gapPct: number };
type OppCat = { key: string; count: number; top: { symbol: string; name: string; aiScore: number | null; riskLevel: string | null } | null; symbols: string[] };
type Payload = {
  asOf: string; jstDate: string; tradingDay: boolean; nonTradingReason: string | null; session: string; error?: string;
  timeline: { producedCount: number; totalCount: number; nextNodeKey: string | null; nodes: Node[]; note: string };
  status: {
    market: { regime: string | null; riskLevel: string | null; trendDegraded: boolean | null; asOf: string | null; marketDataAsOf: string | null };
    mission: { active: number; rows: { periodLabel: string; missionType: string; returnPct: number | null; targetPct: number; daysLeft: number; preparedToday: boolean; executedToday: boolean }[]; asOf: string | null };
    recommendation: { verdict: string | null; portfolioCount: number | null; isToday: boolean; asOf: string | null };
  };
  events: {
    tdnet: { available: boolean; windowHours: number; items: TdnetItem[]; asOf: string | null };
    research: { available: boolean; windowDays: number; items: CalItem[] };
    earnings: { available: boolean; reason: string; needKey: string };
    exDividend: { available: boolean; reason: string; needKey: string; exDivRows: number };
  };
  todo: {
    missionPending: { count: number; asOf: string | null };
    tpSlAlerts: { count: number; holdings: number; items: TpSl[]; asOf: string | null };
    riskAlerts: { count: number; items: { key: string; level: string }[]; asOf: string | null };
  };
  opportunities: { available: boolean; asOf: string | null; isToday: boolean; total: number; categories: OppCat[]; note: string };
};
type Health = { status: string; auditAt: string; criticalCount: number; warningCount: number } | null;

const STATE_TONE: Record<NodeState, Tone> = { PRODUCED: "green", RUNNING: "blue", PENDING: "neutral", SKIPPED: "neutral" };
const STATE_ICON: Record<NodeState, string> = { PRODUCED: "✓", RUNNING: "◉", PENDING: "○", SKIPPED: "⊘" };
const fmtJstTime = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) + " JST" : null);
const fmtEta = (min: number | null) => (min == null ? null : min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}m` : `${min}m`);

export default function DecisionStrategyV2() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const router = useRouter();
  const [d, setD] = useState<Payload | null>(null);
  const [health, setHealth] = useState<Health>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ReportTarget | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/decision/briefing", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (alive) { setD(j); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    // 系统健康取既有端点，保持其独立 asOf（不并入 briefing，避免口径混排）
    fetch("/api/health/status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && !j.error) setHealth(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("br.loading")} /></div>;
  if (!d || d.error) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-14 text-center text-[13px]" style={{ color: COLORS.textFaint }}>{t("br.empty")}</div>;

  const tl = d.timeline, s = d.status, ev = d.events, td = d.todo, op = d.opportunities;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      {/* 顶部：日期 + 交易日 + 时段 */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] px-3 py-2 rounded-lg" style={{ background: COLORS.tile, color: COLORS.textMuted }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: d.tradingDay ? COLORS.success : COLORS.textFaint }} />
        <b className="text-[12px]" style={{ color: COLORS.text }}>{t("br.title")} · {d.jstDate}</b>
        <AppBadge tone={d.tradingDay ? "green" : "neutral"}>{d.tradingDay ? t("br.tradingDay") : `${t("br.holiday")}${d.nonTradingReason ? ` · ${d.nonTradingReason}` : ""}`}</AppBadge>
        <span>·</span><span>{tx(`br.session.${d.session}`)}</span>
      </div>

      {/* ② 今日状态（四格，各自 As Of） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatusCard title={t("br.st.market")} asOf={s.market.asOf} asOfLabel={t("br.asOf.close")}
          main={s.market.regime ? tx(`dc.regime.${s.market.regime}`) : "—"}
          tone={s.market.regime === "BULL" ? "green" : s.market.regime === "BEAR" ? "red" : "neutral"}
          rows={[{ k: t("db.riskLevel"), v: s.market.riskLevel ?? "—" },
                 ...(s.market.trendDegraded ? [{ k: "⚠", v: t("br.st.trendDegraded") }] : [])]}
          onClick={() => router.push("/decision-v2?tab=overview")} />
        <StatusCard title={t("br.st.mission")} asOf={s.mission.asOf} asOfLabel={t("br.asOf.today")}
          main={`${s.mission.active} ${t("br.st.missionActive")}`} tone="blue"
          rows={s.mission.rows.map((m) => ({ k: m.periodLabel, v: `${fmtPct(m.returnPct, 2)} / +${m.targetPct}% · ${m.daysLeft}${t("tr.unit.day")}` }))}
          onClick={() => router.push("/decision-v2?tab=portfolio")} />
        <StatusCard title={t("br.st.reco")} asOf={s.recommendation.asOf} asOfLabel={s.recommendation.isToday ? t("br.asOf.today") : t("dc.ov.lastClose")}
          main={s.recommendation.verdict ? tx(`dc.verdict.${s.recommendation.verdict}`) : "—"} tone="amber"
          rows={[{ k: t("br.st.portfolio"), v: s.recommendation.portfolioCount != null ? `${s.recommendation.portfolioCount} ${t("tr.unit.trade")}` : "—" }]}
          onClick={() => router.push("/decision-v2?tab=recommendations")} />
        <StatusCard title={t("br.st.system")} asOf={health?.auditAt ? fmtJstTime(health.auditAt) : null} asOfLabel={t("br.asOf.audit")}
          main={health ? (health.criticalCount > 0 ? `CRITICAL ${health.criticalCount}` : t("br.st.normal")) : "—"}
          tone={health ? (health.criticalCount > 0 ? "red" : health.warningCount > 0 ? "amber" : "green") : "neutral"}
          rows={health ? [{ k: "WARNING", v: String(health.warningCount) }, { k: "CRITICAL", v: String(health.criticalCount) }] : []} />
      </div>

      {/* ① 今日执行时间轴 */}
      <AppCard header={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⏱ {t("br.tl.title")}</span>
            <span className="text-[11px] tabular-nums" style={{ color: COLORS.textMuted }}>{tl.producedCount}/{tl.totalCount} {t("br.tl.produced")}</span>
          </span>
          <a href="/admin/mission-control" className="text-[11px] hover:underline" style={{ color: COLORS.primary }}>{t("br.tl.allTasks")} →</a>
        </div>}>
        {/* 进度条 */}
        <div className="h-1.5 w-full rounded-full overflow-hidden mb-3" style={{ background: COLORS.track }}>
          <div className="h-full rounded-full" style={{ width: `${(tl.producedCount / Math.max(1, tl.totalCount)) * 100}%`, background: COLORS.success }} />
        </div>
        <div className="flex flex-col">
          {tl.nodes.map((n, i) => {
            const isNext = n.key === tl.nextNodeKey;
            return (
              <div key={n.key} className="flex items-start gap-2.5 py-2 flex-wrap" style={{ borderTop: i ? `1px solid ${COLORS.borderSoft}` : undefined, background: isNext ? `${COLORS.primary}0A` : undefined }}>
                <span className="text-[13px] w-4 shrink-0 text-center" style={{ color: n.state === "PRODUCED" ? COLORS.success : n.state === "RUNNING" ? COLORS.primary : COLORS.textFaint }}>{STATE_ICON[n.state]}</span>
                <span className="text-[11px] tabular-nums w-[86px] shrink-0" style={{ color: COLORS.textMuted }}>{n.schedule}</span>
                <span className="text-[12px] font-medium min-w-[150px]" style={{ color: COLORS.text }}>{tx(`br.node.${n.key}`)}</span>
                <span className="text-[11px] flex-1 min-w-[180px]" style={{ color: COLORS.textMuted }}>
                  {n.producedAt ? <b className="tabular-nums" style={{ color: COLORS.textSecondary }}>{fmtJstTime(n.producedAt) ?? n.producedAt}</b> : null}
                  {n.producedAt ? " · " : ""}
                  <NodeDetail nodeKey={n.key} detail={n.detail} t={tx} />
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {isNext && n.etaMinutes != null ? <span className="text-[10px] tabular-nums" style={{ color: COLORS.primary }}>{t("br.tl.eta")} {fmtEta(n.etaMinutes)}</span> : null}
                  <AppBadge tone={isNext ? "blue" : STATE_TONE[n.state]}>{isNext ? t("br.tl.next") : tx(`br.state.${n.state}`)}</AppBadge>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] mt-2" style={{ color: COLORS.textFaint }}>ⓘ {t("br.tl.note")}</p>
      </AppCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        {/* ③ 今日事件 */}
        <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>📅 {t("br.ev.title")}</span>}>
          {/* TDnet */}
          <Section label={`📰 ${t("br.ev.tdnet")}`} sub={`${t("br.ev.window")} ${ev.tdnet.windowHours}h`} count={ev.tdnet.items.length}>
            {ev.tdnet.items.length === 0 ? <EmptyLine text={t("br.ev.noTdnet")} /> : (
              <div className="flex flex-col">
                {ev.tdnet.items.slice(0, 5).map((it, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 text-[11px]" style={{ borderTop: i ? `1px solid ${COLORS.borderSoft}` : undefined }}>
                    <span className="tabular-nums shrink-0" style={{ color: COLORS.textFaint }}>{it.publishedAt?.slice(5, 10)}</span>
                    <button onClick={() => setTarget({ symbol: it.symbol, name: it.symbol })} className="font-mono shrink-0 hover:underline" style={{ color: COLORS.primary }}>{it.symbol}</button>
                    {it.held ? <AppBadge tone="green">{t("br.ev.held")}</AppBadge> : null}
                    <span className="flex-1 truncate" style={{ color: COLORS.textSecondary }}>{it.title}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
          {/* 研究日历 */}
          <Section label={`🗓 ${t("br.ev.research")}`} sub={`${t("br.ev.window")} ${ev.research.windowDays}d`} count={ev.research.items.length}>
            {ev.research.items.length === 0 ? <EmptyLine text={t("br.ev.noResearch")} /> : (
              <div className="flex flex-col">
                {ev.research.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 text-[11px]" style={{ borderTop: i ? `1px solid ${COLORS.borderSoft}` : undefined }}>
                    <span className="tabular-nums shrink-0" style={{ color: COLORS.textFaint }}>{it.scheduledAt}</span>
                    <AppBadge tone="neutral">{it.eventType}</AppBadge>
                    <span className="flex-1 truncate" style={{ color: COLORS.textSecondary }}>{it.title}</span>
                  </div>
                ))}
                <Link href="/deep-research/calendar" className="text-[11px] mt-1 self-end hover:underline" style={{ color: COLORS.primary }}>{t("br.ev.toCalendar")} →</Link>
              </div>
            )}
          </Section>
          {/* 未接入项：显式标注，绝不推测 */}
          <div className="mt-2 rounded-lg p-2.5" style={{ background: COLORS.tile }}>
            {[{ label: `📊 ${t("br.ev.earnings")}`, need: tx(ev.earnings.needKey) }, { label: `💰 ${t("br.ev.exDiv")}`, need: tx(ev.exDividend.needKey) }].map((x, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] py-0.5">
                <span style={{ color: COLORS.textMuted }}>{x.label}</span>
                <AppBadge tone="neutral">⊘ {t("br.ev.notConnected")}</AppBadge>
                <span className="flex-1 text-[10px]" style={{ color: COLORS.textFaint }}>{x.need}</span>
              </div>
            ))}
          </div>
        </AppCard>

        {/* ④ 今日待办 + ⑤ 今日关注机会 */}
        <div className="space-y-3">
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>📌 {t("br.todo.title")}</span>}>
            <TodoRow icon="📌" label={t("br.todo.mission")} count={td.missionPending.count}
              detail={td.missionPending.count === 0 ? t("br.todo.missionDone") : t("br.todo.missionWait")}
              asOf={td.missionPending.asOf} onGo={() => router.push("/decision-v2?tab=portfolio")} goLabel="Mission Lab" />
            <TodoRow icon="⚠" label={t("br.todo.tpsl")} count={td.tpSlAlerts.count}
              detail={td.tpSlAlerts.count === 0 ? `${td.tpSlAlerts.holdings} ${t("br.todo.allInRange")}` : ""}
              asOf={td.tpSlAlerts.asOf} onGo={() => router.push("/decision-v2?tab=overview")} goLabel={t("tr.toOverview")}>
              {td.tpSlAlerts.items.map((it) => (
                <div key={it.symbol} className="flex items-center gap-2 py-1 text-[11px]">
                  <AppBadge tone={it.kind.includes("SL") ? "red" : "green"}>{tx(`br.tpsl.${it.kind}`)}</AppBadge>
                  <button onClick={() => setTarget({ symbol: it.symbol, name: it.name })} className="hover:underline" style={{ color: COLORS.text }}>{it.name}</button>
                  <span className="tabular-nums" style={{ color: COLORS.textMuted }}>{fmtJpy(it.price)}</span>
                  <span className="tabular-nums ml-auto" style={{ color: COLORS.textFaint }}>
                    {it.kind.includes("TP") ? `TP ${fmtJpy(it.target)}` : `SL ${fmtJpy(it.stop)}`}{it.gapPct ? ` · ${it.gapPct}%` : ""}
                  </span>
                </div>
              ))}
            </TodoRow>
            <TodoRow icon="🔺" label={t("br.todo.risk")} count={td.riskAlerts.count} detail=""
              asOf={td.riskAlerts.asOf} onGo={() => router.push("/decision-v2?tab=overview")} goLabel={t("tr.toOverview")}>
              {td.riskAlerts.items.map((it) => (
                <div key={it.key} className="flex items-center gap-2 py-1 text-[11px]">
                  <AppBadge tone={it.level === "WARNING" ? "amber" : "neutral"}>{it.level}</AppBadge>
                  <span style={{ color: COLORS.textSecondary }}>{tx(`br.risk.${it.key}`)}</span>
                </div>
              ))}
            </TodoRow>
          </AppCard>

          {/* ⑤ 今日关注机会（读 TOP10 既有标记，非新评分体系） */}
          <AppCard header={
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🎯 {t("br.opp.title")}</span>
              <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{op.isToday ? t("br.asOf.today") : t("dc.ov.lastClose")} {op.asOf ?? "—"}</span>
            </div>}>
            {!op.available ? <EmptyLine text={t("br.opp.empty")} /> : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {op.categories.map((c) => (
                    <button key={c.key} onClick={() => c.top && setTarget({ symbol: c.top.symbol, name: c.top.name })}
                      disabled={!c.top} className="rounded-lg px-2.5 py-2 text-left disabled:cursor-default"
                      style={{ background: COLORS.tile, opacity: c.count ? 1 : 0.5 }}>
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[11px]" style={{ color: COLORS.textSecondary }}>{tx(`br.opp.${c.key}`)}</span>
                        <span className="text-[15px] font-bold tabular-nums" style={{ color: COLORS.text }}>{c.count}</span>
                      </div>
                      <div className="text-[10px] truncate mt-0.5" style={{ color: COLORS.textFaint }}>
                        {c.top ? `${c.top.name} · AI ${c.top.aiScore ?? "—"}` : t("br.opp.none")}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] mt-2" style={{ color: COLORS.textFaint }}>{t("br.opp.note")}</p>
              </>
            )}
          </AppCard>
        </div>
      </div>

      {/* 页脚 */}
      <div className="text-[10px] leading-relaxed px-3 py-2.5 rounded-lg" style={{ background: COLORS.tile, color: COLORS.textFaint }}>
        <div>{t("br.foot.state")}</div>
        <div>{t("br.foot.asOf")}</div>
        <div>{t("br.foot.notConnected")}</div>
      </div>

      <StockDetailModal report={target} onClose={() => setTarget(null)} />
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────────────────────────
function StatusCard({ title, main, tone, rows, asOf, asOfLabel, onClick }: {
  title: string; main: string; tone: Tone; rows: { k: string; v: string }[];
  asOf: string | null; asOfLabel: string; onClick?: () => void;
}) {
  return (
    <AppCard hover={!!onClick} onClick={onClick}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px]" style={{ color: COLORS.textMuted }}>{title}</span>
        <AppBadge tone={tone}>●</AppBadge>
      </div>
      <div className="text-[17px] font-bold leading-tight" style={{ color: COLORS.text }}>{main}</div>
      <div className="mt-1.5 space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between gap-2 text-[11px]">
            <span className="shrink-0" style={{ color: COLORS.textMuted }}>{r.k}</span>
            <span className="tabular-nums text-right truncate" style={{ color: COLORS.textSecondary }}>{r.v}</span>
          </div>
        ))}
      </div>
      {/* 每格独立 As Of —— 不同口径不得混排 */}
      <div className="mt-2 pt-1.5 text-[10px] tabular-nums" style={{ borderTop: `1px solid ${COLORS.borderSoft}`, color: COLORS.textFaint }}>
        {asOfLabel} {asOf ?? "—"}
      </div>
    </AppCard>
  );
}

function NodeDetail({ nodeKey, detail, t }: { nodeKey: string; detail: Record<string, number | string | null>; t: (k: string) => string }) {
  const parts: string[] = [];
  if (nodeKey === "ai_score" && detail.count != null) parts.push(`${detail.count} ${t("br.d.stocks")}`);
  if (nodeKey === "mission_prepare" && detail.decisions != null) parts.push(`${detail.decisions} ${t("br.d.decisions")}`);
  if (nodeKey === "mission_execute") {
    if (detail.trades != null) parts.push(`${detail.trades} ${t("br.d.trades")}`);
    if (detail.skipped != null) parts.push(`${detail.skipped} ${t("br.d.skipped")}`);
  }
  if (nodeKey === "closing_decision" && !detail.verdict && detail.latestDate) parts.push(`${t("br.d.latest")} ${detail.latestDate}`);
  if (nodeKey === "review_nav") {
    parts.push(`${t("br.d.reviews")} ${detail.reviews ?? 0}`, `NAV ${detail.portfolioNav ?? 0}`);
    if (detail.missionNavContext != null) parts.push(`${t("br.d.missionNav")} ${detail.missionNavContext}`);
  }
  return <>{parts.join(" · ")}</>;
}

function Section({ label, sub, count, children }: { label: string; sub?: string; count: number; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-medium" style={{ color: COLORS.textSecondary }}>{label}</span>
        {sub ? <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{sub}</span> : null}
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: COLORS.textMuted }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function TodoRow({ icon, label, count, detail, asOf, onGo, goLabel, children }: {
  icon: string; label: string; count: number; detail: string; asOf: string | null;
  onGo: () => void; goLabel: string; children?: ReactNode;
}) {
  return (
    <div className="py-2" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px]">{icon}</span>
        <span className="text-[12px] font-medium" style={{ color: COLORS.text }}>{label}</span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color: count > 0 ? COLORS.warning : COLORS.textFaint }}>{count}</span>
        {detail ? <span className="text-[11px]" style={{ color: COLORS.textMuted }}>{detail}</span> : null}
        <button onClick={onGo} className="ml-auto text-[11px] hover:underline shrink-0" style={{ color: COLORS.primary }}>{goLabel} →</button>
      </div>
      {children}
      {asOf ? <div className="text-[10px] mt-1 tabular-nums" style={{ color: COLORS.textFaint }}>as of {asOf}</div> : null}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) { return <p className="text-[11px] py-2" style={{ color: COLORS.textFaint }}>{text}</p>; }
