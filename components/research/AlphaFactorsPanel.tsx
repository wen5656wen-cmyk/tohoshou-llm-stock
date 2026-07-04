"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RM,
  ResearchPanelShell,
  ResearchHero,
  ResearchButton,
  ResearchKpiGrid,
  ResearchKpiCard,
  ResearchSection,
  ResearchChip,
  ResearchTable,
  RTh,
  RTd,
  rowHoverClass,
  ResearchLoadingState,
  ResearchEmptyState,
  ResearchErrorState,
} from "./kit";

// Alpha因子库 — Alpha Factor Library（AI 研究中心 · 因子研究组）。
// 纯展示层：只读现有 /api/alpha，展示 Alpha 引擎底层技术因子的覆盖与明细。
// 不改任何 API / 因子计算 / 评分逻辑。因子标识（RS5/ATR14/…）为技术名，不翻译。

type AlphaRow = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  sector: string | null;
  market: string | null;
  rs5: number | null; rs20: number | null; rs60: number | null;
  atr14: number | null; atrPct: number | null;
  distanceTo52WeekHigh: number | null; distanceTo52WeekLow: number | null;
  averageTurnover20: number | null;
  volumeRatio5: number | null; volumeRatio20: number | null;
  volumeExpansionDays: number | null;
  buyback: boolean | null; dividendRaise: boolean | null;
  guidanceRaise: boolean | null; tdnetEvent: boolean | null;
};

type ApiResp = { date: string | null; computedAt: string | null; total: number; rows: AlphaRow[] };

type NumKey =
  | "rs5" | "rs20" | "rs60" | "atr14" | "atrPct"
  | "distanceTo52WeekHigh" | "distanceTo52WeekLow"
  | "averageTurnover20" | "volumeRatio5" | "volumeRatio20" | "volumeExpansionDays";

// 库内量化因子清单（列 = 因子维度）。均为真实字段，非新算指标。
const COLS: { key: NumKey; label: string; fmt: (v: number | null) => string }[] = [
  { key: "rs5", label: "相对强弱5日 · RS5", fmt: (v) => pct(v) },
  { key: "rs20", label: "相对强弱20日 · RS20", fmt: (v) => pct(v) },
  { key: "rs60", label: "相对强弱60日 · RS60", fmt: (v) => pct(v) },
  { key: "atr14", label: "波动幅度 · ATR14", fmt: (v) => num(v) },
  { key: "atrPct", label: "波动率% · ATR%", fmt: (v) => pct(v) },
  { key: "distanceTo52WeekHigh", label: "距52周高 · 52WH", fmt: (v) => pct(v) },
  { key: "distanceTo52WeekLow", label: "距52周低 · 52WL", fmt: (v) => pct(v) },
  { key: "averageTurnover20", label: "20日成交额 · TO20", fmt: (v) => turnover(v) },
  { key: "volumeRatio5", label: "5日量比 · VR5", fmt: (v) => num(v) },
  { key: "volumeRatio20", label: "20日量比 · VR20", fmt: (v) => num(v) },
  { key: "volumeExpansionDays", label: "放量天数 · VED", fmt: (v) => (v == null ? "—" : String(v)) },
];
// 事件因子（布尔）。
const EVENT_FACTORS = ["回购 · Buyback", "增派息 · DividendRaise", "上调指引 · GuidanceRaise", "TDnet事件 · TDnetEvent"];

