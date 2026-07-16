"use client";

// ── 系统管理 · 部署（P7-06）─────────────────────────────────────────────────
// 纯展示：只读复用 GET /api/admin/deployments（现有部署记录），零新算法/新字段。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";

interface Row {
  id: number; commitHash?: string; summary?: string; buildStatus?: string; healthStatus?: string;
  productionReady?: boolean; operator?: string; createdAt?: string;
}
interface Api { total?: number; rows?: Row[] }

export default function DeployView() {
  const { t } = useI18n();
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    fetch("/api/admin/deployments", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (ok) setD(j); }).finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, []);

  if (loading) return <AppLoading />;
  const rows = d?.rows ?? [];
  if (!rows.length) return <AppEmptyState title={t("sys.noData")} />;

  return (
    <AppCard header={<span style={{ fontWeight: 600 }}>{t("sys.recentDeploy")} · {d?.total ?? rows.length}</span>}>
      <div className="space-y-2">
        {rows.slice(0, 20).map((r) => (
          <div key={r.id} className="py-1.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-mono" style={{ color: COLORS.primary }}>{r.commitHash ?? "—"}</span>
              <AppBadge tone={r.productionReady ? "green" : "amber"}>{r.buildStatus ?? "—"}</AppBadge>
              {r.createdAt && <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{r.createdAt.slice(0, 16).replace("T", " ")}</span>}
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: COLORS.textSecondary }}>{r.summary ?? ""}</div>
          </div>
        ))}
      </div>
    </AppCard>
  );
}
