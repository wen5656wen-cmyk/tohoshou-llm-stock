"use client";

// ── /admin/feature-promotion · Feature Promotion Engine V2（因子晋升引擎，P6-T9）─
// 只读展示因子级 Alpha（真实回测 vs 等权宇宙）+ Attribution + Confidence + Stability +
// Trend + Pending Reason，并给出 Promote / Keep Shadow / Disable 建议 + 1-5 星。
// 数据来自 GET /api/admin/feature-promotion。**只做建议 · 不自动改任何状态 · 不影响推荐。**

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { fmtAsOf } from "./PanelFrame";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppBadge, AppButton,
  AppLoading, AppEmptyState, COLORS,
} from "@/components/ui";

const CATEGORY_LABEL: Record<string, string> = {
  PRICE: "rp.fpro.c.price", TECHNICAL: "rp.fpro.c.tech", FUNDAMENTAL: "rp.fpro.c.fund", NEWS: "rp.fpro.c.news",
  MARKET: "rp.fpro.c.market", MONEY_FLOW: "rp.fpro.c.flow", TDNET: "rp.fpro.c.tdnet", GLOBAL: "rp.fpro.c.global",
  AI: "rp.fpro.c.ai", OTHER: "rp.fpro.c.other",
};
const STATUS_LABEL: Record<string, string> = { PRODUCTION: "rp.fpro.s.prod", SHADOW: "rp.fpro.s.shadow", DISABLED: "rp.fpro.s.disabled" };
const REC_META: Record<string, { label: string; color: string }> = {
  PROMOTE: { label: "rp.fpro.r.promote", color: COLORS.success },
  KEEP_SHADOW: { label: "rp.fpro.r.keep", color: COLORS.warning },
  DISABLE: { label: "rp.fpro.r.disable", color: COLORS.danger },
};
const TREND_LABEL: Record<string, string> = { IMPROVING: "rp.fpro.t.up", FLAT: "rp.fpro.t.flat", DECAYING: "rp.fpro.t.down" };
const CONF_LABEL: Record<string, string> = { HIGH: "rp.fpro.cf.high", MEDIUM: "rp.fpro.cf.mid", LOW: "rp.fpro.cf.low" };

interface Horizon { horizon: number; alpha: number | null; avgReturn: number | null; benchReturn: number | null; hitRate: number | null; rankIc: number | null }
interface Bundle {
  featureId: string; horizons: Horizon[]; primary: Horizon | null; meanRankIc: number | null;
  alphaPosShare: number; icPosShare: number; stability: number | null; trend: string | null;
  sampleCount: number; asOfCount: number; cohortSize: number; asOfLatest: string | null; contribution: number | null;
}
interface Row {
  id: string; name: string; category: string; source: string; status: string; version: string;
  promotionScore: number | null; learningScore: number | null; rating: number; ratingLabel: string;
  recommendation: string | null; confidence: string; contribution: number | null; stability: number | null; trend: string | null;
  coverage: number | null; pending: boolean; pendingReason: string | null; pendingReasonCode: string | null; reason: string;
  factorAlpha: Bundle | null; primaryAlpha: number | null; primaryHitRate: number | null; meanRankIc: number | null;
}
interface Summary {
  totalFeatures: number; production: number; shadow: number; disabled: number; evaluated: number; evaluatedShadow: number;
  pending: number; promoteCandidates: number; keepShadow: number; disableCandidates: number; avgPromotionScore: number | null;
  topContributor: { id: string; contribution: number | null } | null; pendingByReason: Record<string, number>;
  asOf: string | null; asOfCount: number | null; primaryHorizon: number;
}
interface ApiResponse {
  ok: boolean; generatedAt: string; engine: string;
  reasonLabels: Record<string, string>; summary: Summary;
  productionFeatures: Row[]; shadowFeatures: Row[]; promotionCandidates: Row[]; keepShadow: Row[];
  disabledCandidates: Row[]; pendingFeatures: Row[]; features: Row[];
}

type SortKey = "promotionScore" | "primaryAlpha" | "contribution" | "primaryHitRate";
const SORT_LABEL: Record<SortKey, string> = {
  promotionScore: "rp.fpro.m.score", primaryAlpha: "Alpha(10d)", contribution: "rp.fpro.m.contrib", primaryHitRate: "rp.fpro.m.hit",
};

