"use client";

// ── 工作区状态（P7-04A）────────────────────────────────────────────────────
// 当前工作区 = URL 推导（workspaceForPath）为权威，localStorage 仅作记忆/默认。
// 刷新保持（URL 不变）、直接访问某工作区页面自动同步、新浏览器默认老板。
// 不使用数据库、不新增鉴权。

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { workspaceForPath, WS_HINT_PARAM, type Workspace } from "./nav-config";

const KEY = "tohoshou.workspace";

export function persistWorkspace(ws: Workspace): void {
  try { localStorage.setItem(KEY, ws); } catch { /* SSR / 隐私模式忽略 */ }
}

export function readWorkspace(): Workspace | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "boss" || v === "admin" || v === "research" ? v : null;
  } catch { return null; }
}

/**
 * 当前工作区（由 URL 推导）。副作用：持久化到 localStorage。
 * tab 感知：读取 ?tab，使 /screener?tab=sectors|themes 正确归入决策(boss)。
 * useSearchParams 需 Suspense 边界 —— 调用方（WorkspaceSwitcher）已包在 Suspense 内。
 */
export function useWorkspace(): Workspace {
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = sp.get("tab");
  // P21-T3：URL 显式 ?ws= 提示优先，使 /screener?tab=sectors 能同时服务
  // 决策区（无提示）与研究区（ws=research），不再互相弹出。
  const wsHint = sp.get(WS_HINT_PARAM);
  const workspace = workspaceForPath(pathname, tab, wsHint);
  useEffect(() => { persistWorkspace(workspace); }, [workspace]);
  return workspace;
}
