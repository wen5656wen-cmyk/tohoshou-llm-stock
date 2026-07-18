"use client";

// ── 工作区切换器（P7-04A）──────────────────────────────────────────────────
// [老板] [管理员] [研究] 轻量分段控件。点击 → 导航到该工作区默认首页 + 记忆。
// 当前工作区由 URL 推导（useWorkspace），故导航后高亮自动跟随，无需本地状态。

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useWorkspace, persistWorkspace } from "@/lib/navigation/workspace";
import { WORKSPACES, WORKSPACE_HOME, type Workspace } from "@/lib/navigation/nav-config";

const LABEL_KEY: Record<Workspace, string> = { boss: "ws.boss", admin: "ws.admin", research: "ws.research" };

export default function WorkspaceSwitcher({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const current = useWorkspace();

  const go = (ws: Workspace) => {
    if (ws === current) return;
    persistWorkspace(ws);
    router.push(WORKSPACE_HOME[ws]);
  };

  const trackBg = dark ? "rgba(255,255,255,0.06)" : "#F0F0F3";
  const idleColor = dark ? "#9aa4b2" : "#6e6e73";
  // 段控件：高 40 / 圆角 12；Active 蓝底，Inactive 白底（浅色）
  const idleBg = dark ? "transparent" : "#FFFFFF";

  return (
    <div className="flex items-center w-full" style={{ height: 40, gap: 4, padding: 4, borderRadius: 12, background: trackBg }}>
      {WORKSPACES.map((ws) => {
        const on = ws === current;
        return (
          <button
            key={ws}
            onClick={() => go(ws)}
            className="flex-1 h-full text-[12px] font-semibold transition-colors text-center"
            style={{
              borderRadius: 8,
              background: on ? "#007AFF" : idleBg,
              color: on ? "#fff" : idleColor,
              boxShadow: on ? "0 1px 2px rgba(0,0,0,0.10)" : dark ? "none" : "0 1px 1px rgba(0,0,0,0.04)",
            }}
            aria-pressed={on}
          >
            {t(LABEL_KEY[ws] as Parameters<typeof t>[0])}
          </button>
        );
      })}
    </div>
  );
}
