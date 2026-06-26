import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Feature definitions ────────────────────────────────────────────────────────

const NUMERIC_FEATS = [
  { key: "feat_adaptiveScore",      label: "Adaptive Score"       },
  { key: "feat_technicalScore",     label: "Technical Score"      },
  { key: "feat_fundamentalScore",   label: "Fundamental Score"    },
  { key: "feat_moneyFlowScore",     label: "Money Flow Score"     },
  { key: "feat_newsSentimentScore", label: "News Sentiment"       },
  { key: "feat_globalTrendScore",   label: "Global Trend Score"   },
  { key: "feat_percentileRank",     label: "Percentile Rank"      },
  { key: "feat_marketRank",         label: "Market Rank"          },
  { key: "feat_marketCap",          label: "Market Cap"           },
  { key: "feat_per",                label: "P/E Ratio"            },
  { key: "feat_pbr",                label: "P/B Ratio"            },
  { key: "feat_roe",                label: "ROE (%)"              },
  { key: "feat_dividendYield",      label: "Dividend Yield"       },
  { key: "feat_rsi14",              label: "RSI-14"               },
  { key: "feat_ma20",               label: "MA-20"                },
  { key: "feat_ma60",               label: "MA-60"                },
  { key: "feat_return5d_pre",       label: "Pre-Return 5d"        },
  { key: "feat_return20d_pre",      label: "Pre-Return 20d"       },
  { key: "feat_return60d_pre",      label: "Pre-Return 60d"       },
  { key: "feat_volatility20d",      label: "Volatility 20d"       },
  { key: "feat_vix",                label: "VIX"                  },
  { key: "feat_usdjpy",             label: "USD/JPY"              },
  { key: "feat_topixReturn5d",      label: "TOPIX Return 5d"      },
  { key: "feat_topixReturn20d",     label: "TOPIX Return 20d"     },
  { key: "feat_marketTemperature",  label: "Market Temperature"   },
] as const;

const CATEGORICAL_FEATS = [
  { key: "feat_sector",     label: "Sector"      },
  { key: "feat_industry",   label: "Industry"    },
  { key: "feat_stockStyle", label: "Stock Style" },
  { key: "feat_maTrend",    label: "MA Trend"    },
] as const;

const ALL_NUMERIC_KEYS = NUMERIC_FEATS.map((f) => f.key);
const ALL_CATEGORICAL_KEYS = CATEGORICAL_FEATS.map((f) => f.key);

const HORIZONS = ["1d", "3d", "5d", "7d", "10d", "20d", "30d", "60d", "90d"] as const;
type Horizon = typeof HORIZONS[number];

const HORIZON_CAL_DAYS: Record<Horizon, number> = {
  "1d": 4, "3d": 6, "5d": 9, "7d": 12, "10d": 17,
  "20d": 32, "30d": 46, "60d": 92, "90d": 132,
};

const MIN_SAMPLES = 10;

// ── Math helpers ──────────────────────────────────────────────────────────────

