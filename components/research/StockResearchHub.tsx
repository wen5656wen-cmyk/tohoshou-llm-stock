"use client";

// ── 股票研究 Hub Tab 容器（P7-02B-3；P8-UI-02 合并产业链；P8-UI-03 移除研究分析）──
// 5 Tab：选股 / 行业 / 主题研究 / 新闻 / 指标。
// 「研究分析」(ResearchCenter) 已移除——它与研究工作区 /admin/research overview 同组件、
// 同 /api/admin/research·mission-control 数据，属重复挂载；旧 ?tab=research 应用内跳研究工作区。
// 各 Tab 懒加载 + 仅激活 Tab 挂载；?tab= URL 同步，刷新保持；移动端 Tab 横向滚动。
// 复用现有页面/组件/API，不复制业务逻辑、不改任何计算。个股点击统一进 /stocks/[symbol]。

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { AppHeader, AppLoading, COLORS } from "@/components/ui";

const spin = () => <AppLoading />;
const SectorsView = dynamic(() => import("./SectorsView"), { ssr: false, loading: spin });
const AiThemeView = dynamic(() => import("./AiThemeView"), { ssr: false, loading: spin });
const NewsView = dynamic(() => import("./NewsView"), { ssr: false, loading: spin });

const TABS = [
  { key: "sectors", labelKey: "sr.tab.sectors" },
  { key: "themes", labelKey: "sr.tab.themes" },
  { key: "news", labelKey: "sr.tab.news" },
] as const;

const VALID = new Set<string>(TABS.map((t) => t.key));

// P8-UI-03：旧 ?tab= 深链 → 收敛后的新位置（不失效）。
//   research      → 跳研究工作区 /admin/research
//   industry-chain→ 主题研究·产业链子 Tab
//   theme-news    → 新闻 Tab（相关新闻已删，Theme News 待重新设计）
//   leaders       → 主题研究·概念股票（含「仅看核心龙头」过滤）
//   ai-analysis   → 主题研究·主题概览（含 AI 摘要）
const LEGACY: Record<string, { tab?: string; sub?: string; redirect?: string }> = {
  "research": { redirect: "/admin/research" },
  // P21-T4：选股 Tab 下线，能力全部迁入股票中心 → 旧深链重定向，不留 404。
  "screen": { redirect: "/decision-v2?tab=picks&view=all" },
  "industry-chain": { tab: "themes", sub: "chain" },
  "theme-news": { tab: "news" },
  "leaders": { tab: "themes", sub: "concept" },
  "ai-analysis": { tab: "themes", sub: "overview" },
};

export default function StockResearchHub() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const legacy = raw ? LEGACY[raw] : undefined;

  // 跨路由旧链（研究分析 → 研究工作区）：客户端 replace。
  useEffect(() => {
    if (legacy?.redirect) router.replace(legacy.redirect);
  }, [legacy, router]);

  const initialSub = legacy?.sub;
  // P21-T4：screen Tab 已下线（能力全部迁入股票中心），默认 Tab 改为 sectors。
  const active = legacy?.redirect ? "sectors" : legacy?.tab ?? (raw && VALID.has(raw) ? raw : "sectors");

  // 研究分析旧链跳转中：占位加载态（避免闪现选股）。
  if (legacy?.redirect) {
    return (
      <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5"><AppLoading /></div>
      </div>
    );
  }

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
        {/* P14-UI-03：一级页面切换统一移至左侧 Sidebar，内容区不再放同名一级 Tab（Tab bar 已移除）。 */}
        <div className="mt-4" />

        {/* 仅激活 Tab 挂载 → 懒加载对应 API。 */}
        {active === "sectors" && <SectorsView />}
        {active === "themes" && <AiThemeView initialSubTab={initialSub} />}
        {active === "news" && <NewsView />}
      </div>
    </div>
  );
}
