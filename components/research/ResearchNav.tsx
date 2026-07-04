"use client";

// ── AI 研究中心 · 两级分组导航（Apple Dashboard 浅色）──────────────────────────
// 展示层，仅路由现有 `tab` state；未改任何数据/逻辑。

const M = { bg: "#F7F8FA", panel: "#FFFFFF", track: "#EEF0F4", border: "#E7EAF0", ink: "#1D1D1F", sub: "#6E6E73", faint: "#A1A1A6", blue: "#007AFF" };
const SHADOW_SM = "0 1px 3px rgba(0,0,0,0.04)";

export type NavTab = { key: string; label: string };
export const NAV_GROUPS: { label: string; tabs: NavTab[] }[] = [
  { label: "综合", tabs: [{ key: "overview", label: "综合驾驶舱" }] },
  { label: "因子研究", tabs: [{ key: "factors", label: "Alpha因子库" }, { key: "analytics", label: "因子分析" }] },
  { label: "Shadow · Alpha", tabs: [{ key: "score", label: "影子评分" }, { key: "backtest", label: "Alpha策略回测" }] },
  { label: "市场与融合", tabs: [{ key: "regime", label: "市场状态" }, { key: "fusion", label: "AI融合策略研究" }] },
  { label: "V3", tabs: [{ key: "v3", label: "V3动态评分" }, { key: "calibration", label: "V3 Calibration" }, { key: "freeze", label: "V3 Freeze Monitor" }] },
];

export function ResearchNav({ tab, setTab }: { tab: string; setTab: (k: string) => void }) {
  const activeGroupIdx = Math.max(0, NAV_GROUPS.findIndex((g) => g.tabs.some((t) => t.key === tab)));
  const subTabs = NAV_GROUPS[activeGroupIdx].tabs;

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: `${M.bg}f2`, backdropFilter: "saturate(180%) blur(12px)", borderBottom: `1px solid ${M.border}` }}>
      <div className="mx-auto max-w-[1600px] px-5 lg:px-8 py-3">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[13px]" style={{ background: `${M.blue}14`, color: M.blue }}>◆</span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: M.ink }}>AI 研究中心</span>
          <span className="text-[11px] hidden sm:inline" style={{ color: M.faint }}>Research Platform</span>
        </div>

        {/* Tier 1 — group pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {NAV_GROUPS.map((g, i) => {
            const on = i === activeGroupIdx;
            return (
              <button key={g.label} onClick={() => setTab(g.tabs[0].key)}
                className="text-[13px] font-semibold px-3.5 h-8 rounded-full transition-all"
                style={on ? { background: M.blue, color: "#fff", boxShadow: SHADOW_SM } : { background: M.panel, border: `1px solid ${M.border}`, color: M.sub }}>
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Tier 2 — sub-tabs of active group (only when >1) */}
        {subTabs.length > 1 && (
          <div className="inline-flex mt-2.5 p-1 rounded-full" style={{ background: M.track, border: `1px solid ${M.border}` }}>
            {subTabs.map((t) => {
              const on = t.key === tab;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className="text-[12px] font-semibold px-3.5 h-7 rounded-full transition-all whitespace-nowrap"
                  style={on ? { background: M.panel, color: M.ink, boxShadow: SHADOW_SM } : { color: M.sub }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
