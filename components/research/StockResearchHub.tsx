"use client";

// ── 股票研究 Hub Tab 容器（P7-02B-3）────────────────────────────────────────
// 7 Tab：选股 / 行业 / 主题 / 产业链 / 新闻 / 指标 / 研究分析。
// 各 Tab 懒加载 + 仅激活 Tab 挂载 → 首屏不同时请求全部 API；?tab= URL 同步，刷新保持；
// 移动端 Tab 横向滚动。复用现有页面/组件/API，不复制业务逻辑、不改任何计算。
// 行业(/api/sectors)/主题·产业链(/api/ai-theme)/新闻(/api/news)/指标(/api/indicators)/
// 研究分析(/api/admin/research) 底层数据与 API 各自独立。个股点击统一进 /stocks/[symbol]。

import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { AppHeader, AppLoading, COLORS } from "@/components/ui";
import { ScreenerBody } from "@/components/screener/ScreenerBody";

const spin = () => <AppLoading />;
const SectorsView = dynamic(() => import("./SectorsView"), { ssr: false, loading: spin });
const AiThemeView = dynamic(() => import("./AiThemeView"), { ssr: false, loading: spin });
const NewsView = dynamic(() => import("./NewsView"), { ssr: false, loading: spin });
const IndicatorsView = dynamic(() => import("./IndicatorsView"), { ssr: false, loading: spin });
const ResearchCenter = dynamic(() => import("./center").then((m) => ({ default: m.ResearchCenter })), { ssr: false, loading: spin });

const TABS = [
  { key: "screen", labelKey: "sr.tab.screen" },
  { key: "sectors", labelKey: "sr.tab.sectors" },
  { key: "themes", labelKey: "sr.tab.themes" },
  { key: "industry-chain", labelKey: "sr.tab.industryChain" },
  { key: "news", labelKey: "sr.tab.news" },
  { key: "indicators", labelKey: "sr.tab.indicators" },
  { key: "research", labelKey: "sr.tab.research" },
] as const;

const VALID = new Set<string>(TABS.map((t) => t.key));

export default function StockResearchHub() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const active = raw && VALID.has(raw) ? raw : "screen";

  const go = (key: string) => {
    if (key === active) return;
    router.replace(`/screener?tab=${key}`, { scroll: false });
  };

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
        <AppHeader title={t("nav.stockResearch")} />

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

        {/* 仅激活 Tab 挂载 → 懒加载对应 API。选股用完整 ScreenerBody(保留全部筛选/排序/分页)。 */}
        {active === "screen" && <ScreenerBody />}
        {active === "sectors" && <SectorsView />}
        {active === "themes" && <AiThemeView initialThemeCards />}
        {active === "industry-chain" && <AiThemeView />}
        {active === "news" && <NewsView />}
        {active === "indicators" && <IndicatorsView />}
        {active === "research" && <ResearchCenter onTab={(k) => router.push(`/admin/research?tab=${k}`)} />}
      </div>
    </div>
  );
}
