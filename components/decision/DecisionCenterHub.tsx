"use client";

// ── 决策中心 Tab 容器（P7-02B-2）─────────────────────────────────────────────
// 6 Tab：今日总览 / 早盘AI五选 / 每日关注池 / 收盘决策 / 决策驾驶舱 / 历史记录。
// 各 Tab 懒加载（next/dynamic）+ 仅激活 Tab 挂载 → 首屏不同时请求全部 API。
// URL ?tab= 同步，刷新保持当前 Tab；不整页刷新切换。复用现有视图/组件/API，不复制逻辑。

import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { AppHeader, AppLoading, COLORS } from "@/components/ui";
import DecisionOverview from "./DecisionOverview";

const spin = () => <AppLoading />;
const AiTopPicksView = dynamic(() => import("./AiTopPicksView"), { ssr: false, loading: spin });
const DailyWatchlistView = dynamic(() => import("@/components/watchlist-daily/DailyWatchlistView"), { ssr: false, loading: spin });
const ClosingDecisionView = dynamic(() => import("./ClosingDecisionView"), { ssr: false, loading: spin });
const DecisionCockpitView = dynamic(() => import("./DecisionCockpitView"), { ssr: false, loading: spin });
const DecisionHistory = dynamic(() => import("./DecisionHistory"), { ssr: false, loading: spin });

const TABS = [
  { key: "overview", labelKey: "dc.tab.overview" },
  { key: "top-picks", labelKey: "dc.tab.topPicks" },
  { key: "watchlist", labelKey: "dc.tab.watchlist" },
  { key: "closing", labelKey: "dc.tab.closing" },
  { key: "cockpit", labelKey: "dc.tab.cockpit" },
  { key: "history", labelKey: "dc.tab.history" },
] as const;

const VALID = new Set<string>(TABS.map((t) => t.key));

export default function DecisionCenterHub() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const active = raw && VALID.has(raw) ? raw : "overview";

  const go = (key: string) => {
    if (key === active) return;
    router.replace(`/decision-center?tab=${key}`, { scroll: false });
  };

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5">
        <AppHeader title={t("dc.title")} />

        {/* Tab bar — 移动端横向滚动 */}
        <div className="mt-4 mb-5 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {TABS.map((tab) => {
              const on = tab.key === active;
              return (
                <button
                  key={tab.key}
                  onClick={() => go(tab.key)}
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

        {/* 仅激活 Tab 挂载 → 懒加载对应 API */}
        {active === "overview" && <DecisionOverview onNavigate={go} />}
        {active === "top-picks" && <AiTopPicksView />}
        {active === "watchlist" && <DailyWatchlistView />}
        {active === "closing" && <ClosingDecisionView />}
        {active === "cockpit" && <DecisionCockpitView />}
        {active === "history" && <DecisionHistory />}
      </div>
    </div>
  );
}
