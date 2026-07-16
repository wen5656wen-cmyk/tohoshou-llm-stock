"use client";

// ── /admin/feature-promotion · Feature Promotion Engine V2（因子晋升引擎，P6-T9）─
// 只读展示因子级 Alpha（真实回测 vs 等权宇宙）+ Attribution + Confidence + Stability +
// Trend + Pending Reason，并给出 Promote / Keep Shadow / Disable 建议 + 1-5 星。
// 数据来自 GET /api/admin/feature-promotion。**只做建议 · 不自动改任何状态 · 不影响推荐。**

import { useEffect, useMemo, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppBadge, AppButton,
  AppLoading, AppEmptyState, COLORS,
} from "@/components/ui";

const CATEGORY_LABEL: Record<string, string> = {
  PRICE: "价格", TECHNICAL: "技术指标", FUNDAMENTAL: "基本面", NEWS: "新闻情绪",
  MARKET: "市场状态", MONEY_FLOW: "资金流", TDNET: "开示 TDnet", GLOBAL: "全球市场",
  AI: "AI 派生", OTHER: "其他",
};
const STATUS_LABEL: Record<string, string> = { PRODUCTION: "正式", SHADOW: "影子", DISABLED: "停用" };
const REC_META: Record<string, { label: string; color: string }> = {
  PROMOTE: { label: "建议晋升", color: COLORS.success },
  KEEP_SHADOW: { label: "保持影子", color: COLORS.warning },
  DISABLE: { label: "建议停用", color: COLORS.danger },
};
const TREND_LABEL: Record<string, string> = { IMPROVING: "↗ 走强", FLAT: "→ 平稳", DECAYING: "↘ 衰减" };
const CONF_LABEL: Record<string, string> = { HIGH: "高置信", MEDIUM: "中置信", LOW: "低置信" };

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
  promotionScore: "晋升分", primaryAlpha: "Alpha(10d)", contribution: "贡献", primaryHitRate: "命中率",
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
  const rec = r.recommendation;
  const recMeta = rec ? REC_META[rec] : { label: "生产基线", color: COLORS.textSecondary };
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
            <AppBadge tone="neutral">{CATEGORY_LABEL[r.category] ?? r.category}</AppBadge>
            <AppBadge tone={r.status === "PRODUCTION" ? "green" : r.status === "SHADOW" ? "amber" : "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</AppBadge>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: scoreTone(r.promotionScore), fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {r.pending ? "待样本" : fmt(r.promotionScore, "", 1)}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 2 }}>晋升分</div>
        </div>
      </div>

      {/* 星级 + 建议 */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div className="flex items-center gap-2">
          <Stars rating={r.rating} />
          <span style={{ fontSize: 11.5, color: COLORS.textSecondary }}>{r.ratingLabel}</span>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: recMeta.color, background: `${recMeta.color}14`, borderRadius: 9999, padding: "3px 10px" }}>{recMeta.label}</span>
      </div>

      {/* 因子 alpha 曲线（真实回测 · vs 等权宇宙） */}
      {b && b.horizons.length > 0 && (
        <div style={{ padding: "6px 0", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ fontSize: 10, color: COLORS.textFaint, marginBottom: 2 }}>因子 Alpha 曲线（1/3/5/10/20d · cohort − 宇宙 %）</div>
          <AlphaCurve horizons={b.horizons} />
        </div>
      )}

      {/* 指标网格 */}
      {!r.pending ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "9px 8px", padding: "9px 0", borderTop: `1px solid ${COLORS.borderSoft}`, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <Metric label={`Alpha ${r.factorAlpha?.primary?.horizon ?? 10}d`} value={r.primaryAlpha == null ? "—" : `${r.primaryAlpha >= 0 ? "+" : ""}${fmt(r.primaryAlpha, "%")}`} color={alphaColor(r.primaryAlpha)} />
            <Metric label="平均 rankIC" value={fmt(r.meanRankIc, "", 3)} color={alphaColor(r.meanRankIc)} />
            <Metric label="命中率" value={fmt(r.primaryHitRate, "%", 1)} />
            <Metric label="贡献" value={fmt(r.contribution, "%", 1)} color={r.contribution ? COLORS.purple : undefined} />
            <Metric label="稳定性" value={fmt(r.stability, "%", 0)} />
            <Metric label="覆盖率" value={fmt(r.coverage, "%", 1)} />
          </div>
          <div className="flex items-center gap-1.5" style={{ marginTop: 8, flexWrap: "wrap" }}>
            <Chip text={CONF_LABEL[r.confidence] ?? r.confidence} color={r.confidence === "HIGH" ? COLORS.success : r.confidence === "MEDIUM" ? COLORS.warning : COLORS.textMuted} />
            {r.trend && <Chip text={TREND_LABEL[r.trend] ?? r.trend} color={r.trend === "IMPROVING" ? COLORS.success : r.trend === "DECAYING" ? COLORS.danger : COLORS.textSecondary} />}
            <Chip text={`${r.factorAlpha?.asOfCount ?? "—"} 再平衡日`} color={COLORS.textMuted} />
          </div>
        </>
      ) : (
        <div style={{ padding: "9px 0", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <div className="flex items-center gap-1.5" style={{ marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.warning, background: `${COLORS.warning}14`, borderRadius: 9999, padding: "2px 9px" }}>
              {r.pendingReasonCode ? (reasonLabels[r.pendingReasonCode] ?? r.pendingReasonCode) : "待样本"}
            </span>
            {r.coverage != null && <Chip text={`覆盖 ${fmt(r.coverage, "%", 1)}`} color={COLORS.textMuted} />}
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
      if (!json.ok) throw new Error("API 返回异常");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
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
          titleEn="因子晋升引擎 · 因子级 Alpha"
          subtitle="真实回测因子级 Alpha（vs 等权宇宙）+ Attribution + Confidence + Trend → Promote / Keep Shadow / Disable · 仅建议不自动改状态"
          status="V2" statusTone="blue"
        />

        <AppCard accent={`${COLORS.primary}33`} style={{ background: `${COLORS.primary}08` }}>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            <b style={{ color: COLORS.text }}>Promotion Engine V2 · 只读原则：</b>
            每个可评估因子在 90 个历史再平衡日上按 top-quintile cohort 计算 <b>1/3/5/10/20d 真实前向 Alpha</b>（cohort − 等权宇宙均值，
            <b>禁止估算</b>）；结合 <b>rankIC / 稳定性 / 贡献度 / 置信度</b> 算晋升分。无回测的影子因子输出真实 <b>Pending Reason</b>。
            <b style={{ color: COLORS.text }}>本轮只做建议</b>，不自动写 Production、不启用/禁用任何因子、不影响推荐结果。
            <br /><span style={{ fontSize: 11.5, color: COLORS.textMuted }}>基准=等权宇宙（GlobalMarket.topix 点位序列 2026-03-30 有量纲断裂，不用作跨期基准）。</span>
          </div>
        </AppCard>

        {loading && <AppCard><AppLoading label="加载因子级晋升评估…" /></AppCard>}
        {error && !loading && (
          <AppCard><AppEmptyState title="加载失败" desc={error} actions={<AppButton size="sm" onClick={load}>重试</AppButton>} icon="⚠" /></AppCard>
        )}

        {!loading && !error && s && data && (
          <>
            <AppKpiGrid>
              <AppKpiCard label="因子总数" value={s.totalFeatures} tone="blue" sub={`正式 ${s.production} · 影子 ${s.shadow}`} />
              <AppKpiCard label="已回测评估" value={s.evaluated} tone="purple" sub={`影子 ${s.evaluatedShadow} · 待样本 ${s.pending}`} />
              <AppKpiCard label="建议晋升" value={s.promoteCandidates} tone="green" sub="Ready for Production" />
              <AppKpiCard label="保持影子" value={s.keepShadow} tone="amber" sub="需更多样本 / 观察" />
              <AppKpiCard label="建议停用" value={s.disableCandidates} tone="neutral" sub="偏弱 / 反向预测" />
              <AppKpiCard label="最高贡献因子" value={s.topContributor ? `${fmt(s.topContributor.contribution, "%", 1)}` : "—"} tone="purple" sub={s.topContributor?.id ?? "—"} />
            </AppKpiGrid>

            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
                数据锚点 {s.asOf ?? "—"} · {s.asOfCount ?? "—"} 再平衡日 · 主周期 {s.primaryHorizon}d · 更新 {new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })}
                <AppButton size="sm" variant="ghost" onClick={load} style={{ marginLeft: 10 }}>刷新</AppButton>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 11.5, color: COLORS.textMuted }}>排序</span>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <button key={k} type="button" onClick={() => setSortKey(k)}
                    style={{ height: 28, padding: "0 11px", fontSize: 11.5, fontWeight: 600, borderRadius: 9999, cursor: "pointer",
                      border: `1px solid ${sortKey === k ? COLORS.primary : COLORS.border}`,
                      background: sortKey === k ? `${COLORS.primary}12` : COLORS.card,
                      color: sortKey === k ? COLORS.primary : COLORS.textSecondary }}>{SORT_LABEL[k]}</button>
                ))}
              </div>
            </div>

            <Section title="Promotion Candidates · 建议晋升"
              desc="晋升分高 · 平均 rankIC>0.02 · 全周期正 Alpha · 高置信 → 达可进入 Production 门槛（仍需人工确认）。"
              rows={sortRows(data.promotionCandidates)} accent={COLORS.success}
              emptyText="当前无因子达到晋升门槛（历史仅约 4 个月 / 86 再平衡日，置信度未达 HIGH 属正常）。" reasonLabels={data.reasonLabels} />

            <Section title="Keep Shadow · 保持影子"
              desc="有正 Alpha 但样本/置信不足或综合分处观察区，继续影子积累。"
              rows={sortRows(data.keepShadow)} accent={COLORS.warning} emptyText="暂无保持影子的评估因子。" reasonLabels={data.reasonLabels} />

            <Section title="Weak / Disable Candidates · 偏弱 / 建议停用"
              desc="Alpha≤0 或平均 rankIC 反向（因子值与前向收益负相关）→ 建议停用（仅建议，不自动执行）。"
              rows={sortRows(data.disabledCandidates)} accent={COLORS.danger} emptyText="暂无建议停用的因子。" reasonLabels={data.reasonLabels} />

            {/* Pending / Shadow Sample Completion */}
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: COLORS.textMuted, display: "inline-block" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>Pending · 待补齐样本（Shadow Sample Completion）</span>
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

            <Section title="Production Features · 生产因子（参考基线）"
              desc="已进入正式评分的因子；含真实因子 Alpha 仅作对照，本引擎不重评、不产出变更建议。"
              rows={sortRows(data.productionFeatures)} accent={COLORS.primary} emptyText="无生产因子。" reasonLabels={data.reasonLabels} />
          </>
        )}
      </div>
    </div>
  );
}
