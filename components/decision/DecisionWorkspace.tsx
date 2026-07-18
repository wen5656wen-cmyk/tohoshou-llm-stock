"use client";

// ── Decision Workspace 壳（P14-DEV-01 · 并行预览 /decision-v2）───────────────────
// 一个交易工作流（非五 Dashboard）：Header + 持久 ContextBar + 工作流子导航 + 内容 + Footer。
// DEV-01 仅地基：内容区为各页占位，DEV-02..06 逐页填充；生产 /decision-center 与 / 不动。
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { AppHeader, COLORS } from "@/components/ui";
import { DecisionProvider } from "@/lib/decision/provider";
import DecisionContextBar from "@/components/decision/ds/ContextBar";
import SystemStatusFooter from "@/components/decision/ds/SystemStatusFooter";
import { SubNav, DECISION_TABS } from "@/components/decision/ds/SubNav";
import DecisionOverviewV2 from "@/components/decision/pages/DecisionOverviewV2";

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

function Shell() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const active = raw && VALID.has(raw) ? raw : "overview";
  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <DecisionProvider>
        <DecisionContextBar />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-4">
          <AppHeader title={t("dv.title")} />
        </div>
        <SubNav active={active} />
        <div className="pb-8">
          {active === "overview" ? <DecisionOverviewV2 /> : <Placeholder tab={active} />}
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
