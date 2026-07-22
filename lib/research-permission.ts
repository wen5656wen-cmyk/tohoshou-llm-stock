"use client";

// ── P22-S4 · 研究工作区权限的**唯一来源**─────────────────────────────────────
//
// 铁律：UI 可见 = 实际可访问。禁止在页面里到处写 if(beta)/if(admin) ——
// 那必然与后端白名单分叉，出现「点进去才 401」。整个研究工作区只引用这一份。
//
// 判据是客观的：一个功能 beta 是否可见 == 它依赖的 API 是否在 beta 白名单
// （lib/beta-access.ts）。下表**逐条对应**那个白名单，改白名单必须同步改这里。
//
//   feature key         依赖 API                     beta
//   factors.lib         /api/alpha                   ✅
//   analysis.score      /api/alpha/score             ✅
//   analysis.analytics  /api/alpha/report            ✅
//   analysis.fusion     /api/fusion/report           ✅
//   analysis.regime     /api/regime（公开）           ✅
//   experiments.backtest /api/alpha/backtest         ✅
//   strategy.STABILIZATION /api/strategy/validation  ✅  ← Strategy Validation
//   ────────────────────────── 以下非白名单，beta 隐藏（否则点进去 401）──────
//   analysis.shadow     /api/scoring-v3/shadow       ❌ Shadow
//   analysis.calibration /api/scoring-v3/calibration ❌ Calibration
//   factors.registry/promotion/platform  /api/admin/* ❌ Admin Tool
//   experiments.versions /api/admin/versions*        ❌ Internal Experiment
//   conclusions.learning /api/admin/learning-report  ❌ Admin Tool
//   strategy.DAY/SWING/LONG /api/strategy/[type]     ❌
//   strategy.REPORTS    /api/reports/*（非开放清单）  ❌

import { useEffect, useState } from "react";

/** beta 可见的功能白名单（admin 永远可见全部，不在此判定内）。 */
export const BETA_VISIBLE_FEATURES: ReadonlySet<string> = new Set([
  "factors.lib",
  "analysis.score",
  "analysis.analytics",
  "analysis.fusion",
  "analysis.regime",
  "experiments.backtest",
  "strategy.STABILIZATION",
]);

export type ResearchRole = "admin" | "beta" | "none";

export interface ResearchPermission {
  role: ResearchRole;
  loading: boolean;
  isAdmin: boolean;
  isBeta: boolean;
  /** 该功能当前是否可见/可访问。admin → 全可见；beta → 查白名单；none → 全不可见。 */
  canSee: (featureKey: string) => boolean;
}

/**
 * 统一权限判定。整个研究工作区（Research Hub / Strategy 页 等）只调这一个。
 * 数据源 = GET /api/beta/session 的 via（"admin" 超集 / "beta" / null）。
 */
export function useResearchPermission(): ResearchPermission {
  const [role, setRole] = useState<ResearchRole | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/beta/session", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setRole(j?.via === "admin" ? "admin" : j?.via === "beta" ? "beta" : "none"); })
      .catch(() => { if (alive) setRole("none"); });
    return () => { alive = false; };
  }, []);

  const resolved: ResearchRole = role ?? "none";
  return {
    role: resolved,
    loading: role === null,
    isAdmin: resolved === "admin",
    isBeta: resolved === "beta",
    canSee: (featureKey: string) =>
      resolved === "admin" ? true : resolved === "beta" ? BETA_VISIBLE_FEATURES.has(featureKey) : false,
  };
}
