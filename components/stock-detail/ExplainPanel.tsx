"use client";

// ── AI决策解释 · Explain Engine 前端接入（P5-T2 Phase 1）──────────────────────
// 只读 GET /api/explain/[symbol]?provider=rule，展示统一 ExplainResult 的 10 个字段。
// 纯展示层：不重算、不改任何评分。含 Loading / Empty / Error 状态，失败不影响页面其它内容。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { C } from "@/components/stock-detail/ui";
import type { ExplainResult, ExplainPoint } from "@/lib/explain/types";

type Status = "loading" | "ok" | "empty" | "error";

const CONF_COLOR: Record<string, string> = { HIGH: C.green, MEDIUM: C.amber, LOW: C.red };

function SectionHead({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
      <span className="text-[12px] font-semibold" style={{ color: C.ink }}>{label}</span>
    </div>
  );
}

function PointList({ points, color, empty }: { points: ExplainPoint[]; color: string; empty: string }) {
  if (!points.length) return <div className="text-[11px]" style={{ color: C.faint }}>{empty}</div>;
  return (
    <ul className="space-y-1.5">
      {points.map((p, i) => (
        <li key={p.code + i} className="flex gap-2">
          <span style={{ width: 5, height: 5, borderRadius: 999, background: color, flexShrink: 0, marginTop: 6 }} />
          <div className="min-w-0">
            <div className="text-[12px] leading-snug" style={{ color: C.ink }}>{p.title}</div>
            {p.detail && <div className="text-[11px] leading-snug mt-0.5" style={{ color: C.sub }}>{p.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ExplainPanel({ symbol }: { symbol: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<ExplainResult | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fetch(`/api/explain/${encodeURIComponent(symbol)}?provider=rule`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ExplainResult) => {
        if (!alive) return;
        const empty = !d.recommendation && d.strengths.length === 0 && d.weaknesses.length === 0 && d.risks.length === 0;
        setData(d);
        setStatus(empty ? "empty" : "ok");
      })
      .catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, [symbol]);

  const Header = (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold" style={{ color: C.ink }}>{t("explain.panel.title")}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${C.blue}14`, color: C.blue }}>{t("explain.panel.provider_rule")}</span>
      </div>
      {data?.confidence && status === "ok" && (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${CONF_COLOR[data.confidence.level]}18`, color: CONF_COLOR[data.confidence.level] }}>
          {t("explain.panel.confidence")} {data.confidence.label}{data.confidence.score != null ? ` ${data.confidence.score}` : ""}
        </span>
      )}
    </div>
  );

  // ── Loading ──
  if (status === "loading") {
    return (
      <section className="dash-card p-4">
        {Header}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-3 rounded animate-pulse" style={{ background: "#F0F0F3", width: `${90 - i * 12}%` }} />)}
        </div>
      </section>
    );
  }

  // ── Error / 无评分数据 → 暂无AI解释（不影响页面其它内容）──
  if (status === "error" || status === "empty") {
    return (
      <section className="dash-card p-4">
        {Header}
        <div className="text-[12px] py-2" style={{ color: C.faint }}>{t("explain.panel.empty")}</div>
      </section>
    );
  }

  const d = data!;
  const nodata = t("explain.panel.nodata");

  return (
    <section className="dash-card p-4 space-y-3.5">
      {Header}

      {/* 1. 综合结论 */}
      <div>
        <SectionHead color={C.sub} label={t("explain.panel.summary")} />
        <p className="text-[12px] leading-relaxed" style={{ color: C.ink }}>{d.overallSummary || nodata}</p>
      </div>

      {/* 7. 建议策略 / 8. 持有周期 */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl px-3 py-2" style={{ background: `${C.blue}0D`, border: `1px solid ${C.blue}22` }}>
          <div className="text-[10px]" style={{ color: C.sub }}>{t("explain.panel.strategy")}</div>
          <div className="text-[12px] font-semibold mt-0.5" style={{ color: C.ink }}>{d.recommendedStrategy || nodata}</div>
        </div>
        <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "#F7F7F9", border: `1px solid ${C.line}` }}>
          <div className="text-[10px]" style={{ color: C.sub }}>{t("explain.panel.holding")}</div>
          <div className="text-[12px] font-semibold mt-0.5" style={{ color: C.ink }}>{d.holdingPeriod || nodata}</div>
        </div>
      </div>

      {/* 2. 核心优势（绿）*/}
      <div><SectionHead color={C.green} label={t("explain.panel.strengths")} /><PointList points={d.strengths} color={C.green} empty={nodata} /></div>

      {/* 3. 主要弱点（橙）*/}
      <div><SectionHead color={C.amber} label={t("explain.panel.weaknesses")} /><PointList points={d.weaknesses} color={C.amber} empty={nodata} /></div>

      {/* 4. 风险提示（红）*/}
      <div><SectionHead color={C.red} label={t("explain.panel.risks")} /><PointList points={d.risks} color={C.red} empty={nodata} /></div>

      {/* 5. 机会点（紫）*/}
      <div><SectionHead color={C.purple} label={t("explain.panel.opportunities")} /><PointList points={d.opportunities} color={C.purple} empty={nodata} /></div>

      {/* 6. 市场环境（蓝）*/}
      <div>
        <SectionHead color={C.blue} label={t("explain.panel.market")} />
        <p className="text-[12px] leading-relaxed" style={{ color: C.sub }}>{d.marketContext || nodata}</p>
      </div>

      {/* 10. 后续关注 */}
      <div>
        <SectionHead color={C.blue} label={t("explain.panel.next")} />
        {d.nextObservation.length ? (
          <ul className="space-y-1">
            {d.nextObservation.map((n, i) => (
              <li key={i} className="flex gap-2 text-[12px]" style={{ color: C.ink }}>
                <span style={{ color: C.blue }}>›</span><span className="min-w-0">{n}</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-[11px]" style={{ color: C.faint }}>{nodata}</div>}
      </div>
    </section>
  );
}
