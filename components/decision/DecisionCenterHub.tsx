"use client";

// ── 决策中心 Tab 容器（P7-02B-2）─────────────────────────────────────────────
// 6 Tab：今日总览 / 早盘AI五选 / 每日关注池 / 收盘决策 / 决策驾驶舱 / 历史记录。
// 各 Tab 懒加载（next/dynamic）+ 仅激活 Tab 挂载 → 首屏不同时请求全部 API。
// URL ?tab= 同步，刷新保持当前 Tab；不整页刷新切换。复用现有视图/组件/API，不复制逻辑。

import { useEffect } from "react";
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

// P13-DECISION-01 导航收敛：一级 Tab 收敛为 3 个（today / live / review）。
// closing / top-picks / cockpit 从一级导航隐藏，但仍可经 ?tab= 深链访问（不删除、不 404）。
// 旧 ?tab= 深链别名：overview→today · watchlist→live · history→review。
// 本轮仅导航/映射/URL 兼容，页面内容与数据来源零改动（today 暂渲染原 overview 内容）。
const NAV_TABS = [
  { key: "today", labelKey: "dc.tab.today" },
  { key: "live", labelKey: "dc.tab.live" },
  { key: "review", labelKey: "dc.tab.review" },
] as const;

// 旧深链别名 → 新 canonical key
const TAB_ALIAS: Record<string, string> = {
  overview: "today",
  watchlist: "live",
  history: "review",
};
// 一级导航隐藏但仍可访问的 key（本轮暂留，后续阶段迁出）
const HIDDEN_TABS = new Set<string>(["closing", "top-picks", "cockpit"]);
const CANONICAL_TABS = new Set<string>(["today", "live", "review"]);

// raw ?tab= → 实际渲染 key：canonical 原样 / 别名映射 / 隐藏原样 / 其余回退 today
function resolveTab(raw: string | null): string {
  if (!raw) return "today";
  if (CANONICAL_TABS.has(raw)) return raw;
  if (TAB_ALIAS[raw]) return TAB_ALIAS[raw];
  if (HIDDEN_TABS.has(raw)) return raw;
  return "today";
}

export default function DecisionCenterHub() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const active = resolveTab(raw);

  // URL 规范化：仅当 raw 与解析后的 key 不一致时 replace 一次（缺省/别名/非法 → active）。
  // replace 后 raw===active 不再触发 → 无重复 replace/redirect 循环。
  useEffect(() => {
    if (raw !== active) {
      router.replace(`/decision-center?tab=${active}`, { scroll: false });
    }
  }, [raw, active, router]);

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
            {NAV_TABS.map((tab) => {
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

        {/* 仅激活 Tab 挂载 → 懒加载对应 API。today/live/review 为一级导航；
            closing/top-picks/cockpit 隐藏但经 ?tab= 深链仍可渲染（本轮暂留）。 */}
        {active === "today" && <DecisionOverview onNavigate={go} />}
        {active === "live" && <DailyWatchlistView />}
        {active === "review" && <DecisionHistory />}
        {active === "closing" && <ClosingDecisionView />}
        {active === "top-picks" && <AiTopPicksView />}
        {active === "cockpit" && <DecisionCockpitView />}
      </div>
    </div>
  );
}
