"use client";

// AI 研究中心统一页头（P2-T7/T8）。标题/说明/元信息/最后更新时间 统一样式。纯展示。

// 专业名词中文解释（Tooltip，P2-T7 §十）
export const TERM_TIPS: Record<string, string> = {
  ATR: "平均真实波幅：衡量价格波动幅度（越大越波动）",
  "波动率%": "ATR 占价格的百分比：衡量相对波动幅度",
  IC: "信息系数：因子值与未来收益的相关性（Pearson）",
  "Rank IC": "秩相关信息系数（Spearman）：更稳健的排名相关性",
  "夏普比率": "风险调整后收益 = 平均收益 / 波动，越高越好",
  Alpha: "超额收益：相对基准（TOPIX）多出的收益",
  "市场宽度": "高于 20 日均线的股票占比，反映普涨/普跌程度",
  "波动率": "TOPIX 20 日实现波动率（年化）",
  RS: "相对强弱：个股相对 TOPIX 的超额收益",
  "相对强弱5日": "近 5 日相对 TOPIX 的超额收益（RS）",
  "相对强弱20日": "近 20 日相对 TOPIX 的超额收益（RS）",
  "相对强弱60日": "近 60 日相对 TOPIX 的超额收益（RS）",
  "量比": "当日成交量与近期平均成交量之比（Volume Ratio）",
  "5日量比": "当日成交量与近 5 日均量之比（Volume Ratio）",
  "20日量比": "当日成交量与近 20 日均量之比（Volume Ratio）",
  TOPIX: "东证股价指数，日本市场基准指数",
  "趋势": "TOPIX 均线组合方向评分（-1 空头 ~ +1 多头）",
};

function fmtJst(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.length >= 16 ? iso.slice(0, 16).replace("T", " ") : iso;
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}
function freshness(iso: string | null | undefined): { label: string; color: string } {
  if (!iso) return { label: "无数据", color: "#dc2626" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: "正常", color: "#16a34a" };
  const h = (Date.now() - d.getTime()) / 3600000;
  return h < 24 ? { label: "正常", color: "#16a34a" } : h < 48 ? { label: "偏旧", color: "#d97706" } : { label: "超时", color: "#dc2626" };
}

export function PanelHeader({
  title, desc, phase, dataDate, computedAt, stockCount, statusText, loading, error,
}: {
  title: string;
  desc: string;
  phase: string;
  dataDate?: string | null;
  computedAt?: string | null;
  stockCount?: number | null;
  statusText: string;
  loading?: boolean;
  error?: string | null;
}) {
  const fresh = freshness(computedAt);
  const ct = fmtJst(computedAt);
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
      <p className="text-sm text-slate-500 mt-1">{desc}</p>
      {loading ? (
        <p className="text-xs text-slate-400 mt-2">加载中…</p>
      ) : error ? (
        <p className="text-xs text-red-500 mt-2">加载失败：{error}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
          <span>阶段：<span className="text-slate-700 font-medium">{phase}</span></span>
          {dataDate ? <span>数据日期：<span className="text-slate-700 font-medium tabular-nums">{dataDate}</span></span> : null}
          <span>计算时间：<span className="text-slate-700 font-medium tabular-nums">{ct ?? "—"}</span></span>
          {stockCount != null ? <span>股票数量：<span className="text-slate-700 font-medium tabular-nums">{stockCount.toLocaleString()}</span>只</span> : null}
          <span>数据状态：<span className="font-medium" style={{ color: fresh.color === "#16a34a" ? "#059669" : fresh.color }}>{statusText}</span></span>
          <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: `${fresh.color}14`, color: fresh.color }}>
            最后更新：<span className="tabular-nums font-medium">{ct ?? "—"}</span> · {fresh.label}
          </span>
        </div>
      )}
    </div>
  );
}
