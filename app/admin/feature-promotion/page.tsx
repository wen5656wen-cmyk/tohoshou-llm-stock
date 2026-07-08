"use client";

// ── /admin/feature-promotion · Feature Promotion Engine（因子晋升引擎 V1，P6-T8）─
// 只读展示 SHADOW 因子的统一量化晋升评估（Promote / Keep Shadow / Disable + 1-5 星）。
// 数据来自 GET /api/admin/feature-promotion（只读派生 AlphaFactorReport / AlphaFactor）。
// **只做建议 · 不自动改任何 Feature 状态 · 不影响任何评分/推荐/组合/watchlist。**

import { useEffect, useMemo, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppBadge, AppButton,
  AppLoading, AppEmptyState, COLORS,
} from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import type {
  FeaturePromotion, PromotionSummary, PromotionRecommendation,
} from "@/lib/features/promotion";

const CATEGORY_LABEL: Record<string, string> = {
  PRICE: "价格", TECHNICAL: "技术指标", FUNDAMENTAL: "基本面", NEWS: "新闻情绪",
  MARKET: "市场状态", MONEY_FLOW: "资金流", TDNET: "开示 TDnet", GLOBAL: "全球市场",
  AI: "AI 派生", OTHER: "其他",
};
const STATUS_LABEL: Record<string, string> = { PRODUCTION: "正式", SHADOW: "影子", DISABLED: "停用" };

const REC_META: Record<PromotionRecommendation, { label: string; color: string; tone: Tone }> = {
  PROMOTE: { label: "建议晋升", color: COLORS.success, tone: "green" },
  KEEP_SHADOW: { label: "保持影子", color: COLORS.warning, tone: "amber" },
  DISABLE: { label: "建议停用", color: COLORS.danger, tone: "neutral" },
};

interface ApiResponse {
  ok: boolean;
  generatedAt: string;
  summary: PromotionSummary;
  productionFeatures: FeaturePromotion[];
  shadowFeatures: FeaturePromotion[];
  promotionCandidates: FeaturePromotion[];
  keepShadow: FeaturePromotion[];
  disabledCandidates: FeaturePromotion[];
}

function fmt(v: number | null | undefined, suffix = ""): string {
  return v == null ? "—" : `${Math.round(v * 10) / 10}${suffix}`;
}
function scoreTone(score: number | null): string {
  if (score == null) return COLORS.textFaint;
  if (score >= 60) return COLORS.success;
  if (score >= 40) return COLORS.warning;
  return COLORS.danger;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ letterSpacing: 1, fontSize: 13, color: COLORS.warning }} aria-label={`${rating} / 5`}>
      {"★".repeat(rating)}<span style={{ color: COLORS.border }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: color ?? COLORS.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function FeatureCard({ f }: { f: FeaturePromotion }) {
  const m = f.eval.metrics;
  const rec = f.eval.recommendation;
  const recMeta = rec ? REC_META[rec] : { label: "生产基线", color: COLORS.textSecondary, tone: "neutral" as Tone };
  return (
    <AppCard style={{ borderLeft: `3px solid ${recMeta.color}` }}>
      {/* 头部 */}
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{f.name}</span>
            <span style={{ fontSize: 11, color: COLORS.textFaint, fontFamily: "monospace" }}>{f.id}</span>
          </div>
          <div className="flex items-center gap-1.5" style={{ marginTop: 5 }}>
            <AppBadge tone="neutral">{CATEGORY_LABEL[f.category] ?? f.category}</AppBadge>
            <AppBadge tone={f.status === "PRODUCTION" ? "green" : f.status === "SHADOW" ? "amber" : "neutral"}>
              {STATUS_LABEL[f.status] ?? f.status}
            </AppBadge>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: scoreTone(m.promotionScore), fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {fmt(m.promotionScore)}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 2 }}>晋升分</div>
        </div>
      </div>

      {/* 星级 + 建议 */}
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          <Stars rating={f.eval.rating} />
          <span style={{ fontSize: 11.5, color: COLORS.textSecondary }}>{f.eval.ratingLabel}</span>
        </div>
        <span style={{
          fontSize: 11.5, fontWeight: 700, color: recMeta.color,
          background: `${recMeta.color}14`, borderRadius: 9999, padding: "3px 10px",
        }}>{recMeta.label}</span>
      </div>

      {/* 指标网格 */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 8px",
        padding: "10px 0", borderTop: `1px solid ${COLORS.borderSoft}`, borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}>
        <Metric label="命中率" value={fmt(m.hitRate, "%")} />
        <Metric label="Alpha" value={fmt(m.alpha, "%")} color={m.alpha == null ? undefined : m.alpha >= 0 ? COLORS.success : COLORS.danger} />
        <Metric label="Sharpe" value={fmt(m.sharpeRatio)} />
        <Metric label="覆盖率" value={fmt(m.coverage, "%")} />
        <Metric label="样本数" value={m.sampleCount == null ? "—" : String(m.sampleCount)} />
        <Metric label="一致性" value={fmt(m.consistency, "%")} />
      </div>

      {/* reason */}
      <div style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.6, marginTop: 9 }}>
        {f.eval.reason || "—"}
      </div>
    </AppCard>
  );
}

