"use client";

// ── /admin/features · Feature Registry（因子管理中心 V1，P6-T1）──────────────
// 只读展示 Feature Registry。**不参与任何计算、不影响任何评分/推荐/权重。**
// 数据来自静态 lib/features（无 API、无 DB），故无 loading/error。

import { useMemo, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppStackBar, AppTable, AppTh, AppTd,
  AppStatusChip, AppBadge, AppButton, appRowHover, COLORS,
} from "@/components/ui";
import type { StatusKind } from "@/lib/design-tokens";
import {
  getAllFeatures, getSummary, categoryDistribution, sourceDistribution,
  CATEGORY_LABEL, STATUS_LABEL, FEATURE_STATUSES,
  type FeatureStatus, type FeatureCategory,
} from "@/lib/features";

// 分类分布用的分类色板（展示专用；design-tokens 无分类刻度，故此处以 token 色为主 + 少量 Apple 系统色补足到 10）。
const PALETTE = [
  COLORS.primary, COLORS.purple, COLORS.success, COLORS.warning, COLORS.danger,
  "#5AC8FA", "#AF52DE", "#FF9500", "#30B0C7", COLORS.textMuted,
];

// FeatureStatus → 语义状态色
const STATUS_KIND: Record<FeatureStatus, StatusKind> = {
  PRODUCTION: "SUCCESS",
  SHADOW: "INFO",
  DISABLED: "COMING_SOON",
};

