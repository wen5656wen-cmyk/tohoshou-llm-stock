"use client";

// ── 系统工作区 Breadcrumb（P21-T5-4B）───────────────────────────────────────
//
// 全站此前**没有 Breadcrumb**（仅 /ai-theme/[theme] 有一处局部实现）。
// 跨工作区跳转后侧栏静默切换且无返回路径 —— 本组件解决「切换可感知、可返回」。
//
// 形态：  系统 › 运行状态 › 今日管线
//        ← 返回决策            ← 仅当 ?from= 指明来源工作区时出现
//
// ⚠️ 复用 lib/navigation 既有机制，不新增重复工具：
//    工作区语义沿用 nav-config 的 Workspace 类型与 WORKSPACE_HOME 映射。

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import { WORKSPACE_HOME, type Workspace } from "@/lib/navigation/nav-config";

const WS_LABEL: Record<Workspace, string> = { boss: "ws.boss", research: "ws.research", admin: "ws.admin" };

export default function SystemBreadcrumb({ stageKey, subKey }: { stageKey: string; subKey?: string }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const from = useSearchParams().get("from");
  const fromWs: Workspace | null =
    from === "boss" || from === "research" || from === "admin" ? from : null;

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 flex-wrap text-[12px]" style={{ color: COLORS.textFaint }}>
      <span style={{ color: COLORS.textSecondary }}>{tx("ws.admin")}</span>
      <span>›</span>
      <span style={{ color: subKey ? COLORS.textSecondary : COLORS.text, fontWeight: subKey ? 400 : 600 }}>
        {tx(stageKey)}
      </span>
      {subKey ? (
        <>
          <span>›</span>
          <span style={{ color: COLORS.text, fontWeight: 600 }}>{tx(subKey)}</span>
        </>
      ) : null}

      {/* 跨工作区跳入时给出返回路径 —— 让工作区切换可感知、可返回 */}
      {fromWs ? (
        <Link href={WORKSPACE_HOME[fromWs]} className="ml-auto hover:underline" style={{ color: COLORS.primary }}>
          ← {tx("sys.backTo").replace("{ws}", tx(WS_LABEL[fromWs]))}
        </Link>
      ) : null}
    </nav>
  );
}