function fmt(v: number | null | undefined, suffix = "", digits = 2): string {
  return v == null ? "—" : `${(Math.round(v * 10 ** digits) / 10 ** digits)}${suffix}`;
}
function alphaColor(v: number | null): string {
  if (v == null) return COLORS.textFaint;
  return v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textSecondary;
}
function scoreTone(s: number | null): string {
  if (s == null) return COLORS.textFaint;
  if (s >= 62) return COLORS.success;
  if (s >= 48) return COLORS.warning;
  return COLORS.danger;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ letterSpacing: 1, fontSize: 13, color: COLORS.warning }} aria-label={`${rating}/5`}>
      {"★".repeat(rating)}<span style={{ color: COLORS.border }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

// 因子 alpha 曲线（1/3/5/10/20d）——迷你柱状学习曲线
function AlphaCurve({ horizons }: { horizons: Horizon[] }) {
  const vals = horizons.map((h) => h.alpha ?? 0);
  const maxAbs = Math.max(0.01, ...vals.map((v) => Math.abs(v)));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 46, padding: "4px 0" }}>
      {horizons.map((h) => {
        const v = h.alpha ?? 0;
        const hgt = Math.max(2, (Math.abs(v) / maxAbs) * 34);
        return (
          <div key={h.horizon} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 8.5, color: alphaColor(h.alpha), fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {h.alpha == null ? "—" : (h.alpha >= 0 ? "+" : "") + h.alpha.toFixed(1)}
            </div>
            <div style={{ width: "70%", height: hgt, borderRadius: 3, background: v >= 0 ? COLORS.success : COLORS.danger, opacity: 0.85 }} />
            <div style={{ fontSize: 8.5, color: COLORS.textFaint }}>{h.horizon}d</div>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: COLORS.textFaint, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: color ?? COLORS.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function Chip({ text, color }: { text: string; color: string }) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, color, background: `${color}14`, borderRadius: 9999, padding: "2px 8px" }}>{text}</span>;
}

function FeatureCard({ r, reasonLabels }: { r: Row; reasonLabels: Record<string, string> }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const rec = r.recommendation;
  const recMeta = rec ? REC_META[rec] : { label: "rp.fpro.r.baseline", color: COLORS.textSecondary };
  const b = r.factorAlpha;
  return (
    <AppCard style={{ borderLeft: `3px solid ${recMeta.color}` }}>
      {/* 头部 */}
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{r.name}</span>
            <span style={{ fontSize: 11, color: COLORS.textFaint, fontFamily: "monospace" }}>{r.id}</span>
          </div>
          <div className="flex items-center gap-1.5" style={{ marginTop: 5 }}>
            <AppBadge tone="neutral">{CATEGORY_LABEL[r.category] ? tx(CATEGORY_LABEL[r.category]) : r.category}</AppBadge>
            <AppBadge tone={r.status === "PRODUCTION" ? "green" : r.status === "SHADOW" ? "amber" : "neutral"}>{tx(STATUS_LABEL[r.status] ?? r.status)}</AppBadge>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: scoreTone(r.promotionScore), fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {r.pending ? tx("rp.fpro.pending") : fmt(r.promotionScore, "", 1)}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 2 }}>{tx("rp.fpro.m.score")}</div>
        </div>
      </div>

      {/* 星级 + 建议 */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div className="flex items-center gap-2">
          <Stars rating={r.rating} />
          <span style={{ fontSize: 11.5, color: COLORS.textSecondary }}>{r.ratingLabel}</span>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: recMeta.color, background: `${recMeta.color}14`, borderRadius: 9999, padding: "3px 10px" }}>{tx(recMeta.label)}</span>
      </div>

      {/* 因子 alpha 曲线（真实回测 · vs 等权宇宙） */}
      {b && b.horizons.length > 0 && (
        <div style={{ padding: "6px 0", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ fontSize: 10, color: COLORS.textFaint, marginBottom: 2 }}>{tx("rp.fpro.curve")}</div>
          <AlphaCurve horizons={b.horizons} />
        </div>
      )}

      {/* 指标网格 */}
      {!r.pending ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "9px 8px", padding: "9px 0", borderTop: `1px solid ${COLORS.borderSoft}`, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <Metric label={`Alpha ${r.factorAlpha?.primary?.horizon ?? 10}d`} value={r.primaryAlpha == null ? "—" : `${r.primaryAlpha >= 0 ? "+" : ""}${fmt(r.primaryAlpha, "%")}`} color={alphaColor(r.primaryAlpha)} />
            <Metric label={tx("rp.fpro.m.rankic")} value={fmt(r.meanRankIc, "", 3)} color={alphaColor(r.meanRankIc)} />
            <Metric label={tx("rp.fpro.m.hit")} value={fmt(r.primaryHitRate, "%", 1)} />
            <Metric label={tx("rp.fpro.m.contrib")} value={fmt(r.contribution, "%", 1)} color={r.contribution ? COLORS.purple : undefined} />
            <Metric label={tx("rp.fpro.m.stability")} value={fmt(r.stability, "%", 0)} />
            <Metric label={tx("rp.fpro.m.coverage")} value={fmt(r.coverage, "%", 1)} />
          </div>
          <div className="flex items-center gap-1.5" style={{ marginTop: 8, flexWrap: "wrap" }}>
            <Chip text={tx(CONF_LABEL[r.confidence] ?? r.confidence)} color={r.confidence === "HIGH" ? COLORS.success : r.confidence === "MEDIUM" ? COLORS.warning : COLORS.textMuted} />
            {r.trend && <Chip text={tx(TREND_LABEL[r.trend] ?? r.trend)} color={r.trend === "IMPROVING" ? COLORS.success : r.trend === "DECAYING" ? COLORS.danger : COLORS.textSecondary} />}
            <Chip text={`${r.factorAlpha?.asOfCount ?? "—"} ${tx("rp.fpro.rebalDays")}`} color={COLORS.textMuted} />
          </div>
        </>
      ) : (
        <div style={{ padding: "9px 0", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <div className="flex items-center gap-1.5" style={{ marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.warning, background: `${COLORS.warning}14`, borderRadius: 9999, padding: "2px 9px" }}>
              {r.pendingReasonCode ? (reasonLabels[r.pendingReasonCode] ?? r.pendingReasonCode) : tx("rp.fpro.pending")}
            </span>
            {r.coverage != null && <Chip text={`${tx("rp.fpro.m.coverage")} ${fmt(r.coverage, "%", 1)}`} color={COLORS.textMuted} />}
          </div>
        </div>
      )}

      {/* reason */}
      <div style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.6, marginTop: 8 }}>{r.reason || "—"}</div>
    </AppCard>
  );
}

