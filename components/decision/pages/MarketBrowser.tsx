"use client";

// ── 全市场浏览器（P21-T4 · Stock Center Consolidation）──────────────────────────
//
// 承接原 /screener?tab=screen 的全部能力，成为**唯一**的股票浏览器：
//   统计卡（点击即筛选）· 评级/风格/市场/行业筛选 · 7 种排序 · 表格/卡片双模式 ·
//   服务端分页 · 真实自选（/api/watchlist）
//
// ⚠️ 关键设计约束（P21-T4 设计 §5.2 / §6.4）：
//   · **筛选、排序、分页全部服务端执行**。旧 Screen 是「取 200 行 → 前端筛」，
//     页面却写「全市场」——筛「グロース + 价值防御」可能得 0 条而全市场其实有几十只。
//     现在 total 与页码都来自 /api/screener 的 where 口径，数字是真的。
//   · GPT 综合评分排序走服务端 join（sort=finalScore），**禁止前端 join** ——
//     前端只拿到当前页，按它排序只是「本页内重排」，「全市场按综合评分排序」会是假的。
//   · 收藏统一到 /api/watchlist，不保留 Screen 的 localStorage 伪收藏。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppLoading } from "@/components/ui";
import { COLORS, fmtJpy, fmtPct, fmtScore, upDownColor } from "@/lib/decision/ds";
import { getPrimaryName } from "@/lib/company-name";
import { localeSector, SECTOR_MAP } from "@/lib/i18n/market-labels";
import { getRecommendationLabel } from "@/lib/rec-config";
import { Dropdown, Pagination, MktBadge } from "@/components/screener/ui";
import { StockCard } from "@/components/screener/StockCard";

const PAGE_SIZE = 24;
const STYLE_KEYS = [
  "QUALITY_COMPOUNDER", "GROWTH_MOMENTUM", "CYCLICAL_EXPORTER",
  "VALUE_DEFENSIVE", "DOMESTIC_DEFENSIVE", "SPECULATIVE_MOMENTUM",
] as const;
const RATINGS = ["", "STRONG_BUY", "BUY", "HOLD", "WATCH", "AVOID"] as const;
const SORTS = ["finalScore", "adaptiveScore", "opportunityScore", "percentileRank", "return20d", "rsi14", "latestDate"] as const;

type Row = {
  symbol: string; name: string; nameZh: string | null; nameEn?: string | null;
  market: string | null; sector: string | null;
  latestClose: number | null; return5d: number | null; return20d: number | null;
  rsi14: number | null; maTrend: string | null;
  adaptiveScore: number | null; stockStyle: string | null; highRiskFlag: boolean;
  recommendationV2: string | null; isWatchlist?: boolean;
};
type Stats = { total: number; strongBuy: number; buy: number; hold: number; watch: number; avoid: number };
type Resp = { stats: Stats; scores: Row[]; meta?: { total?: number } };

