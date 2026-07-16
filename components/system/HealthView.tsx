"use client";

// ── 系统管理 · Health（P7-06）───────────────────────────────────────────────
// 纯展示：只读复用 GET /api/health/status（现有 Data Health Guard），零新算法/新字段。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppKpiCard, AppKpiGrid, AppLoading, AppEmptyState, COLORS } from "@/components/ui";

interface Api {
  status?: string; criticalCount?: number; warningCount?: number; passCount?: number;
  allowRecommendation?: boolean; topIssues?: { check?: string; message?: string }[];
  latestPriceDate?: string; adjCoveragePct?: number;
}

export default function HealthView() {
  const { t } = useI18n();
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    fetch("/api/health/status", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (ok) setD(j); }).finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, []);

  if (loading) return <AppLoading />;
  if (!d) return <AppEmptyState title={t("sys.noData")} />;

  const tone = (d.criticalCount ?? 0) > 0 ? "red" : (d.warningCount ?? 0) > 0 ? "amber" : "green";
  return (
    <div className="space-y-4">
      <AppKpiGrid>
        <AppKpiCard label={t("sys.status")} value={d.status ?? "—"} tone={tone} />
        <AppKpiCard label="CRITICAL" value={d.criticalCount ?? 0} tone={(d.criticalCount ?? 0) > 0 ? "red" : "green"} />
        <AppKpiCard label="WARNING" value={d.warningCount ?? 0} tone={(d.warningCount ?? 0) > 0 ? "amber" : "neutral"} />
        <AppKpiCard label="PASS" value={d.passCount ?? 0} tone="green" />
      </AppKpiGrid>
      <AppKpiGrid>
        <AppKpiCard label={t("sys.dataDate")} value={d.latestPriceDate ?? "—"} tone="blue" />
        <AppKpiCard label="adjCoverage" value={d.adjCoveragePct != null ? `${d.adjCoveragePct}%` : "—"} tone="neutral" />
        <AppKpiCard label="allowRecommendation" value={String(d.allowRecommendation ?? "—")} tone={d.allowRecommendation ? "green" : "amber"} />
      </AppKpiGrid>
      <AppCard header={<span style={{ fontWeight: 600 }}>{t("sys.topIssues")}</span>}>
        {d.topIssues && d.topIssues.length ? (
          <div className="space-y-1.5">
            {d.topIssues.map((it, i) => (
              <div key={i} className="text-[12px]" style={{ color: COLORS.textSecondary }}>
                <span style={{ color: COLORS.danger, fontWeight: 600 }}>{it.check ?? "—"}</span> · {it.message ?? ""}
              </div>
            ))}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("sys.noData")}</div>}
      </AppCard>
    </div>
  );
}
