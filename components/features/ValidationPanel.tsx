"use client";

// ── Feature Validation Dashboard（P6-T5）────────────────────────────────────
// /admin/features 的 Validation Tab。只读展示验证引擎结果（Coverage/Sample/HitRate/
// Alpha/Confidence/Stage/Recommendation）。**不参与任何计算、不影响评分。**
// 当前 shadow 因子无 Backtest 样本 → pending（WATCH，统计显示「—」），不实际淘汰/提升。

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  AppCard, AppKpiCard, AppKpiGrid, AppTable, AppTh, AppTd, AppStatusChip, AppButton,
  appRowHover, COLORS,
} from "@/components/ui";
import type { StatusKind } from "@/lib/design-tokens";
import { getFeatureValidations, getValidationSummary, type ValidationRecommendation } from "@/lib/features/validation";

const REC_KIND: Record<ValidationRecommendation, StatusKind> = {
  KEEP: "SUCCESS", PROMOTE: "INFO", WATCH: "WARNING", REMOVE: "ERROR",
};
const REC_LABEL: Record<ValidationRecommendation, string> = {
  KEEP: "rp.valid.r.keep", PROMOTE: "rp.valid.r.promote", WATCH: "rp.valid.r.watch", REMOVE: "rp.valid.r.remove",
};
const CONF_KIND: Record<string, StatusKind> = { HIGH: "SUCCESS", MEDIUM: "WARNING", LOW: "COMING_SOON" };

type SortKey = "name" | "coverage" | "sampleSize" | "hitRate" | "alpha" | "recommendation";

function fmt(v: number | null, suffix = ""): string {
  return v == null ? "—" : `${Math.round(v * 10) / 10}${suffix}`;
}