function Section({ title, desc, rows, accent, emptyText, reasonLabels }: {
  title: string; desc: string; rows: Row[]; accent: string; emptyText: string; reasonLabels: Record<string, string>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: accent, display: "inline-block" }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{title}</span>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>{rows.length}</span>
      </div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>{desc}</div>
      {rows.length === 0 ? (
        <AppCard><div style={{ fontSize: 12.5, color: COLORS.textFaint, padding: "6px 0" }}>{emptyText}</div></AppCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => <FeatureCard key={r.id} r={r} reasonLabels={reasonLabels} />)}
        </div>
      )}
    </div>
  );
}

export default function FeaturePromotionPage() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("promotionScore");

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/feature-promotion", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      if (!json.ok) throw new Error(tx("common.load_error"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("common.load_error"));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const sortRows = useMemo(() => (rows: Row[]) => {
    const val = (r: Row) => (r[sortKey] ?? -Infinity) as number;
    return [...rows].sort((a, b) => val(b) - val(a));
  }, [sortKey]);

  const s = data?.summary;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <AppHeader
          title="Feature Promotion V2"
          titleEn=""
          subtitle={tx("rp.fpro.subtitle")}
          status="V2" statusTone="blue"
        />

        <AppCard accent={`${COLORS.primary}33`} style={{ background: `${COLORS.primary}08` }}>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            <b style={{ color: COLORS.text }}>{tx("rp.fpro.principleTitle")}</b>
            {tx("rp.fpro.principleBody")}
          </div>
        </AppCard>

        {loading && <AppCard><AppLoading /></AppCard>}
        {error && !loading && (
          <AppCard><AppEmptyState title={tx("common.load_error")} desc={error} actions={<AppButton size="sm" onClick={load}>{tx("common.refresh")}</AppButton>} icon="⚠" /></AppCard>
        )}

        {!loading && !error && s && data && (
          <>
            <AppKpiGrid>
              <AppKpiCard label={tx("rp.fpro.kTotal")} value={s.totalFeatures} tone="blue" sub={`${tx("rp.fpro.s.prod")} ${s.production} · ${tx("rp.fpro.s.shadow")} ${s.shadow}`} />
              <AppKpiCard label={tx("rp.fpro.kEvaluated")} value={s.evaluated} tone="purple" sub={`${tx("rp.fpro.s.shadow")} ${s.evaluatedShadow} · ${tx("rp.fpro.pending")} ${s.pending}`} />
              <AppKpiCard label={tx("rp.fpro.r.promote")} value={s.promoteCandidates} tone="green" sub={tx("rp.fpro.kPromoteSub")} />
              <AppKpiCard label={tx("rp.fpro.r.keep")} value={s.keepShadow} tone="amber" sub={tx("rp.fpro.kKeepSub")} />
              <AppKpiCard label={tx("rp.fpro.r.disable")} value={s.disableCandidates} tone="neutral" sub={tx("rp.fpro.kDisableSub")} />
              <AppKpiCard label={tx("rp.fpro.kTopContrib")} value={s.topContributor ? `${fmt(s.topContributor.contribution, "%", 1)}` : "—"} tone="purple" sub={s.topContributor?.id ?? "—"} />
            </AppKpiGrid>

            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
                {tx("common.asOf.data")} {s.asOf ?? "—"} · {s.asOfCount ?? "—"} {tx("rp.fpro.rebalDays")} · {fmtAsOf(data.generatedAt) ?? "—"}
                <AppButton size="sm" variant="ghost" onClick={load} style={{ marginLeft: 10 }}>{tx("common.refresh")}</AppButton>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 11.5, color: COLORS.textMuted }}>{tx("rp.fpro.sort")}</span>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <button key={k} type="button" onClick={() => setSortKey(k)}
                    style={{ height: 28, padding: "0 11px", fontSize: 11.5, fontWeight: 600, borderRadius: 9999, cursor: "pointer",
                      border: `1px solid ${sortKey === k ? COLORS.primary : COLORS.border}`,
                      background: sortKey === k ? `${COLORS.primary}12` : COLORS.card,
                      color: sortKey === k ? COLORS.primary : COLORS.textSecondary }}>{tx(SORT_LABEL[k])}</button>
                ))}
              </div>
            </div>

            <Section title={tx("rp.fpro.r.promote")}
              desc={tx("rp.fpro.secPromoteDesc")}
              rows={sortRows(data.promotionCandidates)} accent={COLORS.success}
              emptyText={tx("rp.fpro.secPromoteEmpty")} reasonLabels={data.reasonLabels} />

            <Section title={tx("rp.fpro.r.keep")}
              desc={tx("rp.fpro.secKeepDesc")}
              rows={sortRows(data.keepShadow)} accent={COLORS.warning} emptyText={tx("common.no_data")} reasonLabels={data.reasonLabels} />

            <Section title={tx("rp.fpro.r.disable")}
              desc={tx("rp.fpro.secDisableDesc")}
              rows={sortRows(data.disabledCandidates)} accent={COLORS.danger} emptyText={tx("common.no_data")} reasonLabels={data.reasonLabels} />

            {/* Pending / Shadow Sample Completion */}
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: COLORS.textMuted, display: "inline-block" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{tx("rp.fpro.secPending")}</span>
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>{data.pendingFeatures.length}</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                {Object.entries(s.pendingByReason).map(([code, n]) => (
                  <Chip key={code} text={`${data.reasonLabels[code] ?? code} · ${n}`} color={COLORS.textMuted} />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.pendingFeatures.map((r) => <FeatureCard key={r.id} r={r} reasonLabels={data.reasonLabels} />)}
              </div>
            </div>

            <Section title={tx("rp.fpro.secProd")}
              desc={tx("rp.fpro.secProdDesc")}
              rows={sortRows(data.productionFeatures)} accent={COLORS.primary} emptyText={tx("common.no_data")} reasonLabels={data.reasonLabels} />
          </>
        )}
      </div>
    </div>
  );
}
