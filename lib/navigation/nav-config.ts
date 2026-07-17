// ─────────────────────────────────────────────────────────────────────────────
// nav-config.ts — 全站唯一导航配置源（P7-04A 三工作区）
//
// 桌面 Sidebar / 移动底栏 / 移动抽屉 / 工作区切换器 全部从此派生。
// 三工作区（workspace 三态，取代旧 adminOnly 二态）：
//   boss（老板·默认）· admin（管理员）· research（研究）
// 每个导航节点必须标注 workspace。软切换、无鉴权、状态由 URL 推导 + localStorage 记忆。
//
// 只描述导航结构 —— 不触碰评分/策略/交易/API/数据/页面业务内容。
// ─────────────────────────────────────────────────────────────────────────────

import {
  Target, Search, LineChart, Bot, Settings, Microscope,
} from "@/components/dashboard/icons";

export type NavIcon = (p: { size?: number }) => React.ReactElement;
export type Workspace = "boss" | "admin" | "research";
export const WORKSPACES: Workspace[] = ["boss", "admin", "research"];

export type NavTab = { key: string; labelKey: string; legacyRoutes?: string[] };

export type NavNode = {
  key: string;
  labelKey: string;
  href: string;
  Icon: NavIcon;
  glyph: string;
  badge?: string;
  workspace: Workspace;
  tabs?: NavTab[];
};

// ── 三工作区默认落地页 ──────────────────────────────────────────────────────
export const WORKSPACE_HOME: Record<Workspace, string> = {
  boss: "/decision-center",
  admin: "/admin/mission-control",
  research: "/admin/research",
};

// ── 全部一级入口（按工作区）─────────────────────────────────────────────────
export const NAV_NODES: NavNode[] = [
  // ═══ 老板工作区（4 入口）═══
  {
    key: "decision", workspace: "boss", labelKey: "nav.decisionHub", href: "/decision-center",
    Icon: Target, glyph: "◎",
    tabs: [
      { key: "overview", labelKey: "dc.tab.overview" },
      { key: "top-picks", labelKey: "dc.tab.topPicks", legacyRoutes: ["/admin/ai-top-picks"] },
      { key: "watchlist", labelKey: "dc.tab.watchlist", legacyRoutes: ["/watchlist/daily"] },
      { key: "closing", labelKey: "dc.tab.closing", legacyRoutes: ["/admin/closing-decision"] },
      { key: "cockpit", labelKey: "dc.tab.cockpit", legacyRoutes: ["/admin/decision-center"] },
      { key: "history", labelKey: "dc.tab.history" },
    ],
  },
  {
    key: "stocks", workspace: "boss", labelKey: "ws.stockCenter", href: "/screener",
    Icon: Search, glyph: "✦",
    tabs: [
      // P8-UI-02：产业链并入主题研究（作为其子 Tab），移除一级 industry-chain 入口。
      // 旧 industry-chain 深链继续可达 → themes（应用内 legacyRoutes）。
      { key: "screen", labelKey: "sr.tab.screen" },
      { key: "sectors", labelKey: "sr.tab.sectors", legacyRoutes: ["/sectors"] },
      { key: "themes", labelKey: "sr.tab.themes", legacyRoutes: ["/ai-theme", "/screener?tab=industry-chain"] },
      { key: "news", labelKey: "sr.tab.news", legacyRoutes: ["/news"] },
      { key: "indicators", labelKey: "sr.tab.indicators", legacyRoutes: ["/indicators"] },
      { key: "research", labelKey: "sr.tab.research" },
    ],
  },
  { key: "strategy", workspace: "boss", labelKey: "ws.strategy", href: "/strategy", Icon: LineChart, glyph: "◆" },
  { key: "trading", workspace: "boss", labelKey: "ws.myPortfolio", href: "/portfolio", Icon: Bot, glyph: "◇", badge: "Paper" },

  // ═══ 管理员工作区（P7-06：收敛为唯一入口 = Mission Control Hub，内含 8 Tab）═══
  {
    key: "system", workspace: "admin", labelKey: "ws.systemOverview", href: "/admin/mission-control",
    Icon: Settings, glyph: "⚙",
    tabs: [
      { key: "overview", labelKey: "sys.tab.overview" },
      { key: "runtime", labelKey: "sys.tab.runtime", legacyRoutes: ["/admin/runtime"] },
      { key: "health", labelKey: "sys.tab.health" },
      { key: "verify", labelKey: "sys.tab.verify", legacyRoutes: ["/admin/verify"] },
      { key: "sync", labelKey: "sys.tab.sync", legacyRoutes: ["/sync"] },
      { key: "cron", labelKey: "sys.tab.cron" },
      { key: "deploy", labelKey: "sys.tab.deploy" },
      { key: "log", labelKey: "sys.tab.log" },
    ],
  },

  // ═══ 研究工作区（P7-05：收敛为唯一入口 = 研究综合 Hub，内含 7 顶级 Tab）═══
  {
    key: "research", workspace: "research", labelKey: "ws.researchOverview", href: "/admin/research",
    Icon: Microscope, glyph: "🔬",
    tabs: [
      { key: "overview", labelKey: "rw.overview" },
      { key: "factors", labelKey: "rw.factors", legacyRoutes: ["/admin/features", "/admin/feature-promotion", "/admin/feature-platform"] },
      { key: "alpha", labelKey: "rw.alpha", legacyRoutes: ["/alpha", "/fusion/report", "/market-regime"] },
      { key: "v3", labelKey: "rw.v3" },
      { key: "learning", labelKey: "rw.learning", legacyRoutes: ["/admin/learning-report"] },
      { key: "experiments", labelKey: "rw.experiments", legacyRoutes: ["/admin/experiments", "/admin/versions"] },
      { key: "backtest", labelKey: "rw.backtest", legacyRoutes: ["/backtest"] },
    ],
  },
];

// ── 路径 → 工作区 推导（软切换核心：URL 决定当前工作区）──────────────────────
const ADMIN_PREFIXES = ["/admin/mission-control", "/sync", "/admin/verify", "/admin/runtime"];
const RESEARCH_PREFIXES = [
  "/admin/research", "/admin/features", "/admin/feature-promotion", "/admin/feature-platform",
  "/admin/learning-report", "/admin/experiments", "/admin/versions", "/backtest", "/alpha", "/fusion", "/market-regime",
];
function matchPrefix(p: string, list: string[]): boolean {
  return list.some((x) => p === x || p.startsWith(x + "/") || p.startsWith(x + "?"));
}
/** 当前路径归属的工作区。admin/research 前缀命中对应区，其余（含叶子/首页/重定向壳）归老板。 */
export function workspaceForPath(pathname: string | null | undefined): Workspace {
  const p = pathname || "/";
  if (matchPrefix(p, RESEARCH_PREFIXES)) return "research";
  if (matchPrefix(p, ADMIN_PREFIXES)) return "admin";
  return "boss";
}

// ── 派生 ────────────────────────────────────────────────────────────────────
export const nodesForWorkspace = (ws: Workspace): NavNode[] => NAV_NODES.filter((n) => n.workspace === ws);
/** 移动底栏：当前工作区节点，最多 5（老板恰 4）。 */
export const mobileBottomNodes = (ws: Workspace): NavNode[] => nodesForWorkspace(ws).slice(0, 5);

/** 一级入口 active 判定（首页精确匹配，其余前缀匹配）。 */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
}
