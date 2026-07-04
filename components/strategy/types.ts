// Strategy 模块 · 类型（P4-T3 拆分，byte-preserving）
import type { MessageKey } from "@/lib/i18n";

export type StratType = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";
export const ALL_TYPES: StratType[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

export type LearningReport = {
  reportDate:      string | null;
  grade:           string | null;
  recommendation:  string | null;
  integrityScore:  number | null;
  predictionScore: number | null;
  stabilityScore:  number | null;
  confidenceScore: number | null;
  sampleCount:     number;
  fillRate:        number | null;
  winRate:         number | null;
  alpha:           number | null;
  maxDrawdown:     number | null;
  summary:         string | null;
};

export type BacktestSummary = {
  horizon:         string;
  sampleCount:     number;
  filledCount:     number;
  fillRate:        number | null;
  winRate:         number | null;
  lossRate:        number | null;
  avgReturnPct:    number | null;
  alpha:           number | null;
  maxDrawdown:     number | null;
  sharpeRatio:     number | null;
  avgHoldingDays:  number | null;
  asOfDate:        string;
};

export type Recommendation = {
  rank:             number;
  symbol:           string;
  aiScore:          number | null;
  finalScore:       number | null;
  technicalScore:   number | null;
  fundamentalScore: number | null;
  newsScore:        number | null;
  tradeDate:        string;
};

export type TodayExecution = {
  dayRecOk:   boolean;
  swingRecOk: boolean;
  longRecOk:  boolean;
  backtestOk: boolean;
  learningOk: boolean;
  healthOk:   boolean;
  validDate:  string | null;
  isToday:    boolean;
  dayTradeSettledDate: string | null;
  dayTradeResultOk:    boolean;
  dayTradeSnapshotOk:  boolean;
};

export type RecentValidationSummary = {
  healthDays:  number;
  totalDays:   number;
  phase7Ready: boolean;
  phase7Detail: string | null;
  stableDays:  number;
};

export type OpenPosition = {
  id:            number;
  symbol:        string;
  entryDate:     string;
  entryPrice:    number;
  currentPrice:  number | null;
  returnPct:     number | null;
  returnAmount:  number | null;
  alpha:         number | null;
  holdingDays:   number | null;
  quantity:      number;
};

export type RecentTrade = {
  id:          number;
  symbol:      string;
  tradeDate:   string;
  returnPct:   number | null;
  returnAmount: number | null;
  alpha:       number | null;
  win:         boolean | null;
  holdingDays: number | null;
  exitReason:  string | null;
  entryPrice:  number | null;
  exitPrice:   number | null;
};

export type StrategyDetail = {
  strategyType:    string;
  capitalLog:      { logDate: string; cashAfter: number; investedAfter: number; totalAfter: number } | null;
  openPositions:   OpenPosition[];
  recentTrades:    RecentTrade[];
  backtestSummaries: BacktestSummary[];
  learning:        LearningReport | null;
  recommendations: { top10: Recommendation[]; top100Count: number; tradeDate: string | null };
};

export type OverviewStrategy = {
  openPositions:   number;
  closedTrades:    number;
  learning:        LearningReport | null;
  bestBacktest:    BacktestSummary | null;
  latestSnapshot:  { cumulativeReturnPct: number | null; alpha: number | null; winRate: number | null } | null;
  recommendations: { top10Count: number; top100Count: number; tradeDate: string | null } | null;
};

export type OverviewData = {
  strategies:        Record<StratType, OverviewStrategy>;
  unified:           { reportDate: string; integrityScore: number | null; grade: string | null; recommendation: string | null } | null;
  todayExecution?:   TodayExecution | null;
  recentValidation?: RecentValidationSummary | null;
};

export type ExplainData = {
  strategyType: StratType;
  symbol: string;
  name: string | null;
  nameZh: string | null;
  tradeDate: string | null;
  found: boolean;
  explanationType: "RECOMMENDED" | "NOT_TOP10" | "NOT_CANDIDATE" | "DATA_INSUFFICIENT";
  conclusion: "STRONG" | "RECOMMEND" | "WATCH" | "NOT_TOP10" | "NOT_CANDIDATE" | "INSUFFICIENT";
  rank: number | null;
  isTop10: boolean;
  totalCount: number;
  totalCandidates: number;
  top10CutoffScore: number | null;
  scoreGap: number | null;
  shortfalls: { code: string; value: number | null }[];
  missingReasons: { code: string; value: number | null }[];
  improvementFactors: string[];
  scoreBreakdown: {
    aiScore: number | null; technicalScore: number | null; fundamentalScore: number | null;
    newsScore: number | null; moneyFlowScore: number | null; riskScore: number | null; finalScore: number | null;
  } | null;
  adaptiveScore: number | null;
  reasons: { code: string; value: number }[];
  risks: { code: string; value?: number }[];
  status: "RECOMMENDING" | "BOUGHT" | "SOLD" | "SKIPPED" | "WAITING_DATA" | "NOT_TOP10" | "NOT_CANDIDATE";
  recommendation: string | null;
  dataQuality: { hasNews: boolean; hasFundamental: boolean; hasPrice: boolean; scoreSource: string | null };
  generatedAt: string;
};

// Lightweight {token} interpolation — keeps all CJK strings inside i18n files.

export type ValidationRecord = {
  id: number;
  validationDate: string;
  dayRecOk: boolean; swingRecOk: boolean; longRecOk: boolean;
  strategyOk: boolean; snapshotOk: boolean; tradeResultOk: boolean;
  backtestOk: boolean; learningOk: boolean; healthOk: boolean;
  allPass: boolean; failCount: number; incidentReport: string | null;
  dayFilledTotal: number | null; swingClosedTotal: number | null; longClosedTotal: number | null;
  dayWinRate: number | null; swingWinRate: number | null; longWinRate: number | null;
  dayGrade: string | null; swingGrade: string | null; longGrade: string | null;
  phase7Ready: boolean;
};

export type Phase7Cond = { key: string; met: boolean; current: string; target: string };

export type ValidationData = {
  records: ValidationRecord[];
  latest: ValidationRecord | null;
  phase7: { ready: boolean; conditions: Phase7Cond[] };
  stats: { totalRuns: number; passRuns: number; passRate: number | null; incidentRuns: number; consecutiveHealthDays: number };
};

export const PHASE7_LABEL_MAP: Record<string, MessageKey> = {
  day100:   "strategy.phase7.day100",
  swing30:  "strategy.phase7.swing30",
  long20:   "strategy.phase7.long20",
  dayB:     "strategy.phase7.gradeB",
  swingC:   "strategy.phase7.swingC",
  longC:    "strategy.phase7.longC",
  health30: "strategy.phase7.health30",
};


export type ReportData = {
  files:   string[];
  latest:  string | null;
  label:   string | null;
  content: string | null;
};


export type ActiveTab = StratType | "STABILIZATION" | "REPORTS";

