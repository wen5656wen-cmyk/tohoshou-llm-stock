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
// 已开放工作区（其余在切换器中灰显禁用，标注「暂未开放」）。
// P22-S3-HOTFIX：research 加入 → 导航层不再拦截「研究」，点击进入 /admin/research，
//   由页面级 BetaAccessGate 接管 admin/beta/none 三态判定。admin 仍暂缓（保持灰显）。
// boss 位置与语义不变。放开某区只需把它加进这里（单一开关）。
export const ENABLED_WORKSPACES: Workspace[] = ["boss", "research"];
export const isWorkspaceEnabled = (ws: Workspace): boolean => ENABLED_WORKSPACES.includes(ws);

export type NavNode = {
  key: string;
  /** P21-T5-4B：受众标记，为后续权限控制预留。boss = 老板可见；ops = 运维专属。 */
  audience?: "boss" | "ops";
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
  { key: "dv-overview", workspace: "boss", labelKey: "dv.nav.overview", href: "/decision-v2?tab=overview", Icon: LayoutGrid, glyph: "◎", badge: "dv.nav.badge.core" },
  // 股票中心（原「AI 推荐」）：改名 + 上移至决策总览正下方（#2）。P2 再扩为三视图枢纽。
  { key: "dv-picks", workspace: "boss", labelKey: "dv.nav.picks", href: "/decision-v2?tab=recommendations", Icon: Star, glyph: "★" },
  // 核心·每日2%计划（P26 Phase 5）：决策第 3 位（股票中心下 / 行业分析上）。独立路由 /core-daily，
  // Admin Shadow Dashboard（数据经 /api/admin/core-daily/* 且 guardAdminRoute 门控）；Shadow badge。
  { key: "dv-core-daily", workspace: "boss", labelKey: "dv.nav.coredaily", href: "/core-daily", Icon: Target, glyph: "◉", badge: "dv.nav.badge.shadow" },
  // 行业分析：上移至第三位（选股→看行业轮动→再挑股，与股票中心衔接）。
  // 复用 screener 的 sectors 页，URL 由 workspaceForPath 特判为 boss（见下），以免落入已禁用的研究区。
  { key: "dv-sectors", workspace: "boss", labelKey: "dv.nav.sectors", href: "/screener?tab=sectors", Icon: Layers, glyph: "▦" },
  // 深度研究（原「产业研究」）：改名 + 上移至第四位。P17 起指向新 Deep Research 模块 /research。
  { key: "dv-industry", workspace: "boss", labelKey: "dv.nav.industry", href: "/deep-research", Icon: Boxes, glyph: "◈", badge: "dv.nav.badge.core" },
  { key: "dv-strategy", workspace: "boss", labelKey: "dv.nav.strategy", href: "/decision-v2?tab=strategy", Icon: Target, glyph: "◆" },
  { key: "dv-portfolio", workspace: "boss", labelKey: "dv.nav.portfolio", href: "/decision-v2?tab=portfolio", Icon: PieChart, glyph: "◑", badge: "dv.nav.badge.core" },
  { key: "dv-history", workspace: "boss", labelKey: "dv.nav.history", href: "/decision-v2?tab=history", Icon: Clock, glyph: "↺" },

  // ═══ 研究工作区（Research · 股票研究 Hub + 股票研究五页 /screener?tab=*）═══
  // P21-T5-3：研究工作区 = 五阶段研究流程（导航即流程）。
  // 原本 rs-home 标签是「股票研究」却指向因子/模型 Hub，而真正的股票研究被拆成 3 个平级节点。
  { key: "rs-explore", workspace: "research", labelKey: "rw.stage1", href: "/screener?tab=sectors&ws=research", Icon: Layers, glyph: "▦" },
  { key: "rs-factors", workspace: "research", labelKey: "rw.stage2", href: "/admin/research?tab=factors", Icon: Boxes, glyph: "◈" },
  { key: "rs-analysis", workspace: "research", labelKey: "rw.stage3", href: "/admin/research?tab=analysis", Icon: Microscope, glyph: "🔬" },
  { key: "rs-experiments", workspace: "research", labelKey: "rw.stage4", href: "/admin/research?tab=experiments", Icon: Clock, glyph: "↺" },
  { key: "rs-conclusions", workspace: "research", labelKey: "rw.stage5", href: "/admin/research?tab=conclusions", Icon: Star, glyph: "★" },
  // ═══ 系统工作区（P21-T5-4B · 四阶段：运行 → 监控 → 维护 → 操作）═══
  // audience 为后续权限控制预留：boss 可见 / ops 运维专属。
  // ⚠️ sys-ops 是唯一含写操作的节点，UI 上以分隔线 + ⚠ 与只读区切开。
  { key: "sys-runtime", workspace: "admin", labelKey: "sys.stage1", href: "/admin/mission-control?tab=runtime", Icon: Settings, glyph: "⚙", audience: "boss" },
  { key: "sys-health", workspace: "admin", labelKey: "sys.stage2", href: "/admin/mission-control?tab=health", Icon: Boxes, glyph: "◈", audience: "boss" },
  { key: "sys-maintenance", workspace: "admin", labelKey: "sys.stage3", href: "/admin/mission-control?tab=maintenance", Icon: Layers, glyph: "▦", audience: "ops" },
  { key: "sys-ops", workspace: "admin", labelKey: "sys.stage4", href: "/admin/mission-control?tab=ops", Icon: Clock, glyph: "⚠", audience: "ops" },
];

