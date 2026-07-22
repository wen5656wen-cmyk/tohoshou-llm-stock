// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 2 · Core Daily 机器码类型（SSOT）。展示文案走前端 i18n，本层只出机器码。
// 策略无关：所有结构带 strategyId/strategyVersion。
// ─────────────────────────────────────────────────────────────────────────────

export type AsOf = "15:15" | "15:23" | "09:00";
export type MarketSession = "PRE_CLOSE" | "CLOSE" | "OPEN";
export type RunStatus = "OK" | "DATA_INSUFFICIENT" | "ERROR";
export type IntegrityStatus = "PASS" | "FAIL";
export type GateResult = "PASS" | "BLOCKED" | "NA";
export type Decision = "SHADOW_BUY" | "NO_SIGNAL" | "AVOID";

export type IntegrityCode =
  | "MINUTE_INCOMPLETE"
  | "VWAP_ABNORMAL"
  | "VOLUME_ABNORMAL"
  | "BREADTH_MISSING"
  | "TOPIX_MISSING"
  | "STRATEGY_VERSION_MISSING";

export type SignalFailure =
  | "GATE_BLOCKED"
  | "NO_HARD_GATE"
  | "DATA_INSUFFICIENT"
  | "FILL_UNCERTAIN";

export type FillState =
  | "FILLED_FULL"
  | "FILLED_PARTIAL"
  | "NOT_FILLED_NO_CLOSE"
  | "NOT_FILLED_LIMIT_EVENT"
  | "NOT_FILLED_SPECIAL_QUOTE"
  | "NOT_FILLED_BROKER_REJECT"
  | "NOT_FILLED_ORDER_LATE"
  | "NOT_FILLED_NO_LIQUIDITY"
  | "FILL_UNCERTAIN";

export type ValidationFailure = "OVERNIGHT_REVERSAL" | "COST_EXCEEDED_EDGE" | "FILL_UNCERTAIN";

/** 单只信号（Phase 3 由 ComputeAdapter 产出；Phase 2 为空）。 */
export interface SignalInput {
  symbol: string;
  inCandidatePool: boolean;
  asOfChangePct: number | null;
  decision: Decision;
  confidence: number | null;
  refClose: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  topRules: string[];
  failureReason: SignalFailure | null;
}

/** 运行所需输入（分钟派生）。Phase 2：无数据 → 整体缺失 → DATA_INSUFFICIENT。 */
export interface ComputeInputs {
  minuteComplete: boolean;
  vwapOk: boolean;
  volumeOk: boolean;
  breadth: number | null; // Core30 涨家占比（大盘门控用）
  topixOk: boolean;
  strategyVersion: string | null;
  dataVersion: string | null;
  gateResult: GateResult;
  gateReasons: string[];
  /** 当前策略需要的完整性项（缺失才判 FAIL）。overnight_v1 用 breadth 代理，不含 TOPIX。 */
  requiredIntegrity: IntegrityCode[];
  signals: SignalInput[];
}

export interface RunParams {
  strategyId: string;
  tradeDate: string; // YYYY-MM-DD
  asOf: AsOf;
  marketSession: MarketSession;
}

export interface RunResult {
  runId: string;
  runStatus: RunStatus;
  integrityStatus: IntegrityStatus;
  integrityReasons: IntegrityCode[];
  gateResult: GateResult;
  candidateCount: number;
  shadowBuyCount: number;
  failureReason: string | null;
  durationMs: number;
}
