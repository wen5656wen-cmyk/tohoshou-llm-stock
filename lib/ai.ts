import OpenAI from "openai";
import {
  calcOverallScore,
  calcTargetPrice,
  starsToString,
  type ScoreDimension,
} from "./scoring";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
  baseURL: process.env.OPENAI_BASE_URL,
});

export type FullAnalysisResult = {
  model: string;
  // 5次元スコア
  scoreGrowth: number;
  scoreValuation: number;
  scoreProfitability: number;
  scoreCapitalFlow: number;
  scoreSentiment: number;
  score: number;           // 総合 0-100
  stars: number;           // 1-5
  grade: string;           // STRONG_BUY | BUY | WATCH | AVOID | STRONG_AVOID
  recommendation: string;  // BUY | WATCH | AVOID
  // テキスト出力
  summary: string;
  bullPoints: string[];
  bearPoints: string[];
  targetPrice: number | null;
  upsideRate: number | null;
  riskLevel: string;
  riskWarnings: string[];
  investReason: string;
};

type StockData = {
  symbol: string;
  name: string;
  price: number;
  change?: number | null;
  changeRate?: number | null;
  marketCap?: number | null;
  per?: number | null;
  pbr?: number | null;
  roe?: number | null;
  roa?: number | null;
  dividend?: number | null;
  sector?: string | null;
  eps?: number | null;
  bps?: number | null;
  high52w?: number | null;
  low52w?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  beta?: number | null;
};

type FinancialData = {
  revenue?: number | null;
  operatingProfit?: number | null;
  netProfit?: number | null;
  roe?: number | null;
  roa?: number | null;
  equityRatio?: number | null;
  eps?: number | null;
} | null;

type NewsData = { sentiment?: string | null; importance?: number; title?: string }[];
type DisclosureData = {
  sentiment?: string | null;
  category?: string;
  importance?: number;
  title?: string;
}[];

export async function analyzeStock(
  stock: StockData,
  currentFin: FinancialData = null,
  prevFin: FinancialData = null,
  news: NewsData = [],
  disclosures: DisclosureData = []
): Promise<FullAnalysisResult> {
  // Step 1: 定量スコア計算（常に実行）
  const scoreResult: ScoreDimension = calcOverallScore({
    currentFin,
    prevFin,
    stock,
    news,
    disclosures,
  });

  const targetPrice = calcTargetPrice(
    stock.price,
    scoreResult,
    stock.per,
    stock.eps
  );
  const upsideRate = targetPrice
    ? Math.round(((targetPrice - stock.price) / stock.price) * 1000) / 10
    : null;

  const riskLevel =
    scoreResult.total >= 70 ? "LOW"
    : scoreResult.total >= 50 ? "MEDIUM"
    : "HIGH";

  // Step 2: AI テキスト生成（APIキーがある場合）
  if (process.env.OPENAI_API_KEY) {
    return await generateAIText(
      stock,
      currentFin,
      scoreResult,
      targetPrice,
      upsideRate,
      riskLevel,
      news,
      disclosures
    );
  }

  // Step 3: ルールベースのテキスト生成
  return generateRuleBasedText(
    stock,
    scoreResult,
    targetPrice,
    upsideRate,
    riskLevel
  );
}

