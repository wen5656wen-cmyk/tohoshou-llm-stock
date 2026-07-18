"use client";

// ── 工作区切换器（P7-04A · 目标 IA：决策先行）──────────────────────────────
// [决策] [研究] [管理] 轻量分段控件。当前工作区由 URL 推导（useWorkspace），
// 故导航后高亮自动跟随，无需本地状态。
// 研究/管理为「暂不开发」：灰显、不可点、aria-disabled，控件下方统一标注。
// 放开某工作区只需在 nav-config.ts 的 ENABLED_WORKSPACES 增加它（单一开关）。

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useWorkspace, persistWorkspace } from "@/lib/navigation/workspace";
import { WORKSPACES, WORKSPACE_HOME, isWorkspaceEnabled, type Workspace } from "@/lib/navigation/nav-config";

const LABEL_KEY: Record<Workspace, string> = { boss: "ws.boss", admin: "ws.admin", research: "ws.research" };

export default function WorkspaceSwitcher({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const current = useWorkspace();

  const go = (ws: Workspace) => {
    if (ws === current || !isWorkspaceEnabled(ws)) return;
    persistWorkspace(ws);
    router.push(WORKSPACE_HOME[ws]);
  };

  const trackBg = dark ? "rgba(255,255,255,0.06)" : "#F0F0F3";
  const idleColor = dark ? "#9aa4b2" : "#6e6e73";
  const disabledColor = dark ? "#5b6472" : "#B0B3BA";
  // 段控件：高 40 / 圆角 12；Active 蓝底，Inactive 白底（浅色）
  const idleBg = dark ? "transparent" : "#FFFFFF";

  const hasDisabled = WORKSPACES.some((ws) => !isWorkspaceEnabled(ws));

  return (
    <div>
      <div className="flex items-center w-full" style={{ height: 40, gap: 4, padding: 4, borderRadius: 12, background: trackBg }}>
        {WORKSPACES.map((ws) => {
          const enabled = isWorkspaceEnabled(ws);
          const on = ws === current && enabled;
          return (
            <button
              key={ws}
              onClick={() => go(ws)}
              disabled={!enabled}
              title={enabled ? undefined : t("ws.comingSoon")}
              className={`flex-1 h-full text-[12px] font-semibold transition-colors text-center ${enabled ? "" : "cursor-not-allowed"}`}
              style={{
                borderRadius: 8,
                background: on ? "#007AFF" : enabled ? idleBg : "transparent",
                color: on ? "#fff" : enabled ? idleColor : disabledColor,
                opacity: enabled ? 1 : 0.55,
                boxShadow: on ? "0 1px 2px rgba(0,0,0,0.10)" : enabled && !dark ? "0 1px 1px rgba(0,0,0,0.04)" : "none",
              }}
              aria-pressed={on}
              aria-disabled={!enabled}
            >
              {t(LABEL_KEY[ws] as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>
      {hasDisabled && (
        <div className="px-1 pt-1.5 text-center" style={{ fontSize: 11, color: disabledColor }}>
          {t("ws.comingSoon")}
        </div>
      )}
    </div>
  );
}
