"use client";

// ── Decision Workspace 壳（P14-DEV-01 · 并行预览 /decision-v2）───────────────────
// 一个交易工作流（非五 Dashboard）：Header + 持久 ContextBar + 工作流子导航 + 内容 + Footer。
// DEV-01 仅地基：内容区为各页占位，DEV-02..06 逐页填充；生产 /decision-center 与 / 不动。
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import { marketPhase } from "@/lib/decision/live-status";
import { fmtJstClock } from "@/lib/decision/ds";
import { DecisionProvider } from "@/lib/decision/provider";
import DecisionContextBar from "@/components/decision/ds/ContextBar";
import SystemStatusFooter from "@/components/decision/ds/SystemStatusFooter";
import { DECISION_TABS } from "@/components/decision/ds/SubNav";
import DecisionOverviewV2 from "@/components/decision/pages/DecisionOverviewV2";
import DecisionStrategyV2 from "@/components/decision/pages/DecisionStrategyV2";
import DecisionRecommendationsV2 from "@/components/decision/pages/DecisionRecommendationsV2";
import DecisionPortfolioV2 from "@/components/decision/pages/DecisionPortfolioV2";
import DecisionHistoryV2 from "@/components/decision/pages/DecisionHistoryV2";

const VALID = new Set<string>(DECISION_TABS.map((t) => t.key));

function Placeholder({ tab }: { tab: string }) {
  const { t } = useI18n();
  const label = t(`dv.nav.${tab}` as Parameters<typeof t>[0]);
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="text-[15px] font-semibold" style={{ color: COLORS.text }}>{label}</div>
      <div className="text-[12px] mt-1" style={{ color: COLORS.textFaint }}>{t("dv.placeholder")}</div>
    </div>
  );
}

// P15-01B 紧凑 Header（≈60px）：删除旧 AppHeader 大卡与大留白（首屏空间让给实时行动）。
// 当前 tab 标题 + JST 时钟 + 行情状态；工作区名已由 Sidebar 标明，不再重复「决策」大标题。
function CompactHeader({ active }: { active: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // 首次经 rAF 回调设置（避免 effect 内同步 setState 的级联渲染），随后每秒走时。
    const tick = () => setNow(new Date());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, []);
  const phase = now ? marketPhase(now) : null;
  const open = phase === "OPEN";
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6" style={{ paddingTop: 12, paddingBottom: 6 }}>
      <div className="flex items-center justify-between gap-3" style={{ minHeight: 40 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.01em" }}>
          {t(`dv.nav.${active}` as Parameters<typeof t>[0])}
        </h1>
        <div className="flex items-center gap-3" style={{ fontSize: 12, color: COLORS.textFaint }}>
          <span className="tabular-nums">{now ? `${fmtJstClock(now.toISOString())} JST` : "—"}</span>
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: 6, height: 6, borderRadius: 6, background: open ? "#34C759" : "#9CA3AF" }} />
            {t(open ? "dv.ov2.marketOk" : "dv.ov2.marketClosed")}
          </span>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const sp = useSearchParams();
  const raw = sp.get("tab");
  // "today"→strategy、"recommendations"→picks 为任务 URL 别名
  const active = raw === "today" ? "strategy" : raw === "recommendations" ? "picks" : raw && VALID.has(raw) ? raw : "overview";
  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <DecisionProvider>
        {/* 决策总览已由页内 DecisionBar 承载「今日决策/风险/信心/建议仓位」，避免与 ContextBar 顶部重复 → overview 不渲染共享上下文条 */}
        {active !== "overview" && <DecisionContextBar />}
        {/* P14-UI-03：一级页面切换统一移至左侧 Sidebar。P16-02：决策总览由页内顶部工具栏(含搜索)承载，故此处不渲染。 */}
        {active !== "overview" && <CompactHeader active={active} />}
        <div className="pb-8">
          {active === "overview" ? <DecisionOverviewV2 /> : active === "strategy" ? <DecisionStrategyV2 /> : active === "picks" ? <DecisionRecommendationsV2 /> : active === "portfolio" ? <DecisionPortfolioV2 /> : active === "history" ? <DecisionHistoryV2 /> : <Placeholder tab={active} />}
        </div>
        {/* ⑧ Footer 系统状态条（真实状态，老板视角） */}
        <SystemStatusFooter />
      </DecisionProvider>
    </div>
  );
}

export default function DecisionWorkspace() {
  return <Suspense><Shell /></Suspense>;
}
