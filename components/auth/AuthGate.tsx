"use client";

// ── 未登录访问闸门（P21-P0-API-G2）───────────────────────────────────────────
//
// 背景：G1/G2 把资产与内部研究接口全部改为 401 后，**页面本身仍公开可打开**
// （middleware 只管 /api/*）。于是未登录访问 Research / System / Strategy /
// Fusion 时，各面板拿到 401 却各自渲染成「データなし」「—」「PASS 0」——
//
//   System 健康页尤其危险：未登录时显示 CRITICAL 0 / WARNING 0 / PASS 0，
//   看起来像「系统零问题」，实际是「没权限读」。这是假的绿灯，
//   与 P21-P0-Health 修掉的写死绿灯属同一类错误。
//
// 本组件是**最小状态兼容**：在页面渲染前问一次「当前是否已登录」，
// 未登录就整页显示登录提示 + 入口，不进入面板。
//
// ⚠️ 刻意的边界：
//   · 不新增任何认证实现 —— 只读 GET /api/admin/session（middleware 已豁免，
//     只回 { authenticated: boolean }，绝不回显 token）
//   · 不改任何面板、不改 IA、不改导航 —— 只在最外层加一道闸
//   · 判定失败（网络异常等）时**放行**：闸门只负责说清楚，
//     真正的访问控制在服务端 middleware + route guard，此处失效不构成安全缺口

import { useEffect, useState, type ReactNode } from "react";
import { AppLoading } from "@/components/ui";
import DecisionStateNotice from "@/components/decision/DecisionStateNotice";

export default function AuthGate({ titleKey, children }: { titleKey: string; children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/session", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setOk(j?.authenticated !== false); })   // 判不出 → 放行
      .catch(() => { if (alive) setOk(true); });
    return () => { alive = false; };
  }, []);

  if (ok === null) return <AppLoading />;
  if (!ok) return <DecisionStateNotice status="UNAUTHORIZED" titleKey={titleKey} />;
  return <>{children}</>;
}
