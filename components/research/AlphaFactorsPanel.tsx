"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { fmtAsOf } from "./PanelFrame";
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
  { key: "rs5", label: "rp.flib.f.rs5", fmt: (v) => pct(v) },
  { key: "rs20", label: "rp.flib.f.rs20", fmt: (v) => pct(v) },
  { key: "rs60", label: "rp.flib.f.rs60", fmt: (v) => pct(v) },
  { key: "atr14", label: "rp.flib.f.atr14", fmt: (v) => num(v) },
  { key: "atrPct", label: "rp.flib.f.atrPct", fmt: (v) => pct(v) },
  { key: "distanceTo52WeekHigh", label: "rp.flib.f.d52h", fmt: (v) => pct(v) },
  { key: "distanceTo52WeekLow", label: "rp.flib.f.d52l", fmt: (v) => pct(v) },
  { key: "averageTurnover20", label: "rp.flib.f.to20", fmt: (v) => turnover(v) },
  { key: "volumeRatio5", label: "rp.flib.f.vr5", fmt: (v) => num(v) },
  { key: "volumeRatio20", label: "rp.flib.f.vr20", fmt: (v) => num(v) },
  { key: "volumeExpansionDays", label: "rp.flib.f.ved", fmt: (v) => (v == null ? "—" : String(v)) },
];
// 事件因子（布尔）。
const EVENT_FACTORS = ["rp.flib.e.buyback", "rp.flib.e.divRaise", "rp.flib.e.guidance", "rp.flib.e.tdnet"];

function pct(v: number | null) { return v == null ? "—" : `${v.toFixed(2)}%`; }
function num(v: number | null) { return v == null ? "—" : v.toFixed(2); }
function turnover(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e9) return `¥${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `¥${(v / 1e6).toFixed(1)}M`;
  return `¥${v.toFixed(0)}`;
}

export function AlphaFactorsPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
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
      title={tx("rp.flib.title")}
      titleEn="Factor Library"
      subtitle={tx("rp.flib.subtitle")}
      statusText={loading ? tx("common.loading") : hasData && !error ? tx("rp.flib.ready") : tx("common.no_data")}
      statusTone={loading ? "amber" : error || !hasData ? "neutral" : "green"}
      metaLabel={tx("common.asOf.data")}
      metaValue={fmtAsOf(data?.computedAt) ?? tx("common.no_data")}
      action={<ResearchButton onClick={goAnalytics} disabled={!goAnalytics}>{tx("rp.flib.toAnalytics")} →</ResearchButton>}
    />
  );

  if (error) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchErrorState
          message={error}
          hint={tx("rp.flib.errHint")}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.flib.backFactors")}</ResearchButton>}
        />
      </ResearchPanelShell>
    );
  }

  if (loading) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchLoadingState />
      </ResearchPanelShell>
    );
  }

  if (!hasData) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchEmptyState
          title={tx("rp.flib.emptyTitle")}
          desc={tx("rp.flib.emptyDesc")}
          actions={
            <>
              <ResearchButton variant="primary" onClick={goAnalytics} disabled={!goAnalytics}>{tx("rp.flib.toAnalytics")}</ResearchButton>
              <ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.flib.backFactors")}</ResearchButton>
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
        <ResearchKpiCard label={tx("rp.flib.kTotal")} value={COLS.length + EVENT_FACTORS.length} sub={`${COLS.length} + ${EVENT_FACTORS.length}`} tone="blue" />
        <ResearchKpiCard label={tx("rp.flib.kQuant")} value={COLS.length} sub={tx("rp.flib.kQuantSub")} />
        <ResearchKpiCard label={tx("rp.flib.kEvent")} value={EVENT_FACTORS.length} sub={tx("rp.flib.kEventSub")} />
        <ResearchKpiCard label={tx("rp.flib.kStocks")} value={totalStocks.toLocaleString()} sub={tx("rp.flib.kStocksSub")} tone="green" />
        <ResearchKpiCard label={tx("rp.flib.kDate")} value={<span className="text-[16px]">{data?.date ?? tx("common.no_data")}</span>} sub={tx("rp.flib.kDateSub")} />
        <ResearchKpiCard label={tx("rp.flib.kMode")} value={<span className="text-[16px]">{tx("rp.flib.kModeVal")}</span>} sub={tx("rp.flib.kModeSub")} tone="amber" />
      </ResearchKpiGrid>

      {/* 因子清单（API 无官方分类字段 → 展示真实因子清单，不伪造分类） */}
      <ResearchSection title={tx("rp.flib.listTitle")} desc={tx("rp.flib.listDesc")}>
        <div className="flex flex-wrap gap-2">
          {COLS.map((c) => (
            <ResearchChip key={c.key}>{tx(c.label)}</ResearchChip>
          ))}
          {EVENT_FACTORS.map((e) => (
            <ResearchChip key={e} tone="amber">{e}</ResearchChip>
          ))}
        </div>
        <div className="mt-3 text-[12px]" style={{ color: RM.faint }}>
          {tx("rp.flib.noCategory")}
        </div>
      </ResearchSection>

      {/* 因子明细矩阵（每行 = 一只股票的因子值） */}
      <ResearchSection
        title={tx("rp.flib.matrixTitle")}
        desc={tx("rp.flib.matrixDesc").replace("{n}", rows.length.toLocaleString())}
        right={
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tx("rp.flib.search")}
              className="text-[12px] rounded-lg px-3 h-9 w-52 focus:outline-none"
              style={{ background: RM.card, color: RM.ink, border: `1px solid ${RM.border}` }}
            />
            <ResearchButton onClick={exportCsv} disabled={!rows.length}>{tx("rp.flib.exportCsv")}</ResearchButton>
          </div>
        }
      >
        {rows.length === 0 ? (
          <ResearchEmptyState title={tx("rp.flib.noMatch")} desc={tx("rp.flib.noMatchDesc")} />
        ) : (
          <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
            <ResearchTable minWidth={1180}>
              <thead>
                <tr>
                  <RTh>{tx("rp.flib.colCode")}</RTh>
                  <RTh>{tx("rp.flib.colName")}</RTh>
                  {COLS.map((c) => (
                    <RTh key={c.key} align="right" sortable active={sortKey === c.key} dir={sortDir} onClick={() => toggleSort(c.key)}>
                      {tx(c.label)}
                    </RTh>
                  ))}
                  <RTh align="center">{tx("rp.flib.colEvent")}</RTh>
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
                {tx("rp.flib.rowLimit").replace("{n}", rows.length.toLocaleString())}
              </div>
            )}
          </div>
        )}
      </ResearchSection>
    </ResearchPanelShell>
  );
}
