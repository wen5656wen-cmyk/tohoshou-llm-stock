"use client";

// ── 决策数据加载状态提示（P21-P0-Boss）───────────────────────────────────────
//
// 全站唯一的「决策数据取不到时说什么」实现。首页与 /decision-v2 共用，
// 避免两处各写一套后再次分叉出「401 显示成无数据」这类假话。
//
// 铁律：**页面说的必须是真的**。
//   · 未登录  → 说未登录，并给出登录入口（而不是「暂无数据」）
//   · 服务端错 → 说暂时无法加载（而不是「暂无数据」）
//   · 断网    → 说网络失败（而不是「暂无数据」）
//   · 只有服务端 200 且明确无内容，才允许说「暂无今日决策数据」
//
// 登录入口带 ?next=<当前页含 query>，登录后原地返回；next 的合法性由
// /admin/login 侧校验（仅允许站内相对路径），此处不做第二套判断。

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import type { LoadStatus } from "@/lib/decision/provider";

/** 由当前页构造登录跳转地址（含 query，登录后精确回到原视图）。 */
export function useLoginHref(): string {
  const pathname = usePathname();
  const sp = useSearchParams().toString();
  return `/admin/login?next=${encodeURIComponent(`${pathname}${sp ? `?${sp}` : ""}`)}`;
}

/**
 * 非 READY 状态的统一呈现。READY 时返回 null，由调用方渲染正常内容。
 * `compact` 用于卡片内的小块占位（首页 Section 内），默认为整页居中样式。
 */
export default function DecisionStateNotice({
  status,
  compact = false,
  onRetry,
}: {
  status: LoadStatus;
  compact?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const loginHref = useLoginHref();

  if (status === "READY") return null;

  const msg =
    status === "UNAUTHORIZED" ? tx("dc.state.unauthorized")
    : status === "SERVER_ERROR" ? tx("dc.state.serverError")
    : status === "NETWORK_ERROR" ? tx("dc.state.networkError")
    : tx("dc.ov.noData");

  const action =
    status === "UNAUTHORIZED" ? (
      <Link
        href={loginHref}
        className="inline-flex items-center h-8 px-3.5 rounded-lg text-[12px] font-semibold"
        style={{ background: COLORS.primary, color: "#fff" }}
      >
        {tx("dc.state.loginCta")} →
      </Link>
    ) : status === "NETWORK_ERROR" && onRetry ? (
      <button
        onClick={onRetry}
        className="inline-flex items-center h-8 px-3.5 rounded-lg text-[12px] font-semibold"
        style={{ background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
      >
        {tx("dc.state.retry")}
      </button>
    ) : null;

  if (compact) {
    return (
      <div className="text-[13px] flex flex-wrap items-center gap-2" style={{ color: COLORS.textFaint }}>
        <span>{msg}</span>
        {action}
      </div>
    );
  }

  return (
    <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-14 text-center">
      <div className="text-[15px] font-semibold" style={{ color: COLORS.text }}>{tx("dv.ov2.title")}</div>
      <div className="text-[12px] mt-1.5" style={{ color: COLORS.textSecondary }}>{msg}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
