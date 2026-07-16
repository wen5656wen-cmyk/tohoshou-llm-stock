"use client";

// ── 系统管理 · Cron（P7-06）─────────────────────────────────────────────────
// 纯展示：只读复用 GET /api/admin/mission-control 的 todayPipeline + pm2.cron，零新算法/新字段。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppKpiCard, AppKpiGrid, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";

interface Step { name?: string; label?: string; status?: string }
interface Api {
  todayPipeline?: { completedSteps?: number; totalSteps?: number; completionPct?: number; failedCount?: number; steps?: Step[] };
  pm2?: { cron?: { status?: string; uptime?: string } | null };
}
const tone = (s?: string) => s === "SUCCESS" || s === "DONE" || s === "PASS" ? "green" : s === "FAILED" ? "red" : "amber";

export default function CronView() {
  const { t } = useI18n();
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    fetch("/api/admin/mission-control", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (ok) setD(j); }).finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, []);

  if (loading) return <AppLoading />;
  if (!d) return <AppEmptyState title={t("sys.noData")} />;
  const tp = d.todayPipeline;
  const steps = tp?.steps ?? [];

  return (
    <div className="space-y-4">
      <AppKpiGrid>
        <AppKpiCard label={t("sys.completed")} value={`${tp?.completedSteps ?? 0}/${tp?.totalSteps ?? 0}`} tone="blue" />
        <AppKpiCard label="%" value={tp?.completionPct != null ? `${tp.completionPct}%` : "—"} tone={tp?.completionPct === 100 ? "green" : "amber"} />
        <AppKpiCard label="FAILED" value={tp?.failedCount ?? 0} tone={(tp?.failedCount ?? 0) > 0 ? "red" : "green"} />
        <AppKpiCard label="PM2 cron" value={d.pm2?.cron?.status ?? "—"} tone={d.pm2?.cron?.status === "online" ? "green" : "amber"} />
      </AppKpiGrid>
      <AppCard header={<span style={{ fontWeight: 600 }}>{t("sys.pipeline")}</span>}>
        {steps.length ? (
          <div className="space-y-1">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-[12px]" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ color: COLORS.text }}>{s.label ?? s.name ?? "—"}</span>
                <AppBadge tone={tone(s.status)}>{s.status ?? "—"}</AppBadge>
              </div>
            ))}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("sys.noData")}</div>}
      </AppCard>
    </div>
  );
}