export default function ValidationPanel() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const rows = useMemo(() => getFeatureValidations(), []);
  const summary = useMemo(() => getValidationSummary(), []);
  const [q, setQ] = useState("");
  const [recFilter, setRecFilter] = useState<ValidationRecommendation | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (recFilter !== "ALL" && r.validation.recommendation !== recFilter) return false;
      if (kw && !(`${r.id} ${r.name}`.toLowerCase().includes(kw))) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const av = pick(a, sortKey), bv = pick(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (((av as number) ?? -Infinity) - ((bv as number) ?? -Infinity)) * dir;
    });
    return out;
  }, [rows, q, recFilter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  }

  return (
    <div className="space-y-6">
      <AppCard accent={`${COLORS.warning}33`} style={{ background: `${COLORS.warning}0A` }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7 }}>
          <b style={{ color: COLORS.text }}>{tx("rp.valid.frameTitle")}</b>
          {tx("rp.valid.frameBody")}
        </div>
      </AppCard>

      <AppKpiGrid>
        <AppKpiCard label={tx("rp.valid.kTotal")} value={summary.total} tone="blue" />
        <AppKpiCard label={tx("rp.valid.r.keep")} value={summary.keep} tone="green" />
        <AppKpiCard label={tx("rp.valid.r.promote")} value={summary.promote} tone="blue" />
        <AppKpiCard label={tx("rp.valid.r.watch")} value={summary.watch} tone="amber" />
        <AppKpiCard label={tx("rp.valid.r.remove")} value={summary.remove} tone={summary.remove > 0 ? "red" : "neutral"} />
        <AppKpiCard label={tx("rp.fpro.pending")} value={summary.pending} tone="neutral" sub={tx("rp.valid.noBacktest")} />
      </AppKpiGrid>

      <AppCard>
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("rp.freg.search")}
            style={{ flex: "1 1 220px", minWidth: 180, height: 36, padding: "0 14px", fontSize: 13, border: `1px solid ${COLORS.border}`, borderRadius: 9999, background: COLORS.card, color: COLORS.text }} />
          {(["ALL", "KEEP", "PROMOTE", "WATCH", "REMOVE"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRecFilter(r)}
              style={{ height: 32, padding: "0 12px", fontSize: 12, fontWeight: 600, borderRadius: 9999, cursor: "pointer",
                border: `1px solid ${recFilter === r ? COLORS.primary : COLORS.border}`,
                background: recFilter === r ? `${COLORS.primary}12` : COLORS.card,
                color: recFilter === r ? COLORS.primary : COLORS.textSecondary }}>
              {r === "ALL" ? tx("rp.valid.allRec") : tx(REC_LABEL[r])}
            </button>
          ))}
          {(recFilter !== "ALL" || q) && <AppButton size="sm" variant="ghost" onClick={() => { setQ(""); setRecFilter("ALL"); }}>{tx("common.reset")}</AppButton>}
        </div>
      </AppCard>

      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{tx("rp.valid.listTitle")}</span>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>{filtered.length} / {summary.total}</span>
        </div>
        <AppTable minWidth={960}>
          <thead>
            <tr>
              <AppTh sortable active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")}>Feature</AppTh>
              <AppTh>{tx("rp.freg.colCat")}</AppTh>
              <AppTh align="right" sortable active={sortKey === "coverage"} dir={sortDir} onClick={() => toggleSort("coverage")}>Coverage</AppTh>
              <AppTh align="right" sortable active={sortKey === "sampleSize"} dir={sortDir} onClick={() => toggleSort("sampleSize")}>Sample</AppTh>
              <AppTh align="right" sortable active={sortKey === "hitRate"} dir={sortDir} onClick={() => toggleSort("hitRate")}>HitRate</AppTh>
              <AppTh align="right" sortable active={sortKey === "alpha"} dir={sortDir} onClick={() => toggleSort("alpha")}>Alpha</AppTh>
              <AppTh>Confidence</AppTh>
              <AppTh>Stage</AppTh>
              <AppTh sortable active={sortKey === "recommendation"} dir={sortDir} onClick={() => toggleSort("recommendation")}>Recommendation</AppTh>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const v = r.validation;
              return (
                <tr key={r.id} className={appRowHover}>
                  <AppTd><span style={{ fontWeight: 600, color: COLORS.text }}>{r.name}</span><span style={{ fontSize: 11, color: COLORS.textFaint, marginLeft: 8 }}>{r.id}</span></AppTd>
                  <AppTd color={COLORS.textSecondary}>{r.category}</AppTd>
                  <AppTd align="right" mono color={COLORS.textMuted}>{fmt(v.coverage, "%")}</AppTd>
                  <AppTd align="right" mono color={COLORS.textMuted}>{v.sampleSize ?? "—"}</AppTd>
                  <AppTd align="right" mono color={COLORS.textMuted}>{fmt(v.hitRate, "%")}</AppTd>
                  <AppTd align="right" mono color={v.alpha == null ? COLORS.textFaint : v.alpha >= 0 ? COLORS.success : COLORS.danger}>{fmt(v.alpha, "%")}</AppTd>
                  <AppTd><AppStatusChip kind={CONF_KIND[v.confidence]} label={v.confidence} /></AppTd>
                  <AppTd color={COLORS.textSecondary}>{v.stage}</AppTd>
                  <AppTd><AppStatusChip kind={REC_KIND[v.recommendation]} label={tx(REC_LABEL[v.recommendation])} /></AppTd>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><AppTd align="center" color={COLORS.textFaint}>{tx("rp.freg.noMatch")}</AppTd>{Array.from({ length: 8 }).map((_, i) => <AppTd key={i}>{""}</AppTd>)}</tr>
            )}
          </tbody>
        </AppTable>
      </div>
    </div>
  );
}

function pick(r: ReturnType<typeof getFeatureValidations>[number], k: SortKey): string | number | null {
  if (k === "name") return r.name;
  if (k === "recommendation") return r.validation.recommendation;
  return r.validation[k] as number | null;
}
