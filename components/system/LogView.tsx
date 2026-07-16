"use client";

// ── 系统管理 · 日志（P7-06）─────────────────────────────────────────────────
// 纯展示：只读复用 GET /api/admin/runtime（现有 Pipeline/GPT 日志，logs/*.jsonl），
// 不新增日志系统、零新算法/新字段。日志聚焦视图（Runtime Tab 为可靠性面板）。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppKpiCard, AppKpiGrid, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";

interface Entry { phase?: string; step?: string; status?: string; durationMs?: number; ts?: string }
interface Api {
  reliabilitySummary?: { passDays?: number; warnDays?: number; totalDays?: number };
  gpt?: { model?: string; tokens?: number; calls?: number; err429?: number };
  latestTimelineDate?: string; latestTimeline?: Entry[];
}

export default function LogView() {
  const { t } = useI18n();
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    fetch("/api/admin/runtime", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (ok) setD(j); }).finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, []);

  if (loading) return <AppLoading />;
  if (!d) return <AppEmptyState title={t("sys.noData")} />;
  const rs = d.reliabilitySummary;
  const entries = d.latestTimeline ?? [];

  return (
    <div className="space-y-4">
      <AppKpiGrid>
        <AppKpiCard label="Reliability" value={rs ? `${rs.passDays ?? 0}/${rs.totalDays ?? 0}` : "—"} tone="green" />
        <AppKpiCard label="GPT model" value={d.gpt?.model ?? "—"} tone="blue" />
        <AppKpiCard label="GPT tokens" value={d.gpt?.tokens ?? "—"} tone="neutral" />
        <AppKpiCard label="429" value={d.gpt?.err429 ?? 0} tone={(d.gpt?.err429 ?? 0) > 0 ? "red" : "green"} />
      </AppKpiGrid>
      <AppCard header={<span style={{ fontWeight: 600 }}>{t("sys.recentLog")}{d.latestTimelineDate ? ` · ${d.latestTimelineDate}` : ""}</span>}>
        {entries.length ? (
          <div className="space-y-1">
            {entries.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-[12px] font-mono" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ color: COLORS.text }}>{e.phase ?? e.step ?? "—"}</span>
                <span className="flex items-center gap-2">
                  {e.durationMs != null && <span style={{ color: COLORS.textFaint }}>{Math.round(e.durationMs / 100) / 10}s</span>}
                  <AppBadge tone={e.status === "SUCCESS" || e.status === "DONE" ? "green" : e.status === "FAILED" ? "red" : "neutral"}>{e.status ?? "—"}</AppBadge>
                </span>
              </div>
            ))}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("sys.noData")}</div>}
      </AppCard>
    </div>
  );
}
