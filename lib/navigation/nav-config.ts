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
  LayoutGrid, Target, Star, PieChart, Clock,
  Microscope, SlidersHorizontal, Layers, Boxes, Newspaper, BarChart3, Settings,
} from "@/components/dashboard/icons";

export type NavIcon = (p: { size?: number; strokeWidth?: number }) => React.ReactElement;
export type Workspace = "boss" | "admin" | "research";
// 工作区顺序（P14-UI-03）：决策 → 研究 → 管理
export const WORKSPACES: Workspace[] = ["boss", "research", "admin"];

export type NavNode = {
  key: string;
  labelKey: string;
  href: string;
  Icon: NavIcon;
  glyph: string;
  badge?: string;
  workspace: Workspace;
};

// ── 三工作区默认落地页 ──────────────────────────────────────────────────────
export const WORKSPACE_HOME: Record<Workspace, string> = {
  boss: "/decision-v2?tab=overview",
  research: "/admin/research",
  admin: "/admin/mission-control",
};

// ── 全部导航项（按工作区展开为一级页面清单）───────────────────────────────────
// P14-UI-03 IA v1.0：左侧 = 当前工作区的一级页面清单（内容区不再放同名一级 Tab）。
export const NAV_NODES: NavNode[] = [
  // ═══ 决策工作区（Decision · 5 页 → /decision-v2?tab=*）═══
  { key: "dv-overview", workspace: "boss", labelKey: "dv.nav.overview", href: "/decision-v2?tab=overview", Icon: LayoutGrid, glyph: "◎" },
  { key: "dv-strategy", workspace: "boss", labelKey: "dv.nav.strategy", href: "/decision-v2?tab=strategy", Icon: Target, glyph: "◆" },
  { key: "dv-picks", workspace: "boss", labelKey: "dv.nav.picks", href: "/decision-v2?tab=recommendations", Icon: Star, glyph: "★" },
  { key: "dv-portfolio", workspace: "boss", labelKey: "dv.nav.portfolio", href: "/decision-v2?tab=portfolio", Icon: PieChart, glyph: "◑" },
  { key: "dv-history", workspace: "boss", labelKey: "dv.nav.history", href: "/decision-v2?tab=history", Icon: Clock, glyph: "↺" },

  // ═══ 研究工作区（Research · 股票研究 Hub + 股票研究五页 /screener?tab=*）═══
  { key: "rs-home", workspace: "research", labelKey: "nav.researchHome", href: "/admin/research", Icon: Microscope, glyph: "🔬" },
  { key: "rs-screen", workspace: "research", labelKey: "sr.tab.screen", href: "/screener?tab=screen", Icon: SlidersHorizontal, glyph: "✦" },
  { key: "rs-sectors", workspace: "research", labelKey: "sr.tab.sectors", href: "/screener?tab=sectors", Icon: Layers, glyph: "▦" },
  { key: "rs-themes", workspace: "research", labelKey: "sr.tab.themes", href: "/screener?tab=themes", Icon: Boxes, glyph: "◈" },
  { key: "rs-news", workspace: "research", labelKey: "sr.tab.news", href: "/screener?tab=news", Icon: Newspaper, glyph: "▤" },
  { key: "rs-indicators", workspace: "research", labelKey: "sr.tab.indicators", href: "/screener?tab=indicators", Icon: BarChart3, glyph: "▮" },

  // ═══ 管理工作区（Management · 保留现有入口 = Mission Control Hub，本轮不重构）═══
  { key: "system", workspace: "admin", labelKey: "ws.systemOverview", href: "/admin/mission-control", Icon: Settings, glyph: "⚙" },
];

// ── 路径 → 工作区 推导（软切换核心：URL 决定当前工作区）──────────────────────
const ADMIN_PREFIXES = ["/admin/mission-control", "/sync", "/admin/verify", "/admin/runtime"];
const RESEARCH_PREFIXES = [
  // 研究工作区：研究综合 Hub + 股票研究（screener 及其旧深链重定向桩）+ 量化研究
  "/admin/research", "/admin/features", "/admin/feature-promotion", "/admin/feature-platform",
  "/admin/learning-report", "/admin/experiments", "/admin/versions", "/backtest", "/alpha", "/fusion", "/market-regime",
  "/screener", "/sectors", "/ai-theme", "/news", "/indicators", "/stocks",
];
function matchPrefix(p: string, list: string[]): boolean {
  return list.some((x) => p === x || p.startsWith(x + "/") || p.startsWith(x + "?"));
}
/** 当前路径归属的工作区。research/admin 前缀命中对应区，其余（含决策/首页/回退壳）归决策(boss)。 */
export function workspaceForPath(pathname: string | null | undefined): Workspace {
  const p = pathname || "/";
  if (matchPrefix(p, RESEARCH_PREFIXES)) return "research";
  if (matchPrefix(p, ADMIN_PREFIXES)) return "admin";
  return "boss";
}

// ── 派生 ────────────────────────────────────────────────────────────────────
export const nodesForWorkspace = (ws: Workspace): NavNode[] => NAV_NODES.filter((n) => n.workspace === ws);
/** 移动底栏：当前工作区节点，最多 5。 */
export const mobileBottomNodes = (ws: Workspace): NavNode[] => nodesForWorkspace(ws).slice(0, 5);

// ── 当前项 active 判定（tab 感知：/decision-v2 与 /screener 用 ?tab 区分同基址多项）──
function normTab(base: string, tab: string | null | undefined): string {
  if (base === "/decision-v2") {
    if (tab == null || tab === "") return "overview";
    if (tab === "picks") return "recommendations";
    if (tab === "today") return "strategy";
    return tab;
  }
  if (base === "/screener") return tab && tab !== "" ? tab : "screen";
  return tab ?? "";
}
/** tab 感知的一级项 active 判定。tab = 当前 URL 的 ?tab 值（可空）。 */
export function navItemActive(href: string, pathname: string, tab: string | null | undefined): boolean {
  if (href === "/") return pathname === "/";
  const [base, q] = href.split("?");
  const hrefTab = q ? new URLSearchParams(q).get("tab") : null;
  if (hrefTab != null) {
    if (pathname !== base) return false;
    return normTab(base, hrefTab) === normTab(base, tab);
  }
  return pathname === base || pathname.startsWith(base + "/");
}
/** 兼容旧签名（无 tab）。仅用于不便取 searchParams 处；同基址多项场景请用 navItemActive。 */
export function isNavActive(href: string, pathname: string): boolean {
  return navItemActive(href, pathname, null);
}
