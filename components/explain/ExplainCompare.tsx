"use client";

// ── ExplainCompare · 推荐 VS 未推荐（P10-RESEARCH-01）────────────────────────
// 30 秒内回答：① 为什么 A 被推荐 ② 为什么 B 未被推荐 ③ B 距离 BUY 还差什么
//               ④ 两只最明显的差异是什么
//
// 纯展示层：只读 /api/explain/[symbol]（strengths.weight）+ /api/screener（BUY 群体基准）。
// 不改 GPT / AI评分 / Recommendation Engine / Portfolio Builder / 各引擎 / Cron / Schema / DB。
// 口径纪律（lib/explain/gap.ts 强制）：
//   · 官方门槛（adaptiveScore≥70 且 percentileRank≤15%）→「达标/未达标/还差 X 分」
//   · BUY 群体均值（技术/基本面/资金/动量…）→「高于/低于 BUY 群体均值 + 参考差值」，
//     必须标注「非官方门槛，仅供横向比较」+ 当日样本数。禁止混用。

import { useEffect, useState } from "react";
import { AppCard, AppBadge, AppLoading, COLORS } from "@/components/ui";
import {
  starsOf, starStr, officialGap, cohortGap, buildBaseline, COHORT_DISCLAIMER,
  type Baseline, type GapItem,
} from "@/lib/explain/gap";

type Point = { title: string; detail?: string; weight?: number | null };
type Explain = {
  symbol: string; name: string | null; recommendation: string | null;
  overallSummary: string; strengths: Point[]; weaknesses: Point[];
  confidence: { level: string; score: number | null };
};
type Row = Record<string, unknown> & { symbol: string; recommendationV2?: string | null; adaptiveScore?: number | null; percentileRank?: number | null };

const RECO_TONE = (r: string | null | undefined) =>
  r === "STRONG_BUY" ? "red" : r === "BUY" ? "amber" : r === "HOLD" ? "blue" : "neutral";