function Section({ title, desc, features, accent, emptyText }: {
  title: string; desc: string; features: FeaturePromotion[]; accent: string; emptyText: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: accent, display: "inline-block" }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{title}</span>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>{features.length}</span>
      </div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>{desc}</div>
      {features.length === 0 ? (
        <AppCard><div style={{ fontSize: 12.5, color: COLORS.textFaint, padding: "6px 0" }}>{emptyText}</div></AppCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {features.map((f) => <FeatureCard key={f.id} f={f} />)}
        </div>
      )}
    </div>
  );
}

export default function FeaturePromotionPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const s = data?.summary;
  const asOf = useMemo(() => s?.asOf ?? "—", [s]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <AppHeader
          title="Feature Promotion"
          titleEn="因子晋升引擎"
          subtitle="对 SHADOW 因子统一量化评估 · Promote / Keep Shadow / Disable 建议 · 仅建议不自动改状态"
          status="V1"
          statusTone="blue"
        />

        {/* 原则声明 */}
        <AppCard accent={`${COLORS.primary}33`} style={{ background: `${COLORS.primary}08` }}>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            <b style={{ color: COLORS.text }}>晋升引擎只读原则：</b>
            本引擎读取 <b>AlphaFactorReport / AlphaFactor</b> 真实统计，对影子因子按
            <b> 命中率 / Alpha / Sharpe / 覆盖率 / 一致性 / 样本成熟度 </b>加权算出统一晋升分，
            给出 <b>建议晋升 / 保持影子 / 建议停用</b> 与 1-5 星评级。
            流程：<b>Registry → Shadow → Backtest → Learning → Promotion → Production</b>。
            <b style={{ color: COLORS.text }}>本轮只做建议</b>，不自动写 Production、不启用/禁用任何因子、不影响现有推荐结果。
          </div>
        </AppCard>

        {loading && <AppCard><AppLoading label="加载晋升评估…" /></AppCard>}

        {error && !loading && (
          <AppCard>
            <AppEmptyState
              title="加载失败"
              desc={error}
              actions={<AppButton size="sm" onClick={load}>重试</AppButton>}
              icon="⚠"
            />
          </AppCard>
        )}

        {!loading && !error && s && (
          <>
            {/* Summary KPI */}
            <AppKpiGrid>
              <AppKpiCard label="因子总数" value={s.totalFeatures} tone="blue" sub={`正式 ${s.production} · 影子 ${s.shadow} · 停用 ${s.disabled}`} />
              <AppKpiCard label="建议晋升" value={s.promoteCandidates} tone="green" sub="Ready for Production" />
              <AppKpiCard label="保持影子" value={s.keepShadow} tone="amber" sub="继续观察 / 需更多样本" />
              <AppKpiCard label="建议停用" value={s.disableCandidates} tone="neutral" sub="偏弱 / 表现不佳" />
              <AppKpiCard label="已评估影子" value={s.evaluatedShadow} tone="purple" sub={`待样本 ${s.pendingShadow}`} />
              <AppKpiCard label="影子平均晋升分" value={fmt(s.avgPromotionScore)} tone="neutral" sub={`组合回撤 ${fmt(s.portfolioMaxDrawdown, "%")}`} />
            </AppKpiGrid>

            <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
              数据锚点 {asOf} · 更新 {data ? new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}
              <AppButton size="sm" variant="ghost" onClick={load} style={{ marginLeft: 10 }}>刷新</AppButton>
            </div>

            <Section
              title="Promotion Candidates · 建议晋升"
              desc="综合晋升分 ≥ 60 且样本充足、Alpha > 0 的影子因子，达到可进入 Production 的门槛（仍需人工确认）。"
              features={data!.promotionCandidates}
              accent={COLORS.success}
              emptyText="当前无因子达到晋升门槛（样本成熟前属正常）。"
            />

            <Section
              title="Keep Shadow · 保持影子"
              desc="表现尚可或样本不足，暂不晋升也不停用，继续影子观察积累样本。"
              features={data!.keepShadow}
              accent={COLORS.warning}
              emptyText="暂无保持影子的因子。"
            />

            <Section
              title="Weak / Disable Candidates · 偏弱 / 建议停用"
              desc="Alpha < 0 且命中率偏低，或综合分过低，建议考虑停用（仅建议，不自动执行）。"
              features={data!.disabledCandidates}
              accent={COLORS.danger}
              emptyText="暂无建议停用的因子。"
            />

            <Section
              title="Production Features · 生产因子（参考基线）"
              desc="已进入正式评分的因子，作为晋升对照基线；本引擎不重新评估、不产出变更建议。"
              features={data!.productionFeatures}
              accent={COLORS.primary}
              emptyText="无生产因子。"
            />
          </>
        )}
      </div>
    </div>
  );
}