async function generateAIText(
  stock: StockData,
  fin: FinancialData,
  score: ScoreDimension,
  targetPrice: number | null,
  upsideRate: number | null,
  riskLevel: string,
  news: NewsData,
  disclosures: DisclosureData
): Promise<FullAnalysisResult> {
  const modelName = process.env.AI_MODEL || "gpt-4o-mini";
  const recentNews = news.slice(0, 3).map((n) => n.title || "").join("\n");
  const recentDisc = disclosures.slice(0, 3).map((d) => d.title || "").join("\n");

  const prompt = `あなたは経験豊富な日本株アナリストです。以下のデータを基に投資分析レポートを作成してください。

## 銘柄情報
銘柄: ${stock.name} (${stock.symbol}) | セクター: ${stock.sector || "不明"}
現在値: ¥${stock.price.toLocaleString()} | 前日比: ${stock.changeRate?.toFixed(2) || "N/A"}%
時価総額: ${stock.marketCap ? stock.marketCap.toFixed(0) + "億円" : "不明"}

## バリュエーション指標
PER: ${stock.per?.toFixed(1) || "N/A"}倍 | PBR: ${stock.pbr?.toFixed(2) || "N/A"}倍
ROE: ${stock.roe?.toFixed(1) || "N/A"}% | ROA: ${stock.roa?.toFixed(1) || "N/A"}%
EPS: ${stock.eps?.toFixed(1) || "N/A"}円 | 配当利回り: ${stock.dividend?.toFixed(2) || "N/A"}%
52週高値: ${stock.high52w?.toLocaleString() || "N/A"} | 52週安値: ${stock.low52w?.toLocaleString() || "N/A"}
ベータ: ${stock.beta?.toFixed(2) || "N/A"}

## 財務データ（直近期）
${fin ? `売上高: ${fin.revenue ? (fin.revenue / 10000).toFixed(0) + "億円" : "N/A"}
営業利益: ${fin.operatingProfit ? (fin.operatingProfit / 10000).toFixed(0) + "億円" : "N/A"}
純利益: ${fin.netProfit ? (fin.netProfit / 10000).toFixed(0) + "億円" : "N/A"}
自己資本比率: ${fin.equityRatio?.toFixed(1) || "N/A"}%` : "財務データなし"}

## AI定量スコア（5次元）
成長性: ${score.growth}/100 | バリュエーション: ${score.valuation}/100
収益性: ${score.profitability}/100 | 資金面: ${score.capitalFlow}/100
ニュース感情: ${score.sentiment}/100 | 総合: ${score.total}/100

## 最近のニュース・開示
${recentNews || "なし"}
${recentDisc || "なし"}

以下のJSON形式で回答してください（日本語）:
{
  "summary": "300字程度の総合分析",
  "bullPoints": ["強み1", "強み2", "強み3"],
  "bearPoints": ["リスク1", "リスク2"],
  "riskWarnings": ["警告1", "警告2"],
  "investReason": "投資理由（200字）"
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const r = JSON.parse(resp.choices[0].message.content || "{}");

    return buildResult(score, targetPrice, upsideRate, riskLevel, modelName, {
      summary: r.summary || "",
      bullPoints: r.bullPoints || [],
      bearPoints: r.bearPoints || [],
      riskWarnings: r.riskWarnings || [],
      investReason: r.investReason || "",
    });
  } catch (e) {
    console.error("AI text generation failed, falling back to rule-based:", e);
    return generateRuleBasedText(stock, score, targetPrice, upsideRate, riskLevel);
  }
}

function generateRuleBasedText(
  stock: StockData,
  score: ScoreDimension,
  targetPrice: number | null,
  upsideRate: number | null,
  riskLevel: string
): FullAnalysisResult {
  const per = stock.per;
  const roe = stock.roe;
  const pbr = stock.pbr;
  const div = stock.dividend;

  const gradeJa =
    score.grade === "STRONG_BUY" ? "強く買い推奨"
    : score.grade === "BUY" ? "買い推奨"
    : score.grade === "WATCH" ? "中立・経過観察"
    : score.grade === "AVOID" ? "回避"
    : "強く回避";

  const summary =
    `${stock.name}の総合AIスコアは${score.total}点（${starsToString(score.stars)}）で、${gradeJa}と判定されます。` +
    `${per ? `PER${per.toFixed(1)}倍` : ""}${roe ? `・ROE${roe.toFixed(1)}%` : ""}の水準にあり、` +
    `成長性${score.growth}点・収益性${score.profitability}点・バリュエーション${score.valuation}点の` +
    `定量分析を踏まえた評価です。` +
    (targetPrice && upsideRate
      ? `目標株価¥${targetPrice.toLocaleString()}（現在値比${upsideRate > 0 ? "+" : ""}${upsideRate}%）。`
      : "");

  const bullPoints: string[] = [];
  if (roe && roe > 15) bullPoints.push(`ROE ${roe.toFixed(1)}%の高い資本効率`);
  else if (roe && roe > 8) bullPoints.push(`ROE ${roe.toFixed(1)}%で業界平均並みの収益性`);
  if (per && per < 15) bullPoints.push(`PER ${per.toFixed(1)}倍の割安バリュエーション`);
  if (div && div > 2) bullPoints.push(`配当利回り${div.toFixed(2)}%の安定株主還元`);
  if (score.capitalFlow > 60) bullPoints.push("出来高・価格モメンタムが良好");
  if (stock.sector) bullPoints.push(`${stock.sector}セクターでの競争優位性`);
  if (bullPoints.length < 2) bullPoints.push("堅固なバランスシートと財務基盤");

  const bearPoints: string[] = [];
  if (per && per > 30) bearPoints.push(`PER ${per.toFixed(1)}倍の高いバリュエーション`);
  if (roe && roe < 8) bearPoints.push(`ROE ${roe.toFixed(1)}%の低い資本効率`);
  if (pbr && pbr > 3) bearPoints.push(`PBR ${pbr.toFixed(2)}倍のプレミアムに注意`);
  bearPoints.push("グローバルマクロリスク（金利・為替変動）");

  const riskWarnings: string[] = [];
  if (riskLevel === "HIGH") riskWarnings.push("高リスク銘柄：損失が発生する可能性があります");
  if (stock.beta && stock.beta > 1.5) riskWarnings.push(`ベータ${stock.beta.toFixed(2)}：市場平均より高いボラティリティ`);
  riskWarnings.push("本分析はAIによる定量評価であり、投資判断は自己責任でお願いします");

  const investReason =
    `${gradeJa}の根拠：成長性（${score.growth}点）・収益性（${score.profitability}点）・` +
    `バリュエーション（${score.valuation}点）の3指標が` +
    (score.total >= 65 ? "良好な水準にあり、" : "一部課題があるものの、") +
    `ニュース感情（${score.sentiment}点）・資金面（${score.capitalFlow}点）も考慮した総合評価です。`;

  return buildResult(score, targetPrice, upsideRate, riskLevel, "rule-based", {
    summary,
    bullPoints,
    bearPoints,
    riskWarnings,
    investReason,
  });
}

function buildResult(
  score: ScoreDimension,
  targetPrice: number | null,
  upsideRate: number | null,
  riskLevel: string,
  model: string,
  text: {
    summary: string;
    bullPoints: string[];
    bearPoints: string[];
    riskWarnings: string[];
    investReason: string;
  }
): FullAnalysisResult {
  return {
    model,
    scoreGrowth: score.growth,
    scoreValuation: score.valuation,
    scoreProfitability: score.profitability,
    scoreCapitalFlow: score.capitalFlow,
    scoreSentiment: score.sentiment,
    score: score.total,
    stars: score.stars,
    grade: score.grade,
    recommendation: score.recommendation,
    targetPrice,
    upsideRate,
    riskLevel,
    ...text,
  };
}
