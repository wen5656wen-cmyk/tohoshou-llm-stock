// ─────────────────────────────────────────────────────────────────────────────
// nav-config.ts — 全站唯一导航配置源（P7-02B-1）
//
// 桌面 Sidebar / 移动底栏 MobileBottomNav / 移动抽屉 MobileDrawer 全部从此派生。
// 禁止任何导航组件再硬编码路径或图标。一级入口固定 7 个：5 老板 + 2 管理员（折叠）。
//
// 本文件只描述「导航结构」——不触碰任何评分/策略/交易/API/数据逻辑。
// tabs 字段为后续 P7-02B-2~6 的 Tab 收敛预留（本阶段仅一级入口生效）。
// ─────────────────────────────────────────────────────────────────────────────

import {
  LayoutGrid, Target, Search, LineChart, Bot, Database, Settings,
} from "@/components/dashboard/icons";

export type NavIcon = (p: { size?: number }) => React.ReactElement;

export type NavTab = {
  key: string;          // ?tab= 值
  labelKey: string;     // i18n 键
  /** 该 Tab 承载的旧独立路由（用于 P7-02B-7 重定向映射，本阶段仅登记不启用） */
  legacyRoutes?: string[];
  adminOnly?: boolean;
};

export type NavNode = {
  key: string;          // 稳定 id
  labelKey: string;     // i18n 键（经 t() 解析）
  href: string;         // 一级入口落地路由（现存可达页面）
  Icon: NavIcon;        // 桌面图标组件
  glyph: string;        // 移动端字形
  badge?: string;
  adminOnly?: boolean;  // true=管理员区（默认折叠，老板不默认可见）
  showInMobileBottom?: boolean; // 是否进入移动底栏 5 格
  tabs?: NavTab[];      // 内部 Tab（后续阶段生效）
};

// ── 一级导航（7 个）──────────────────────────────────────────────────────────
// 说明：本阶段（B-1）href 指向「当前已存在、可达」的页面，保证零重定向失败。
// 决策中心 hub(/decision-center)、股票研究/策略/交易的 Tab 容器将在 B-2~B-5 建成后
// 再由本文件切换 href 与启用 tabs，届时不改本结构、只改指向。
export const NAV_NODES: NavNode[] = [
  {
    key: "home",
    labelKey: "nav.home",
    href: "/",
    Icon: LayoutGrid,
    glyph: "◈",
    showInMobileBottom: true,
  },
  {
    key: "decision",
    labelKey: "nav.decisionHub",
    href: "/decision-center", // B-2：统一 Tab 容器（今日总览默认）
    Icon: Target,
    glyph: "◎",
    showInMobileBottom: true,
    tabs: [
      { key: "overview", labelKey: "nav.cockpit" },
      { key: "picks", labelKey: "nav.aiTopPicks", legacyRoutes: ["/admin/ai-top-picks"] },
      { key: "watchlist", labelKey: "nav.dailyWatchlist", legacyRoutes: ["/watchlist/daily"] },
      { key: "closing", labelKey: "nav.closingDecision", legacyRoutes: ["/admin/closing-decision"] },
      { key: "cockpit", labelKey: "nav.decisionCenter", legacyRoutes: ["/admin/decision-center"] },
    ],
  },
  {
    key: "research",
    labelKey: "nav.stockResearch",
    href: "/screener",
    Icon: Search,
    glyph: "✦",
    showInMobileBottom: true,
    tabs: [
      { key: "screener", labelKey: "nav.aiScreener" },
      { key: "sectors", labelKey: "nav.sectors", legacyRoutes: ["/sectors"] },
      { key: "theme", labelKey: "nav.aiValueChain", legacyRoutes: ["/ai-theme"] },
      { key: "indicators", labelKey: "nav.indicators", legacyRoutes: ["/indicators"] },
      { key: "news", labelKey: "nav.news", legacyRoutes: ["/news"] },
    ],
  },
  {
    key: "strategy",
    labelKey: "nav.strategyBacktest",
    href: "/strategy",
    Icon: LineChart,
    glyph: "◆",
    showInMobileBottom: true,
    tabs: [
      { key: "overview", labelKey: "nav.strategyOverview" },
      { key: "backtest_strategy", labelKey: "nav.backtestStrategy", legacyRoutes: ["/backtest"] },
      { key: "backtest_factor", labelKey: "nav.backtestFactor", legacyRoutes: ["/admin/research?tab=backtest"] },
    ],
  },
  {
    key: "trading",
    labelKey: "nav.tradingPositions",
    href: "/portfolio",
    Icon: Bot,
    glyph: "◇",
    badge: "Paper",
    showInMobileBottom: true,
    tabs: [
      { key: "positions", labelKey: "nav.aiPortfolio" },
      { key: "watchlist", labelKey: "tabs.watchlist", legacyRoutes: ["/watchlist"] },
    ],
  },
  // ── 管理员区（默认折叠）──────────────────────────────────────────────────
  {
    key: "data",
    labelKey: "nav.dataAndLearning",
    href: "/admin/research",
    Icon: Database,
    glyph: "▤",
    adminOnly: true,
    tabs: [
      { key: "factors", labelKey: "nav.features", legacyRoutes: ["/admin/features", "/admin/feature-platform"] },
      { key: "promotion", labelKey: "nav.featurePromotion", legacyRoutes: ["/admin/feature-promotion"] },
      { key: "score", labelKey: "nav.research" },
      { key: "regime", labelKey: "nav.market", legacyRoutes: ["/market-regime"] },
      { key: "fusion", labelKey: "nav.research" },
      { key: "learning", labelKey: "nav.learningReport", legacyRoutes: ["/admin/learning-report"] },
      { key: "versions", labelKey: "nav.versionCenter", legacyRoutes: ["/admin/versions"] },
    ],
  },
  {
    key: "system",
    labelKey: "nav.systemMgmt",
    href: "/admin/mission-control",
    Icon: Settings,
    glyph: "⚙",
    adminOnly: true,
    tabs: [
      { key: "overview", labelKey: "nav.missionControl" },
      { key: "runtime", labelKey: "nav.runtime", legacyRoutes: ["/admin/runtime"] },
      { key: "verify", labelKey: "nav.dataVerify", legacyRoutes: ["/admin/verify"] },
      { key: "sync", labelKey: "nav.syncStatus", legacyRoutes: ["/sync"] },
    ],
  },
];

/** 老板默认可见的一级入口（前 5 个） */
export const bossNodes = (): NavNode[] => NAV_NODES.filter((n) => !n.adminOnly);
/** 管理员额外入口（后 2 个，默认折叠） */
export const adminNodes = (): NavNode[] => NAV_NODES.filter((n) => n.adminOnly);
/** 移动底栏 5 格 */
export const mobileBottomNodes = (): NavNode[] =>
  NAV_NODES.filter((n) => n.showInMobileBottom).slice(0, 5);

/** 一级入口 active 判定（首页精确匹配，其余前缀匹配） */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/") || pathname.startsWith(base + "?");
}