export default function FeaturesPage() {
  const all = useMemo(() => getAllFeatures(), []);
  const summary = useMemo(() => getSummary(), []);
  const catDist = useMemo(() => categoryDistribution(), []);
  const srcDist = useMemo(() => sourceDistribution(), []);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<FeatureStatus | "ALL">("ALL");
  const [catFilter, setCatFilter] = useState<FeatureCategory | "ALL">("ALL");

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all.filter((f) => {
      if (statusFilter !== "ALL" && f.status !== statusFilter) return false;
      if (catFilter !== "ALL" && f.category !== catFilter) return false;
      if (kw && !(`${f.id} ${f.name} ${f.description}`.toLowerCase().includes(kw))) return false;
      return true;
    });
  }, [all, q, statusFilter, catFilter]);

  const catSegments = catDist.map((d, i) => ({
    label: CATEGORY_LABEL[d.key as FeatureCategory] ?? d.key,
    value: d.count,
    color: PALETTE[i % PALETTE.length],
  }));
  const srcSegments = srcDist.map((d, i) => ({
    label: d.key,
    value: d.count,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <AppHeader
          title="Feature Registry"
          titleEn="因子管理中心"
          subtitle="TOHOSHOU AI Feature 登记与管理中心 · 仅登记不计算，不参与任何评分 / 推荐 / 权重"
          status="V1"
          statusTone="blue"
        />

        {/* 原则声明 */}
        <AppCard accent={`${COLORS.primary}33`} style={{ background: `${COLORS.primary}08` }}>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            <b style={{ color: COLORS.text }}>Registry 只读原则：</b>
            本中心仅登记与管理 Feature 元数据，<b style={{ color: COLORS.text }}>不参与任何计算、不影响任何评分与推荐</b>。
            新增因子须先在此登记，再依次经 <b>Shadow → Backtest → Learning → Production</b> 验证，未经验证禁止进入正式评分。
            统计字段（命中率 / 收益 / 覆盖率）为<b>预留</b>，V1 一律为空。
          </div>
        </AppCard>

        {/* KPI */}
        <AppKpiGrid>
          <AppKpiCard label="Feature 总数" value={summary.total} tone="blue" />
          <AppKpiCard label="Production 正式" value={summary.production} tone="green" sub="已进入正式评分" />
          <AppKpiCard label="Shadow 影子" value={summary.shadow} tone="amber" sub="仅观测未接入" />
          <AppKpiCard label="Disabled 停用" value={summary.disabled} tone="neutral" />
          <AppKpiCard label="分类数" value={summary.categories} tone="purple" />
          <AppKpiCard label="来源数" value={summary.sources} tone="neutral" />
        </AppKpiGrid>

        {/* 分布 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AppCard header={<span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>分类分布 Category Distribution</span>}>
            <AppStackBar segments={catSegments} />
          </AppCard>
          <AppCard header={<span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>来源分布 Source Distribution</span>}>
            <AppStackBar segments={srcSegments} />
          </AppCard>
        </div>

        {/* 过滤器 */}
        <AppCard>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索 名称 / id / 说明…"
              style={{
                flex: "1 1 240px", minWidth: 200, height: 36, padding: "0 14px", fontSize: 13,
                border: `1px solid ${COLORS.border}`, borderRadius: 9999, background: COLORS.card, color: COLORS.text,
              }}
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["ALL", ...FEATURE_STATUSES] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  style={{
                    height: 32, padding: "0 12px", fontSize: 12, fontWeight: 600, borderRadius: 9999, cursor: "pointer",
                    border: `1px solid ${statusFilter === s ? COLORS.primary : COLORS.border}`,
                    background: statusFilter === s ? `${COLORS.primary}12` : COLORS.card,
                    color: statusFilter === s ? COLORS.primary : COLORS.textSecondary,
                  }}
                >
                  {s === "ALL" ? "全部状态" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {(catFilter !== "ALL" || statusFilter !== "ALL" || q) && (
              <AppButton size="sm" variant="ghost" onClick={() => { setQ(""); setStatusFilter("ALL"); setCatFilter("ALL"); }}>清除</AppButton>
            )}
          </div>
          {/* 分类芯片 */}
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setCatFilter("ALL")}
              style={chipStyle(catFilter === "ALL")}
            >全部分类</button>
            {catDist.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setCatFilter(d.key as FeatureCategory)}
                style={chipStyle(catFilter === d.key)}
              >
                {CATEGORY_LABEL[d.key as FeatureCategory]} <span style={{ opacity: 0.6 }}>{d.count}</span>
              </button>
            ))}
          </div>
        </AppCard>

        {/* 表格 */}
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Feature 清单</span>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>{rows.length} / {summary.total}</span>
          </div>
          <AppTable minWidth={860}>
            <thead>
              <tr>
                <AppTh>名称</AppTh>
                <AppTh>分类</AppTh>
                <AppTh>来源</AppTh>
                <AppTh>状态</AppTh>
                <AppTh>版本</AppTh>
                <AppTh>说明</AppTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className={appRowHover}>
                  <AppTd>
                    <span style={{ fontWeight: 600, color: COLORS.text }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: COLORS.textFaint, marginLeft: 8 }}>{f.id}</span>
                  </AppTd>
                  <AppTd><AppBadge tone="neutral">{CATEGORY_LABEL[f.category]}</AppBadge></AppTd>
                  <AppTd color={COLORS.textSecondary}>{f.source}</AppTd>
                  <AppTd><AppStatusChip kind={STATUS_KIND[f.status]} label={STATUS_LABEL[f.status]} /></AppTd>
                  <AppTd mono color={COLORS.textMuted}>{f.version}</AppTd>
                  <AppTd color={COLORS.textSecondary}>{f.description}</AppTd>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><AppTd align="center" color={COLORS.textFaint}>无匹配 Feature</AppTd><AppTd>{""}</AppTd><AppTd>{""}</AppTd><AppTd>{""}</AppTd><AppTd>{""}</AppTd><AppTd>{""}</AppTd></tr>
              )}
            </tbody>
          </AppTable>
        </div>
      </div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    height: 30, padding: "0 12px", fontSize: 12, fontWeight: 600, borderRadius: 9999, cursor: "pointer",
    border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
    background: active ? `${COLORS.primary}12` : COLORS.card,
    color: active ? COLORS.primary : COLORS.textSecondary,
  };
}