// ── 路径 → 工作区 推导（软切换核心：URL 决定当前工作区）──────────────────────
// ⚠️ P21-T5-1：本列表与 RESEARCH_PREFIXES **不得有交集** —— workspaceForPath 先匹配
//    RESEARCH 再匹配 ADMIN，双命中时 ADMIN 侧永远不生效（D1：/admin/learning-report
//    曾同时出现在两边）。新增前缀前请先确认另一侧没有。
//    /admin/mission-audit 原本两边都没有 → 回落 boss，一个管理页出现在老板工作区（D2）。
const ADMIN_PREFIXES = ["/admin/mission-control", "/sync", "/admin/verify", "/admin/runtime", "/admin/universe", "/admin/mission-audit"];
const RESEARCH_PREFIXES = [
  // 研究工作区：研究综合 Hub + 股票研究（screener 及其旧深链重定向桩）+ 量化研究
  "/admin/research", "/admin/features", "/admin/feature-promotion", "/admin/feature-platform",
  "/admin/learning-report", "/admin/experiments", "/admin/versions", "/backtest", "/alpha", "/fusion", "/market-regime",
  "/screener", "/sectors", "/ai-theme", "/news",
];
function matchPrefix(p: string, list: string[]): boolean {
  return list.some((x) => p === x || p.startsWith(x + "/") || p.startsWith(x + "?"));
}
/**
 * 决策工作区借用 screener 的两个 tab（行业分析=sectors / 产业研究=themes）。
 *
 * ⚠️ P21-T3：这个特判曾是研究工作区的**开放阻断项** —— 研究侧栏的 rs-sectors /
 * rs-themes 指向同样的 URL，用户点进去后 workspaceForPath 把它判回 boss，
 * 侧栏整个弹回决策区、研究项永远无法 active。
 *
 * 修法：URL 显式携带 `ws=research` 时以其为准（见 workspaceForPath）。
 * 这样同一个页面可服务两个工作区而不互相踩踏，且不需要动老板现有导航
 * （boss 的 dv-sectors 在研究区开放前仍是老板访问行业轮动的唯一途径）。
 *
 * 遗留：boss 与 research 同时拥有 sectors 入口属「重复入口」，按 P21-T1 裁决
 * 应在 P21-T8 开放工作区时把 dv-sectors 从 boss 移除。本轮不动（会造成能力回退）。
 */
const BOSS_SCREENER_TABS = new Set(["sectors", "themes"]);
/** URL 显式工作区提示参数（research 侧栏链接携带）。 */
export const WS_HINT_PARAM = "ws";
/**
 * 当前路径归属的工作区。research/admin 前缀命中对应区，其余（含决策/首页/回退壳）归决策(boss)。
 * tab 感知：/screener?tab=sectors|themes 属决策(boss)，其余 /screener 属研究(research)。
 * 注：usePathname() 不含 query，故调用方需显式把当前 ?tab 传入才能命中特判。
 */
export function workspaceForPath(
  pathname: string | null | undefined,
  tab?: string | null,
  wsHint?: string | null,
): Workspace {
  const p = pathname || "/";
  const base = p.split("?")[0];
  // P21-T3：显式提示优先于任何路径/tab 推导，消除 boss/research 争抢同一 URL。
  if (wsHint === "boss" || wsHint === "research" || wsHint === "admin") return wsHint;
  if (base === "/screener") {
    // tab 未传时回退从 pathname 里解析（防御：某些调用方可能带 query）。
    const t = tab ?? (p.includes("?") ? new URLSearchParams(p.split("?")[1]).get("tab") : null);
    if (t && BOSS_SCREENER_TABS.has(t)) return "boss";
  }
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
