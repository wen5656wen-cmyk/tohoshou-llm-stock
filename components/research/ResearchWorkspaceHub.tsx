"use client";

// ── 研究综合 Hub（P7-05）─────────────────────────────────────────────────────
// 研究工作区唯一一级入口，7 顶级 Tab：研究概览/因子/Alpha/Scoring V3/学习/实验/研究回测。
// 顶级 Tab 走 ?tab= URL（刷新保持）；分组内子标签本地态。各 Tab/子标签懒加载 + 仅激活挂载。
// 复用现有面板与移动的 View，不复制代码/API。Scoring V3 保持 Shadow，未改任何评分逻辑。

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { AppHeader, AppLoading, COLORS } from "@/components/ui";

const spin = () => <AppLoading />;
// dynamic 复用现有面板（named export）；prop 类型放宽以兼容 onNavigate / onTab 两种回调命名。
const named = (p: () => Promise<Record<string, unknown>>, key: string) =>
  dynamic(() => p().then((m) => ({ default: m[key] as React.ComponentType<Record<string, unknown>> })), { ssr: false, loading: spin });

// 现有面板（named export）
const AlphaFactorsPanel = named(() => import("./AlphaFactorsPanel"), "AlphaFactorsPanel");
const AlphaAnalyticsPanel = named(() => import("./AlphaAnalyticsPanel"), "AlphaAnalyticsPanel");
const AlphaScorePanel = named(() => import("./AlphaScorePanel"), "AlphaScorePanel");
const AlphaBacktestPanel = named(() => import("./AlphaBacktestPanel"), "AlphaBacktestPanel");
const MarketRegimePanel = named(() => import("./MarketRegimePanel"), "MarketRegimePanel");
const FusionReportPanel = named(() => import("./FusionReportPanel"), "FusionReportPanel");
const ScoreV3Panel = named(() => import("./ScoreV3Panel"), "ScoreV3Panel");
const CalibrationPanel = named(() => import("./CalibrationPanel"), "CalibrationPanel");
// 移动的独立页（default export）
const FeaturesView = dynamic(() => import("./FeaturesView"), { ssr: false, loading: spin });
const FeaturePromotionView = dynamic(() => import("./FeaturePromotionView"), { ssr: false, loading: spin });
const FeaturePlatformView = dynamic(() => import("./FeaturePlatformView"), { ssr: false, loading: spin });
const VersionsView = dynamic(() => import("./VersionsView"), { ssr: false, loading: spin });

type Sub = { key: string; labelKey: string; node: React.ReactNode };
const TOP = [
  { key: "factors", labelKey: "rw.factors" },
  { key: "alpha", labelKey: "rw.alpha" },
  { key: "v3", labelKey: "rw.v3" },
  { key: "experiments", labelKey: "rw.experiments" },
  { key: "backtest", labelKey: "rw.backtest" },
] as const;
const VALID = new Set<string>(TOP.map((t) => t.key));

// 旧面板 onNavigate 的键 → 新顶级 Tab
// P21-T2：overview / learning / freeze 三个目标已下线，映射到新默认 tab（factors）。
const NAV_MAP: Record<string, string> = {
  factors: "factors", analytics: "alpha", score: "alpha",
  regime: "alpha", fusion: "alpha", v3: "v3", calibration: "v3", backtest: "backtest",
};

export default function ResearchWorkspaceHub() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const active = raw && VALID.has(raw) ? raw : "factors";
  const [sub, setSub] = useState<Record<string, string>>({});

  const goTop = (key: string) => { if (key !== active) router.replace(`/admin/research?tab=${key}`, { scroll: false }); };
  const onNav = (k: string) => goTop(NAV_MAP[k] ?? "factors");

  // 分组子标签定义（懒加载：仅激活子标签的 node 会挂载）
  const GROUPS: Record<string, Sub[]> = {
    factors: [
      { key: "lib", labelKey: "rw.f.lib", node: <AlphaFactorsPanel onNavigate={onNav} /> },
      { key: "registry", labelKey: "rw.f.registry", node: <FeaturesView /> },
      { key: "promotion", labelKey: "rw.f.promotion", node: <FeaturePromotionView /> },
      { key: "platform", labelKey: "rw.f.platform", node: <FeaturePlatformView /> },
    ],
    alpha: [
      { key: "score", labelKey: "rw.a.score", node: <AlphaScorePanel onNavigate={onNav} /> },
      { key: "analytics", labelKey: "rw.a.analytics", node: <AlphaAnalyticsPanel onNavigate={onNav} /> },
      { key: "fusion", labelKey: "rw.a.fusion", node: <FusionReportPanel onNavigate={onNav} /> },
      { key: "regime", labelKey: "rw.a.regime", node: <MarketRegimePanel onNavigate={onNav} /> },
    ],
    v3: [
      { key: "shadow", labelKey: "rw.v.shadow", node: <ScoreV3Panel onNavigate={onNav} /> },
      { key: "calibration", labelKey: "rw.v.calibration", node: <CalibrationPanel onNavigate={onNav} /> },
    ],
    experiments: [
      { key: "versions", labelKey: "rw.e.versions", node: <VersionsView /> },
    ],
    backtest: [
      { key: "alpha", labelKey: "rw.b.alpha", node: <AlphaBacktestPanel onNavigate={onNav} /> },
    ],
  };

  const renderBody = () => {
    const group = GROUPS[active];
    if (!group) return null;
    const curSub = sub[active] ?? group[0].key;
    const cur = group.find((s) => s.key === curSub) ?? group[0];
    return (
      <div>
        {/* 子标签（不混数据：如回测 策略/Alpha 两独立子标签） */}
        <div className="mb-4 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {group.map((s) => {
              const on = s.key === cur.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSub((m) => ({ ...m, [active]: s.key }))}
                  className="px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap transition-colors"
                  style={{
                    background: on ? COLORS.primary : COLORS.card,
                    color: on ? "#fff" : COLORS.textSecondary,
                    fontWeight: on ? 600 : 500,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                  }}
                >
                  {t(s.labelKey as Parameters<typeof t>[0])}
                </button>
              );
            })}
          </div>
        </div>
        {cur.node}
      </div>
    );
  };

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
        <AppHeader title={t("ws.researchOverview")} />

        {/* 顶级 Tab — 移动端横向滚动 */}
        <div className="mt-4 mb-5 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {TOP.map((tab) => {
              const on = tab.key === active;
              return (
                <button
                  key={tab.key}
                  onClick={() => goTop(tab.key)}
                  className="px-3.5 py-2 rounded-xl text-[13px] whitespace-nowrap transition-colors active:scale-[0.99]"
                  style={{
                    background: on ? COLORS.text : COLORS.card,
                    color: on ? "#fff" : COLORS.textSecondary,
                    fontWeight: on ? 600 : 500,
                    border: `1px solid ${on ? COLORS.text : COLORS.border}`,
                  }}
                >
                  {t(tab.labelKey as Parameters<typeof t>[0])}
                </button>
              );
            })}
          </div>
        </div>

        {renderBody()}
      </div>
    </div>
  );
}