function r4(n: number | null | undefined): number | null {
  if (n == null || !isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

function r2(n: number | null | undefined): number | null {
  if (n == null || !isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function medianSorted(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function pearsonCorr(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 5) return null;
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; denX += dx * dx; denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den < 1e-12) return null;
  return r4(num / den);
}

// ── Tertile analysis ──────────────────────────────────────────────────────────

type TertileStats = {
  tertile: "TOP" | "MIDDLE" | "BOTTOM";
  sampleCount: number;
  winRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  avgAlpha: number | null;
};

type JoinedRow = {
  symbol: string;
  recDate: string;
  returnPct: number;
  winFlag: boolean;
  alphaVsTopix: number | null;
} & Record<string, number | string | boolean | null>;

function computeTertiles(
  rows: JoinedRow[],
  featKey: string,
): { tertiles: TertileStats[]; sampleCount: number } {
  const valid = rows
    .filter((r) => r[featKey] != null && typeof r[featKey] === "number")
    .map((r) => ({
      feat: r[featKey] as number,
      ret: r.returnPct,
      win: r.winFlag,
      alpha: r.alphaVsTopix,
    }))
    .sort((a, b) => a.feat - b.feat);

  const n = valid.length;
  if (n < MIN_SAMPLES) return { tertiles: [], sampleCount: n };

  const cutBot = Math.floor(n * 0.2);
  const cutTop = Math.floor(n * 0.8);

  const groups: Array<{ tertile: "TOP" | "MIDDLE" | "BOTTOM"; rows: typeof valid }> = [
    { tertile: "BOTTOM", rows: valid.slice(0, cutBot)        },
    { tertile: "MIDDLE", rows: valid.slice(cutBot, cutTop)   },
    { tertile: "TOP",    rows: valid.slice(cutTop)           },
  ];

  const tertiles: TertileStats[] = groups.map((g) => {
    if (g.rows.length === 0) {
      return { tertile: g.tertile, sampleCount: 0, winRate: null, avgReturn: null, medianReturn: null, avgAlpha: null };
    }
    const rets = g.rows.map((r) => r.ret).sort((a, b) => a - b);
    const alphas = g.rows.filter((r) => r.alpha != null).map((r) => r.alpha as number);
    return {
      tertile:      g.tertile,
      sampleCount:  g.rows.length,
      winRate:      r4(g.rows.filter((r) => r.win).length / g.rows.length),
      avgReturn:    r4(mean(g.rows.map((r) => r.ret))),
      medianReturn: r4(medianSorted(rets)),
      avgAlpha:     alphas.length > 0 ? r4(mean(alphas)) : null,
    };
  });

  return { tertiles, sampleCount: n };
}

// ── Categorical factor analysis ───────────────────────────────────────────────

type CategoryStats = {
  value: string;
  sampleCount: number;
  winRate: number | null;
  avgReturn: number | null;
  avgAlpha: number | null;
};

function computeCategorical(rows: JoinedRow[], featKey: string): CategoryStats[] {
  const grouped = new Map<string, JoinedRow[]>();
  for (const r of rows) {
    const v = r[featKey] as string | null;
    if (v == null) continue;
    const list = grouped.get(v) ?? [];
    list.push(r);
    grouped.set(v, list);
  }

  return Array.from(grouped.entries())
    .map(([value, group]) => {
      const alphas = group.filter((r) => r.alphaVsTopix != null).map((r) => r.alphaVsTopix as number);
      return {
        value,
        sampleCount:  group.length,
        winRate:      r4(group.filter((r) => r.winFlag).length / group.length),
        avgReturn:    r4(mean(group.map((r) => r.returnPct))),
        avgAlpha:     alphas.length > 0 ? r4(mean(alphas)) : null,
      };
    })
    .sort((a, b) => b.sampleCount - a.sampleCount);
}

// ── Walk-forward readiness helpers ────────────────────────────────────────────

function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const horizon = (searchParams.get("horizon") ?? "7d") as Horizon;
    if (!HORIZONS.includes(horizon)) {
      return NextResponse.json({ error: `Invalid horizon: ${horizon}` }, { status: 400 });
    }

    // ── 1. Load joined rows (feat_* + outcomes) ────────────────────────────
    const numericCols  = ALL_NUMERIC_KEYS.map((k) => `dr."${k}"`).join(", ");
    const categoryCols = ALL_CATEGORICAL_KEYS.map((k) => `dr."${k}"`).join(", ");
    const joinedSql = `
      SELECT
        dr.symbol, dr.date::text AS "recDate",
        ${numericCols},
        ${categoryCols},
        dr."feat_highRiskFlag",
        bp."returnPct", bp."winFlag", bp."alphaVsTopix"
      FROM daily_recommendations dr
      INNER JOIN backtest_position_results bp
        ON bp."recDate" = dr.date AND bp.symbol = dr.symbol AND bp.horizon = '${horizon}'
      WHERE bp."returnPct" IS NOT NULL
      ORDER BY dr.date, dr.symbol
    `;
    const joinedRaw = await prisma.$queryRawUnsafe<JoinedRow[]>(joinedSql);
    const joined = joinedRaw.map((r) => ({
      ...r,
      returnPct:    Number(r.returnPct),
      winFlag:      Boolean(r.winFlag),
      alphaVsTopix: r.alphaVsTopix != null ? Number(r.alphaVsTopix) : null,
    })) as JoinedRow[];

    const joinedRows    = joined.length;
    const featCovRows   = joined.filter((r) => r["feat_adaptiveScore"] != null).length;

    // ── 2. Data quality (DR table only, independent of backtest) ──────────
    const qualityCols = [
      ...ALL_NUMERIC_KEYS.map((k) => `COUNT("${k}")::text AS "${k}_count", MIN("${k}") AS "${k}_min", MAX("${k}") AS "${k}_max", AVG("${k}") AS "${k}_avg", STDDEV("${k}") AS "${k}_stddev", PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "${k}") AS "${k}_median"`),
      ...ALL_CATEGORICAL_KEYS.map((k) => `COUNT("${k}")::text AS "${k}_count"`),
      `COUNT("feat_highRiskFlag")::text AS "feat_highRiskFlag_count"`,
    ].join(",\n        ");
    const qualitySql = `SELECT COUNT(*)::text AS total, ${qualityCols} FROM daily_recommendations`;
    const [qualityRow] = await prisma.$queryRawUnsafe<[Record<string, string | number | null>]>(qualitySql);
    const drTotal = Number(qualityRow.total);

    // Build per-feature quality stats
    type FeatureQuality = {
      key: string; label: string; type: "numeric" | "categorical" | "boolean";
      total: number; filled: number; coveragePct: number;
      min: number | null; max: number | null; mean: number | null;
      stddev: number | null; median: number | null;
    };

    const featureQuality: FeatureQuality[] = [
      ...NUMERIC_FEATS.map(({ key, label }) => {
        const filled = Number(qualityRow[`${key}_count`] ?? 0);
        return {
          key, label, type: "numeric" as const,
          total: drTotal, filled,
          coveragePct: drTotal > 0 ? Math.round((filled / drTotal) * 100) : 0,
          min:    r4(qualityRow[`${key}_min`] as number | null),
          max:    r4(qualityRow[`${key}_max`] as number | null),
          mean:   r4(qualityRow[`${key}_avg`] as number | null),
          stddev: r4(qualityRow[`${key}_stddev`] as number | null),
          median: r4(qualityRow[`${key}_median`] as number | null),
        };
      }),
      ...CATEGORICAL_FEATS.map(({ key, label }) => {
        const filled = Number(qualityRow[`${key}_count`] ?? 0);
        return {
          key, label, type: "categorical" as const,
          total: drTotal, filled,
          coveragePct: drTotal > 0 ? Math.round((filled / drTotal) * 100) : 0,
          min: null, max: null, mean: null, stddev: null, median: null,
        };
      }),
      {
        key: "feat_highRiskFlag", label: "High Risk Flag", type: "boolean" as const,
        total: drTotal,
        filled: Number(qualityRow["feat_highRiskFlag_count"] ?? 0),
        coveragePct: drTotal > 0
          ? Math.round((Number(qualityRow["feat_highRiskFlag_count"] ?? 0) / drTotal) * 100)
          : 0,
        min: null, max: null, mean: null, stddev: null, median: null,
      },
    ];

    const overallCoverage = featureQuality.length > 0
      ? Math.round(featureQuality.reduce((s, f) => s + f.coveragePct, 0) / featureQuality.length)
      : 0;
    const unexpectedNulls = featureQuality
      .filter((f) => f.coveragePct === 0 && drTotal > 0)
      .map((f) => f.key);

    // ── 3. Walk-forward readiness ──────────────────────────────────────────
    const [tradingDaysRow, availHorizonRows, firstDate, lastDate] = await Promise.all([
      prisma.$queryRawUnsafe<[{ cnt: string }]>(
        `SELECT COUNT(DISTINCT "recDate")::text AS cnt FROM backtest_position_results`
      ),
      prisma.$queryRawUnsafe<Array<{ horizon: string; filled: string; total: string }>>(
        `SELECT horizon, COUNT(*) FILTER (WHERE "returnPct" IS NOT NULL)::text AS filled, COUNT(*)::text AS total
         FROM backtest_position_results GROUP BY horizon`
      ),
      prisma.$queryRawUnsafe<[{ d: string | null }]>(
        `SELECT MIN("recDate")::text AS d FROM backtest_position_results`
      ),
      prisma.$queryRawUnsafe<[{ d: string | null }]>(
        `SELECT MAX("recDate")::text AS d FROM backtest_position_results`
      ),
    ]);

    const tradingDays      = Number(tradingDaysRow[0]?.cnt ?? 0);
    const latestRecDate    = lastDate[0]?.d?.slice(0, 10) ?? null;
    const earliestRecDate  = firstDate[0]?.d?.slice(0, 10) ?? null;

    const horizonStatus = HORIZONS.map((h) => {
      const row     = availHorizonRows.find((r) => r.horizon === h);
      const filled  = Number(row?.filled ?? 0);
      const total   = Number(row?.total  ?? 0);
      const calDays = HORIZON_CAL_DAYS[h];
      const ready   = filled > 0 && total > 0;
      const expectedReadyDate = !ready && latestRecDate
        ? addCalendarDays(latestRecDate, calDays)
        : null;
      return {
        horizon: h,
        calendarDaysRequired: calDays,
        filledCount: filled,
        totalCount:  total,
        fillRate:    total > 0 ? Math.round((filled / total) * 100) : 0,
        ready,
        expectedReadyDate,
      };
    });

    const availableHorizons = horizonStatus.filter((h) => h.ready).map((h) => h.horizon);

    // ── 4. Factor contribution analysis ───────────────────────────────────
    type FactorResult = {
      key: string; label: string; type: "numeric" | "categorical" | "boolean";
      coverage: number; sampleCount: number; insufficient: boolean;
      tertiles: TertileStats[]; categories: CategoryStats[];
      winRateDelta: number | null; returnDelta: number | null; alphaDelta: number | null;
      predictiveScore: number | null;
      direction: "positive" | "negative" | "neutral" | "unknown";
    };

    const factorResults: FactorResult[] = [];
    const hasData = joinedRows >= MIN_SAMPLES;

    if (hasData) {
      // Numeric factors
      for (const { key, label } of NUMERIC_FEATS) {
        const { tertiles, sampleCount } = computeTertiles(joined, key);
        const coverage = featureQuality.find((f) => f.key === key)?.coveragePct ?? 0;

        let winRateDelta: number | null = null;
        let returnDelta: number | null  = null;
        let alphaDelta: number | null   = null;

        if (tertiles.length === 3) {
          const top = tertiles.find((t) => t.tertile === "TOP");
          const bot = tertiles.find((t) => t.tertile === "BOTTOM");
          winRateDelta = (top?.winRate != null && bot?.winRate != null) ? r4(top.winRate - bot.winRate) : null;
          returnDelta  = (top?.avgReturn != null && bot?.avgReturn != null) ? r4(top.avgReturn - bot.avgReturn) : null;
          alphaDelta   = (top?.avgAlpha != null && bot?.avgAlpha != null) ? r4(top.avgAlpha - bot.avgAlpha) : null;
        }

        const predictiveScore = winRateDelta != null ? Math.abs(winRateDelta) : null;
        const direction: FactorResult["direction"] =
          winRateDelta == null ? "unknown"
          : winRateDelta > 0.03 ? "positive"
          : winRateDelta < -0.03 ? "negative"
          : "neutral";

        factorResults.push({
          key, label, type: "numeric",
          coverage, sampleCount,
          insufficient: sampleCount < MIN_SAMPLES,
          tertiles, categories: [],
          winRateDelta, returnDelta, alphaDelta,
          predictiveScore, direction,
        });
      }

      // Boolean: feat_highRiskFlag (treat as binary 0/1)
      const highRiskRows = joined
        .filter((r) => r["feat_highRiskFlag"] != null)
        .map((r) => ({ ...r, feat_highRiskFlag_num: r["feat_highRiskFlag"] ? 1 : 0 }));
      const hrTrue  = highRiskRows.filter((r) => r.feat_highRiskFlag_num === 1);
      const hrFalse = highRiskRows.filter((r) => r.feat_highRiskFlag_num === 0);
      const hrAlphasT = hrTrue.filter((r) => r.alphaVsTopix != null).map((r) => r.alphaVsTopix as number);
      const hrAlphasF = hrFalse.filter((r) => r.alphaVsTopix != null).map((r) => r.alphaVsTopix as number);
      const hrCategories: CategoryStats[] = [
        { value: "HIGH_RISK (true)",  sampleCount: hrTrue.length,
          winRate: hrTrue.length > 0 ? r4(hrTrue.filter((r) => r.winFlag).length / hrTrue.length) : null,
          avgReturn: r4(mean(hrTrue.map((r) => r.returnPct))),
          avgAlpha:  hrAlphasT.length > 0 ? r4(mean(hrAlphasT)) : null },
        { value: "NORMAL (false)",    sampleCount: hrFalse.length,
          winRate: hrFalse.length > 0 ? r4(hrFalse.filter((r) => r.winFlag).length / hrFalse.length) : null,
          avgReturn: r4(mean(hrFalse.map((r) => r.returnPct))),
          avgAlpha:  hrAlphasF.length > 0 ? r4(mean(hrAlphasF)) : null },
      ];
      const hrWrDelta = (hrFalse.length >= 5 && hrTrue.length >= 5)
        ? r4((hrFalse.filter((r) => r.winFlag).length / hrFalse.length) -
             (hrTrue.filter((r) => r.winFlag).length / hrTrue.length))
        : null;
      factorResults.push({
        key: "feat_highRiskFlag", label: "High Risk Flag", type: "boolean",
        coverage: featureQuality.find((f) => f.key === "feat_highRiskFlag")?.coveragePct ?? 0,
        sampleCount: highRiskRows.length,
        insufficient: highRiskRows.length < MIN_SAMPLES,
        tertiles: [], categories: hrCategories,
        winRateDelta: hrWrDelta, returnDelta: null, alphaDelta: null,
        predictiveScore: hrWrDelta != null ? Math.abs(hrWrDelta) : null,
        direction: hrWrDelta == null ? "unknown" : hrWrDelta > 0.03 ? "positive" : hrWrDelta < -0.03 ? "negative" : "neutral",
      });

      // Categorical factors
      for (const { key, label } of CATEGORICAL_FEATS) {
        const categories = computeCategorical(joined, key);
        const sampleCount = categories.reduce((s, c) => s + c.sampleCount, 0);
        factorResults.push({
          key, label, type: "categorical",
          coverage: featureQuality.find((f) => f.key === key)?.coveragePct ?? 0,
          sampleCount,
          insufficient: sampleCount < MIN_SAMPLES,
          tertiles: [], categories,
          winRateDelta: null, returnDelta: null, alphaDelta: null,
          predictiveScore: null, direction: "unknown",
        });
      }
    } else {
      // No data: return skeleton entries with insufficient flag
      for (const { key, label } of NUMERIC_FEATS) {
        factorResults.push({
          key, label, type: "numeric",
          coverage: featureQuality.find((f) => f.key === key)?.coveragePct ?? 0,
          sampleCount: 0, insufficient: true,
          tertiles: [], categories: [],
          winRateDelta: null, returnDelta: null, alphaDelta: null,
          predictiveScore: null, direction: "unknown",
        });
      }
      factorResults.push({
        key: "feat_highRiskFlag", label: "High Risk Flag", type: "boolean",
        coverage: 0, sampleCount: 0, insufficient: true,
        tertiles: [], categories: [],
        winRateDelta: null, returnDelta: null, alphaDelta: null,
        predictiveScore: null, direction: "unknown",
      });
      for (const { key, label } of CATEGORICAL_FEATS) {
        factorResults.push({
          key, label, type: "categorical",
          coverage: 0, sampleCount: 0, insufficient: true,
          tertiles: [], categories: [],
          winRateDelta: null, returnDelta: null, alphaDelta: null,
          predictiveScore: null, direction: "unknown",
        });
      }
    }

    // ── 5. Feature correlation (numeric only) ──────────────────────────────
    type FeatureCorr = {
      key: string; label: string; sampleCount: number;
      corrReturn: number | null; corrAlpha: number | null; corrWinRate: number | null;
    };

    type PairCorr = { keyA: string; labelA: string; keyB: string; labelB: string; corr: number };

    const featureCorrelations: FeatureCorr[] = [];
    const highCorrPairs: PairCorr[] = [];

    if (hasData) {
      const outcomes = {
        returns:  joined.map((r) => r.returnPct),
        alphas:   joined.map((r) => r.alphaVsTopix ?? NaN),
        winRates: joined.map((r) => r.winFlag ? 1.0 : 0.0),
      };

      // For each numeric feature, compute correlation with outcomes
      for (const { key, label } of NUMERIC_FEATS) {
        const pairs = joined
          .map((r) => ({ feat: r[key] as number | null, ret: r.returnPct, alpha: r.alphaVsTopix, win: r.winFlag }))
          .filter((p) => p.feat != null);
        const feats = pairs.map((p) => p.feat as number);
        const rets  = pairs.map((p) => p.ret);
        const alps  = pairs.filter((p) => p.alpha != null).map((p) => ({ f: p.feat as number, a: p.alpha as number }));
        const wins  = pairs.map((p) => p.win ? 1.0 : 0.0);

        featureCorrelations.push({
          key, label, sampleCount: pairs.length,
          corrReturn:  pearsonCorr(feats, rets),
          corrAlpha:   alps.length >= 5 ? pearsonCorr(alps.map((x) => x.f), alps.map((x) => x.a)) : null,
          corrWinRate: pearsonCorr(feats, wins),
        });
      }
      void outcomes; // suppress unused warning

      // Feature-feature correlations: compute top correlated pairs (upper triangle)
      const numericKeys = NUMERIC_FEATS.map((f) => f.key);
      for (let i = 0; i < numericKeys.length; i++) {
        for (let j = i + 1; j < numericKeys.length; j++) {
          const kA = numericKeys[i];
          const kB = numericKeys[j];
          const pairs = joined
            .map((r) => ({ a: r[kA] as number | null, b: r[kB] as number | null }))
            .filter((p) => p.a != null && p.b != null);
          if (pairs.length < 5) continue;
          const corr = pearsonCorr(pairs.map((p) => p.a as number), pairs.map((p) => p.b as number));
          if (corr != null && Math.abs(corr) >= 0.7) {
            highCorrPairs.push({
              keyA: kA, labelA: NUMERIC_FEATS[i].label,
              keyB: kB, labelB: NUMERIC_FEATS[j].label,
              corr,
            });
          }
        }
      }
      highCorrPairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
    }

    // ── 6. Research summary ────────────────────────────────────────────────
    const numericResults = factorResults.filter(
      (f) => f.type === "numeric" && !f.insufficient && f.winRateDelta != null
    );
    const sorted = [...numericResults].sort(
      (a, b) => (b.winRateDelta ?? 0) - (a.winRateDelta ?? 0)
    );

    const topPositiveFactors = sorted.slice(0, 5).filter((f) => (f.winRateDelta ?? 0) > 0).map((f) => f.label);
    const topNegativeFactors = [...sorted].reverse().slice(0, 5).filter((f) => (f.winRateDelta ?? 0) < 0).map((f) => f.label);
    const mostPredictiveFactors = [...numericResults]
      .sort((a, b) => (b.predictiveScore ?? 0) - (a.predictiveScore ?? 0))
      .slice(0, 5)
      .map((f) => f.label);

    const sortedByQuality = [...featureQuality].sort((a, b) => b.coveragePct - a.coveragePct);
    const mostStableFeatures = sortedByQuality.slice(0, 5).map((f) => f.label);
    const weakestFeatures    = sortedByQuality.slice(-5).reverse().map((f) => f.label);

    // Data confidence: blend of coverage (50%) and sample count (50%)
    const sampleScore = hasData ? Math.min(100, Math.round((joinedRows / 500) * 100)) : 0;
    const dataConfidence = Math.round((overallCoverage * 0.5) + (sampleScore * 0.5));

    // Observations
    const observations: string[] = [];
    if (!hasData) observations.push(`No joined rows for horizon=${horizon}. Factor analysis requires feat_* data + filled backtest outcomes.`);
    if (joinedRows > 0 && featCovRows === 0) observations.push("Backtest outcomes exist but feat_* fields are all NULL. Awaiting next cron run.");
    if (unexpectedNulls.length === featureQuality.length && drTotal > 0) observations.push("All feat_* fields are NULL. Run rerank-top500.ts to populate feature snapshots.");
    if (tradingDays < 30) observations.push(`Only ${tradingDays} trading days available. Walk-forward analysis requires ≥30 days for reliable statistics.`);
    if (highCorrPairs.length > 0) observations.push(`${highCorrPairs.length} highly correlated feature pairs detected (|r| ≥ 0.70). Review for redundancy.`);
    if (topPositiveFactors.length > 0) observations.push(`Top positive factor: ${topPositiveFactors[0]} (win rate delta = +${numericResults[0]?.winRateDelta?.toFixed(2) ?? "?"}pp)`);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      horizon,

      dataState: {
        drTotal,
        joinedRows,
        featCoverageRows: featCovRows,
        coveragePct: drTotal > 0 ? Math.round((featCovRows / drTotal) * 100) : 0,
        hasData,
      },

      // Module 1
      factorAnalysis: factorResults,

      // Module 2
      correlation: {
        featureOutcome: featureCorrelations,
        highCorrPairs,
        hasData: featureCorrelations.length > 0 && featureCorrelations.some((c) => c.corrReturn != null),
      },

      // Module 3
      quality: {
        total: drTotal,
        features: featureQuality,
        overallCoverage,
        unexpectedNulls,
      },

      // Module 4
      readiness: {
        tradingDays,
        availableHorizons,
        earliestRecDate,
        latestRecDate,
        horizonStatus,
      },

      // Module 5
      summary: {
        dataConfidence,
        topPositiveFactors,
        topNegativeFactors,
        mostStableFeatures,
        weakestFeatures,
        mostPredictiveFeatures: mostPredictiveFactors,
        observations,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