export default function MarketBrowser({ onDetail, favSet, toggleFav }: {
  onDetail: (symbol: string, name?: string) => void;
  favSet: Set<string>;
  toggleFav: (symbol: string, meta?: { name?: string | null; sector?: string | null; market?: string | null }) => void;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const urlSector = sp.get("sector") || "";

  const [rating, setRating] = useState<string>("");
  const [style, setStyle] = useState("ALL");
  const [market, setMarket] = useState("ALL");
  const [sector, setSector] = useState(urlSector);
  const [sortKey, setSortKey] = useState<string>("finalScore");
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [hideRisk, setHideRisk] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [mode, setMode] = useState<"table" | "card">("table");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setSector(urlSector); }, [urlSector]);
  // 任一筛选/排序变化 → 回到第 1 页（否则会停在一个越界页码上显示空列表）
  useEffect(() => { setPage(1); }, [rating, style, market, sector, sortKey, hideRisk]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const p = new URLSearchParams();
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String((page - 1) * PAGE_SIZE));
    p.set("sort", sortKey);
    if (rating) p.set("recommendationV2", rating);
    if (style !== "ALL") p.set("style", style);
    if (market !== "ALL") p.set("market", market);
    if (sector) p.set("sector", sector);
    if (hideRisk) p.set("highRisk", "false");
    fetch(`/api/screener?${p.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, [rating, style, market, sector, sortKey, hideRisk, page]);

  // ⚠️ 「仅自选 / 仅收藏」是**本页内过滤**（数据量 10 量级，无服务端参数）。
  //    与服务端筛选口径不同，故在 UI 上单独标注作用域，不混进「共 N 只」的计数。
  const rows = useMemo(() => {
    const src = data?.scores ?? [];
    return src.filter((r) => {
      if (onlyWatchlist && !r.isWatchlist) return false;
      if (onlyFav && !favSet.has(r.symbol)) return false;
      return true;
    });
  }, [data, onlyWatchlist, onlyFav, favSet]);

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const advCount = [onlyWatchlist, onlyFav, hideRisk].filter(Boolean).length;
  const st = data?.stats;

  const reset = useCallback(() => {
    setRating(""); setStyle("ALL"); setMarket("ALL"); setSortKey("finalScore");
    setOnlyWatchlist(false); setOnlyFav(false); setHideRisk(false); setPage(1);
    if (urlSector) router.replace("/decision-v2?tab=picks&view=all", { scroll: false });
    else setSector("");
  }, [router, urlSector]);

  const disp = (r: Row) => getPrimaryName({ name: r.name, nameZh: r.nameZh }, lang);

  return (
    <div className="space-y-3">
      {/* ── 统计卡（点击即筛选）───────────────────────────────────────────── */}
      <AppCard padding={0}>
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-5 py-3">
          <div className="flex items-baseline gap-2 pr-4" style={{ borderRight: `1px solid ${COLORS.border}` }}>
            <span className="text-[22px] font-semibold tabular-nums" style={{ color: COLORS.text }}>
              {st ? st.total.toLocaleString() : "—"}
            </span>
            <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{t("screener.result_count")}</span>
          </div>
          {([["STRONG_BUY", st?.strongBuy], ["BUY", st?.buy], ["HOLD", st?.hold], ["WATCH", st?.watch], ["AVOID", st?.avoid]] as const).map(([k, v]) => {
            const on = rating === k;
            return (
              <button key={k} onClick={() => setRating(on ? "" : k)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors"
                style={on ? { background: COLORS.tile } : undefined}>
                <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{getRecommendationLabel(k, lang)}</span>
                <span className="text-[14px] font-semibold tabular-nums" style={{ color: on ? COLORS.primary : COLORS.text }}>
                  {v == null ? "—" : v.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </AppCard>

      {/* ── 筛选区 ─────────────────────────────────────────────────────────── */}
      <AppCard padding={0}>
        <div className="px-5 py-3 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {RATINGS.map((l) => (
              <button key={l || "all"} onClick={() => setRating(l)}
                className="h-6 px-2.5 rounded-full transition-colors"
                style={{ background: rating === l ? COLORS.text : COLORS.tile, color: rating === l ? "#fff" : COLORS.textSecondary }}>
                {l ? getRecommendationLabel(l, lang) : t("screener.all")}
              </button>
            ))}
            <Dropdown value={style} width={130}
              options={[{ value: "ALL", label: t("screener.all_styles") }, ...STYLE_KEYS.map((s) => ({ value: s, label: t(`style.short.${s}` as Parameters<typeof t>[0]) }))]}
              onChange={setStyle} />
            <Dropdown value={market} width={120}
              options={[{ value: "ALL", label: t("screener.all_markets") }, { value: "プライム", label: t("market.prime") }, { value: "スタンダード", label: t("market.standard") }, { value: "グロース", label: t("market.growth") }]}
              onChange={setMarket} />
            <Dropdown value={sector || "ALL"} width={150}
              options={[{ value: "ALL", label: t("sc.allSectors") }, ...Object.keys(SECTOR_MAP).map((s) => ({ value: s, label: localeSector(s, lang) }))]}
              onChange={(v) => setSector(v === "ALL" ? "" : v)} />
            <button onClick={() => setAdvOpen((v) => !v)} className="h-6 px-2.5 rounded-full ml-auto"
              style={{ background: advCount ? COLORS.primary : COLORS.tile, color: advCount ? "#fff" : COLORS.textSecondary }}>
              {t("sc.advanced")}{advCount ? ` (${advCount})` : ""}
            </button>
          </div>

          {advOpen && (
            <div className="flex items-center gap-3 flex-wrap text-[11px] pt-1" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
              {([["sc.onlyWatchlist", onlyWatchlist, setOnlyWatchlist], ["sc.onlyFav", onlyFav, setOnlyFav], ["sc.hideRisk", hideRisk, setHideRisk]] as const).map(([k, v, set]) => (
                <label key={k} className="flex items-center gap-1.5 cursor-pointer" style={{ color: COLORS.textSecondary }}>
                  <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
                  {t(k as Parameters<typeof t>[0])}
                </label>
              ))}
              <span className="text-[10px]" style={{ color: COLORS.textFaint }}>ⓘ {t("sc.pageScopeNote")}</span>
              <button onClick={reset} className="ml-auto h-6 px-2.5 rounded-full" style={{ background: COLORS.tile, color: COLORS.textSecondary }}>
                {t("common.reset")}
              </button>
            </div>
          )}
        </div>
      </AppCard>

      {/* ── 排序 + 模式切换 ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 flex-wrap text-[11px]">
        <Dropdown value={sortKey} width={160}
          options={SORTS.map((s) => ({ value: s, label: t(`sc.sort.${s}` as Parameters<typeof t>[0]) }))}
          onChange={setSortKey} />
        <span style={{ color: COLORS.textFaint }}>
          {total.toLocaleString()} {t("screener.result_count")}
          {rows.length !== (data?.scores.length ?? 0) ? ` · ${t("sc.pageFiltered")} ${rows.length}` : ""}
        </span>
        <div className="ml-auto flex p-0.5 rounded-lg gap-0.5" style={{ background: COLORS.track }}>
          {(["table", "card"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="px-2.5 py-1 rounded-md text-[11px] font-medium"
              style={{ background: mode === m ? COLORS.card : "transparent", color: mode === m ? COLORS.text : COLORS.textSecondary }}>
              {t(`sc.mode.${m}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* ── 列表 ───────────────────────────────────────────────────────────── */}
      {loading ? <div className="py-10"><AppLoading label={t("dv.sc.loading")} /></div>
        : rows.length === 0 ? <div className="text-[12px] py-10 text-center" style={{ color: COLORS.textFaint }}>{t("dv.sc.all.empty")}</div>
          : mode === "card" ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {rows.map((r, i) => (
                <StockCard key={r.symbol} s={r} rank={(page - 1) * PAGE_SIZE + i + 1}
                  displayScore={r.adaptiveScore} href={`/stocks/${encodeURIComponent(r.symbol)}`}
                  favorited={favSet.has(r.symbol)}
                  onToggleFav={() => toggleFav(r.symbol, { name: r.name, sector: r.sector, market: r.market })} />
              ))}
            </div>
          ) : (
            <AppCard padding={0}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                      <th className="py-1.5 pl-5 pr-2 text-left font-medium">{t("wl.col.stock")}</th>
                      <th className="py-1.5 px-2 text-right font-medium">{t("dc.ov.currentPrice")}</th>
                      <th className="py-1.5 px-2 text-right font-medium">{t("dv.sc.col.ret5d")}</th>
                      <th className="py-1.5 px-2 text-right font-medium">AI</th>
                      <th className="py-1.5 px-2 text-left font-medium">{t("dv.rc.col.level")}</th>
                      <th className="py-1.5 px-2 text-left font-medium">{t("dv.sc.col.sector")}</th>
                      <th className="py-1.5 pr-5 pl-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.symbol} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                        <td className="py-1.5 pl-5 pr-2">
                          <button onClick={() => onDetail(r.symbol, disp(r))} className="text-left hover:underline" style={{ color: COLORS.text }}>
                            <span className="font-mono text-[11px]" style={{ color: COLORS.primary }}>{r.symbol}</span>{" "}
                            <span>{disp(r)}</span>
                          </button>
                          {r.market ? <span className="ml-1.5 align-middle"><MktBadge mkt={r.market} /></span> : null}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.latestClose)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.return5d) }}>{fmtPct(r.return5d)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: COLORS.text }}>{fmtScore(r.adaptiveScore)}</td>
                        <td className="py-1.5 px-2" style={{ color: COLORS.textSecondary }}>{r.recommendationV2 ? getRecommendationLabel(r.recommendationV2, lang) : "—"}</td>
                        <td className="py-1.5 px-2" style={{ color: COLORS.textSecondary }}>{r.sector ? localeSector(r.sector, lang) : "—"}</td>
                        <td className="py-1.5 pr-5 pl-2 text-right">
                          <button onClick={() => toggleFav(r.symbol, { name: r.name, sector: r.sector, market: r.market })}
                            aria-label="watchlist" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: favSet.has(r.symbol) ? COLORS.warning : COLORS.textFaint }}>
                            {favSet.has(r.symbol) ? "★" : "☆"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AppCard>
          )}

      {/* ── 分页（服务端）─────────────────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      )}
    </div>
  );
}
