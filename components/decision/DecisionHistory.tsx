"use client";

// ── 决策中心 · 历史记录（P7-02B-2）───────────────────────────────────────────
// 纯只读复用 GET /api/admin/closing-decision（availableDates + ?date=）浏览历史收盘决策。
// 不新增算法、不新增字段：左侧日期列表 → 右侧展示该日 verdict / 第一推荐 / 组合 / 总结。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading, AppEmptyState, COLORS } from "@/components/ui";

interface Top1 { symbol: string; name: string | null; aiScore: number | null; confidence: string | null; }
interface Leg { symbol: string; name: string | null; weight: number; }
interface Api {
  ok: boolean; empty?: boolean; date?: string; decidedAtJst?: string | null;
  verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null;
  top1?: Top1 | null; portfolio?: Leg[]; summary?: string | null; availableDates?: string[];
}

const VERDICT_TONE: Record<string, "green" | "amber" | "red"> = { BUY_TODAY: "green", WATCH_ONLY: "amber", STAY_CASH: "red" };

export default function DecisionHistory() {
  const { t } = useI18n();
  const [dates, setDates] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [row, setRow] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);

  // 初次加载：拿最新决策 + availableDates
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const j = (await fetch("/api/admin/closing-decision", { cache: "no-store" }).then((r) => r.json())) as Api;
        if (!alive) return;
        setDates(j.availableDates ?? []);
        setSel(j.date ?? (j.availableDates?.[0] ?? null));
        setRow(j);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  async function pick(d: string) {
    if (d === sel) return;
    setSel(d); setLoading(true);
    try {
      const j = (await fetch(`/api/admin/closing-decision?date=${d}`, { cache: "no-store" }).then((r) => r.json())) as Api;
      setRow(j);
    } finally { setLoading(false); }
  }

  if (!dates.length && !loading) return <AppEmptyState title={t("dc.history.empty")} />;

  return (
    <AppCard header={<span style={{ fontWeight: 600 }}>{t("dc.history.title")}</span>}>
      <div className="flex flex-col sm:flex-row gap-4">
        {/* 日期列表（横向滚动 on mobile） */}
        <div className="flex sm:flex-col gap-1.5 overflow-x-auto sm:w-40 sm:shrink-0 pb-1">
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => pick(d)}
              className="px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap text-left transition-colors"
              style={{
                background: d === sel ? COLORS.primary : COLORS.tile,
                color: d === sel ? "#fff" : COLORS.textSecondary,
                fontWeight: d === sel ? 600 : 500,
                border: `1px solid ${d === sel ? COLORS.primary : COLORS.border}`,
              }}
            >{d}</button>
          ))}
        </div>

        {/* 详情 */}
        <div className="flex-1 min-w-0">
          {loading ? <AppLoading /> : row && !row.empty ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {row.verdict && <AppBadge tone={VERDICT_TONE[row.verdict]}>{row.verdict.replace("_", " ")}</AppBadge>}
                <span className="text-[12px]" style={{ color: COLORS.textFaint }}>{row.date} {row.decidedAtJst ?? ""}</span>
              </div>
              {row.verdictReason && <div className="text-[12px]" style={{ color: COLORS.textSecondary }}>{row.verdictReason}</div>}
              {row.top1 && (
                <div className="text-[13px]" style={{ color: COLORS.text }}>
                  <span style={{ fontWeight: 600 }}>{t("dc.ov.firstPick")}:</span> {row.top1.name ?? row.top1.symbol} ({row.top1.symbol})
                  {row.top1.aiScore != null && ` · AI ${row.top1.aiScore}`}
                  {row.top1.confidence && ` · ${t("dc.ov.confidence")} ${row.top1.confidence}`}
                </div>
              )}
              {!!(row.portfolio && row.portfolio.length) && (
                <div className="flex flex-wrap gap-1.5">
                  {row.portfolio.map((l) => (
                    <span key={l.symbol} className="px-2 py-1 rounded-md text-[11px]" style={{ background: COLORS.tile, border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary }}>
                      {l.name ?? l.symbol} {Math.round(l.weight)}%
                    </span>
                  ))}
                </div>
              )}
              {row.summary && <div className="text-[12px] leading-relaxed" style={{ color: COLORS.textSecondary, whiteSpace: "pre-wrap" }}>{row.summary}</div>}
            </div>
          ) : <AppEmptyState title={t("dc.history.empty")} />}
        </div>
      </div>
    </AppCard>
  );
}