function pct(v: number | null) { return v == null ? "—" : `${v.toFixed(2)}%`; }
function num(v: number | null) { return v == null ? "—" : v.toFixed(2); }
function turnover(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e9) return `¥${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `¥${(v / 1e6).toFixed(1)}M`;
  return `¥${v.toFixed(0)}`;
}

export function AlphaFactorsPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<NumKey>("averageTurnover20");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    fetch("/api/alpha?limit=5000")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: ApiResp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows;
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      r = r.filter((x) =>
        x.symbol.toLowerCase().includes(ql) ||
        (x.name ?? "").toLowerCase().includes(ql) ||
        (x.nameZh ?? "").includes(q.trim()) ||
        (x.nameEn ?? "").toLowerCase().includes(ql)
      );
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [data, q, sortKey, sortDir]);

  function toggleSort(k: NumKey) {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function exportCsv() {
    const header = ["symbol", "name", "sector", "market", ...COLS.map((c) => c.key),
      "buyback", "dividendRaise", "guidanceRaise", "tdnetEvent"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const vals = [
        r.symbol, `"${(r.name ?? "").replace(/"/g, '""')}"`, r.sector ?? "", r.market ?? "",
        ...COLS.map((c) => r[c.key] ?? ""),
        r.buyback ?? "", r.dividendRaise ?? "", r.guidanceRaise ?? "", r.tdnetEvent ?? "",
      ];
      lines.push(vals.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alpha-factors-${data?.date ?? "latest"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalStocks = data?.total ?? 0;
  const hasData = !!data && totalStocks > 0;
  const goAnalytics = onNavigate ? () => onNavigate("analytics") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;

  const hero = (
    <ResearchHero
      title="Alpha因子库"
      titleEn="Factor Library"
      subtitle="因子资产库 · 覆盖率 · 启用状态 · 研究健康度"
      statusText={loading ? "运行中" : error ? "暂无数据" : hasData ? "已就绪" : "暂无数据"}
      statusTone={loading ? "amber" : error || !hasData ? "neutral" : "green"}
      metaLabel="最近更新"
      metaValue={data?.computedAt ? new Date(data.computedAt).toLocaleString("zh-CN") : "暂无数据"}
      action={<ResearchButton onClick={goAnalytics} disabled={!goAnalytics}>查看因子分析 →</ResearchButton>}
    />
  );

  if (error) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchErrorState
          message={error}
          hint={<>请运行 <code style={{ color: RM.sub }}>npm run compute-alpha-factors</code> 生成因子数据。</>}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>}
        />
      </ResearchPanelShell>
    );
  }

  if (loading) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchLoadingState label="正在加载 Alpha 因子库…" />
      </ResearchPanelShell>
    );
  }

  if (!hasData) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchEmptyState
          title="暂无 Alpha 因子数据"
          desc="当前因子库尚未生成或 API 暂无返回。"
          actions={
            <>
              <ResearchButton variant="primary" onClick={goAnalytics} disabled={!goAnalytics}>查看因子分析</ResearchButton>
              <ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>
            </>
          }
        />
      </ResearchPanelShell>
    );
  }

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI —— 全部为真实字段/结构派生，无字段处显示暂无数据 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label="因子总数" value={COLS.length + EVENT_FACTORS.length} sub={`${COLS.length} 量化 · ${EVENT_FACTORS.length} 事件`} tone="blue" />
        <ResearchKpiCard label="量化因子" value={COLS.length} sub="技术 / 量价维度" />
        <ResearchKpiCard label="事件因子" value={EVENT_FACTORS.length} sub="回购 / 派息 / 指引 / TDnet" />
        <ResearchKpiCard label="覆盖股票数" value={totalStocks.toLocaleString()} sub="最新交易日" tone="green" />
        <ResearchKpiCard label="数据日期" value={<span className="text-[16px]">{data?.date ?? "暂无数据"}</span>} sub="因子快照" />
        <ResearchKpiCard label="研究状态" value={<span className="text-[16px]">研究模式</span>} sub="不影响正式AI推荐" tone="amber" />
      </ResearchKpiGrid>

      {/* 因子清单（API 无官方分类字段 → 展示真实因子清单，不伪造分类） */}
      <ResearchSection title="因子清单" desc="Alpha 引擎当前追踪的量化与事件因子（API 暂无官方分类字段）">
        <div className="flex flex-wrap gap-2">
          {COLS.map((c) => (
            <ResearchChip key={c.key}>{c.label}</ResearchChip>
          ))}
          {EVENT_FACTORS.map((e) => (
            <ResearchChip key={e} tone="amber">{e}</ResearchChip>
          ))}
        </div>
        <div className="mt-3 text-[12px]" style={{ color: RM.faint }}>
          暂无官方分类数据 · 因子有效性与重要度请见 <button onClick={goAnalytics} disabled={!goAnalytics} className="font-semibold disabled:opacity-40" style={{ color: RM.blue }}>因子分析</button>
        </div>
      </ResearchSection>

      {/* 因子明细矩阵（每行 = 一只股票的因子值） */}
      <ResearchSection
        title="因子明细矩阵"
        desc={`按股票展示底层因子值 · 共 ${rows.length.toLocaleString()} 行`}
        right={
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索代码 / 名称…"
              className="text-[12px] rounded-lg px-3 h-9 w-52 focus:outline-none"
              style={{ background: RM.card, color: RM.ink, border: `1px solid ${RM.border}` }}
            />
            <ResearchButton onClick={exportCsv} disabled={!rows.length}>导出CSV</ResearchButton>
          </div>
        }
      >
        {rows.length === 0 ? (
          <ResearchEmptyState title="无匹配因子行" desc="尝试更换搜索关键词，或清空搜索框。" />
        ) : (
          <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
            <ResearchTable minWidth={1180}>
              <thead>
                <tr>
                  <RTh>股票代码</RTh>
                  <RTh>股票名称</RTh>
                  {COLS.map((c) => (
                    <RTh key={c.key} align="right" sortable active={sortKey === c.key} dir={sortDir} onClick={() => toggleSort(c.key)}>
                      {c.label}
                    </RTh>
                  ))}
                  <RTh align="center">事件</RTh>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 600).map((r) => (
                  <tr key={r.symbol} className={rowHoverClass}>
                    <RTd mono>
                      <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} style={{ color: RM.blue }} className="hover:underline">
                        {r.symbol}
                      </Link>
                    </RTd>
                    <RTd color={RM.sub}>
                      <span className="truncate inline-block max-w-[160px] align-bottom">{r.nameZh ?? r.name}</span>
                    </RTd>
                    {COLS.map((c) => (
                      <RTd key={c.key} align="right" mono>{c.fmt(r[c.key])}</RTd>
                    ))}
                    <RTd align="center" color={RM.faint}>
                      {[r.buyback && "BB", r.dividendRaise && "DR", r.guidanceRaise && "GR", r.tdnetEvent && "TD"]
                        .filter(Boolean).join(" ") || "—"}
                    </RTd>
                  </tr>
                ))}
              </tbody>
            </ResearchTable>
            {rows.length > 600 && (
              <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>
                为保证渲染性能，仅展示前 600 行（共 {rows.length.toLocaleString()} 行）。完整数据请使用「导出CSV」。
              </div>
            )}
          </div>
        )}
      </ResearchSection>
    </ResearchPanelShell>
  );
}