export default function ExplainCompare({ symbolA, symbolB }: { symbolA: string; symbolB: string }) {
  const [a, setA] = useState<Explain | null>(null);
  const [b, setB] = useState<Explain | null>(null);
  const [rowA, setRowA] = useState<Row | null>(null);
  const [rowB, setRowB] = useState<Row | null>(null);
  const [base, setBase] = useState<Baseline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const j = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [ea, eb, sc] = await Promise.all([
        j(`/api/explain/${encodeURIComponent(symbolA)}?provider=rule`),
        j(`/api/explain/${encodeURIComponent(symbolB)}?provider=rule`),
        j(`/api/screener?limit=500&sort=adaptiveScore`),
      ]);
      if (!alive) return;
      setA(ea); setB(eb);
      const rows: Row[] = sc?.scores ?? [];
      setBase(buildBaseline(rows));
      setRowA(rows.find((r) => r.symbol === symbolA) ?? null);
      setRowB(rows.find((r) => r.symbol === symbolB) ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [symbolA, symbolB]);

  if (loading) return <AppLoading />;
  if (!a && !b) return <AppCard><div className="text-[12px]" style={{ color: COLORS.textFaint }}>暂无数据</div></AppCard>;

  const official = rowB ? officialGap((rowB.adaptiveScore as number) ?? null, (rowB.percentileRank as number) ?? null) : [];
  const cohort = rowB && base ? cohortGap(rowB, base) : [];

  // ④ 最明显差异：同维度差值绝对值最大的前 3 项（A − B，真实字段）
  const diffs = rowA && rowB && base
    ? cohortGap(rowA, base).map((ga, i) => ({ ga, gb: cohort[i] })).filter((x) => x.gb) : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* ① 为什么 A 被推荐 */}
        <AppCard header={
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>✅ 为什么推荐</span>
            <span className="text-[12px]" style={{ color: COLORS.text }}>{a?.name ?? symbolA}</span>
            <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{symbolA}</span>
            <AppBadge tone={RECO_TONE(a?.recommendation)}>{a?.recommendation ?? "—"}</AppBadge>
          </div>
        }>
          {a ? (
            <div className="space-y-1.5">
              {(a.strengths ?? []).slice(0, 4).map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px]">
                  <span className="shrink-0 tabular-nums" style={{ color: COLORS.warning }}>{starStr(starsOf(s.weight))}</span>
                  <span style={{ color: COLORS.text }}>{s.title}</span>
                  <span className="ml-auto text-[10px] tabular-nums shrink-0" style={{ color: COLORS.textFaint }}>{Math.round(s.weight ?? 0)}</span>
                </div>
              ))}
              {!(a.strengths ?? []).length && <div className="text-[12px]" style={{ color: COLORS.textFaint }}>暂无数据</div>}
            </div>
          ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>暂无数据</div>}
        </AppCard>

        {/* ② 为什么 B 未被推荐 */}
        <AppCard header={
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⛔ 为什么未推荐</span>
            <span className="text-[12px]" style={{ color: COLORS.text }}>{b?.name ?? symbolB}</span>
            <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{symbolB}</span>
            <AppBadge tone={RECO_TONE(b?.recommendation)}>{b?.recommendation ?? "—"}</AppBadge>
          </div>
        }>
          {/* A 区：官方门槛 —— 视觉强调（实线框） */}
          <div className="rounded-lg p-2.5 mb-2" style={{ border: `1.5px solid ${COLORS.primary}`, background: `${COLORS.primary}08` }}>
            <div className="text-[11px] font-semibold mb-1.5" style={{ color: COLORS.primary }}>
              官方门槛（v8.1 · BUY = 综合评分 ≥ 70 且 百分位 ≤ 15%）
            </div>
            {official.length ? official.map((g, i) => <GapLine key={i} g={g} />) : <Empty />}
          </div>

          {/* B 区：群体均值 —— 视觉弱化（虚线框 + 免责） */}
          <div className="rounded-lg p-2.5" style={{ border: `1px dashed ${COLORS.border}`, background: COLORS.tile }}>
            <div className="text-[11px] font-semibold mb-0.5" style={{ color: COLORS.textSecondary }}>
              BUY 群体均值对照
            </div>
            <div className="text-[10px] mb-1.5" style={{ color: COLORS.textFaint }}>
              ※ {COHORT_DISCLAIMER}　·　今日 BUY 样本 {base?.n ?? 0} 只
            </div>
            {cohort.length ? cohort.map((g, i) => <GapLine key={i} g={g} />) : <Empty />}
          </div>
        </AppCard>
      </div>

      {/* ③④ B 距离 BUY 还差什么 + 两只最明显差异 */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>📊 最明显的差异（{symbolA} vs {symbolB}）</span>}>
        {diffs.length ? (
          <div className="space-y-1">
            {diffs.map((x, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ color: x.ga.ok ? COLORS.success : COLORS.danger }}>{x.ga.ok ? "▲" : "▼"} {x.ga.text}</span>
                <span style={{ color: x.gb.ok ? COLORS.success : COLORS.danger }}>{x.gb.ok ? "▲" : "▼"} {x.gb.text}</span>
              </div>
            ))}
            <div className="text-[10px] pt-1" style={{ color: COLORS.textFaint }}>
              左＝{symbolA}　右＝{symbolB}　·　{COHORT_DISCLAIMER}（今日 BUY 样本 {base?.n ?? 0} 只）
            </div>
          </div>
        ) : <Empty />}
      </AppCard>
    </div>
  );
}

function GapLine({ g }: { g: GapItem }) {
  return (
    <div className="flex items-start gap-1.5 text-[11.5px] py-0.5">
      <span className="shrink-0" style={{ color: g.ok ? COLORS.success : COLORS.danger }}>{g.ok ? "·" : "✓"}</span>
      <span style={{ color: g.ok ? COLORS.textSecondary : COLORS.text }}>{g.text}</span>
    </div>
  );
}
const Empty = () => <div className="text-[12px]" style={{ color: COLORS.textFaint }}>暂无数据</div>;
