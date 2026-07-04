"use client";

// ── AI Command Center (AI 指挥中心) — Dashboard + Screener merged ──────────────
// Composition-only: reuses existing DashboardView sub-parts + ScreenerBody.
// No data/API/scoring/filter logic changed — all read from existing endpoints.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CmdHeader, TodayIntelligence, SystemHealth, MarketRow,
  type DashboardData,
} from "@/components/dashboard/DashboardView";
import { ScreenerBody } from "@/components/screener/ScreenerBody";

export function CommandCenter({ data }: { data: DashboardData }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
      <div className="mx-auto max-w-[1600px] px-5 lg:px-7 xl:px-9 py-4 flex flex-col gap-3">
        <CmdHeader greetKey={data.greetKey} />

        {/* 1 — Today Intelligence + System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 dash-in" style={{ animationDelay: "30ms" }}>
          <div className="lg:col-span-8 min-h-0"><TodayIntelligence intel={data.intelligence} hero={data.hero} marketDate={data.marketDate} /></div>
          <div className="lg:col-span-4 min-h-0"><SystemHealth health={data.health} systemStatus={data.systemStatus} pipeline={data.pipeline} /></div>
        </div>

        {/* 2 — Market overview */}
        <div className="dash-in" style={{ animationDelay: "60ms" }}><MarketRow market={data.market} /></div>

        {/* 3-5 — Screener: rec summary + filters + stock cards + pagination */}
        <div className="dash-in" style={{ animationDelay: "90ms" }}><ScreenerBody embedded /></div>
      </div>
    </div>
  );
}
