"use client";
// Strategy 模块 · Hooks（P4-T3，集中数据/状态；fetch 逻辑逐字保留）
import { useEffect, useState } from "react";
import type { OverviewData, ActiveTab } from "./types";

export function useStrategyOverview() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  useEffect(() => {
    fetch("/api/strategy/overview")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: OverviewData) => { setOverview(d); setOverviewLoading(false); })
      .catch(() => setOverviewLoading(false));
  }, []);
  return { overview, overviewLoading };
}

export function useStrategyTabs(initial: ActiveTab = "DAY_TRADE") {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initial);
  return { activeTab, setActiveTab };
}
