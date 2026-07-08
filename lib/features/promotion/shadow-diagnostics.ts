// ── TOHOSHOU AI · Shadow Sample Completion 诊断（P6-T9 · T9.3）──────────────
// 对无因子回测的 Shadow 因子（Financial / Institution / TDnet / …），基于**实测上游
// 覆盖率**与因子语义，输出诚实的 Pending Reason，供后续补齐 Backtest 样本决策。
// **纯函数 · 只读 · 不虚构任何统计。** 无法测量的一律标为 pending 并给出真实原因码。

/** Pending 原因码（英文枚举，供 API/排序/多语言）。 */
export type PendingReasonCode =
  | "WAITING_MORE_TRADING_DAYS"
  | "COVERAGE_TOO_LOW"
  | "NO_TRIGGER_SAMPLES"
  | "INSUFFICIENT_HISTORY"
  | "BACKTEST_DISABLED"
  | "NO_DATA_SOURCE";

/** 原因码 → 中文标签（展示用）。 */
export const PENDING_REASON_LABEL: Record<PendingReasonCode, string> = {
  WAITING_MORE_TRADING_DAYS: "等待更多交易日",
  COVERAGE_TOO_LOW: "覆盖率过低",
  NO_TRIGGER_SAMPLES: "无触发样本",
  INSUFFICIENT_HISTORY: "历史不足",
  BACKTEST_DISABLED: "回测未接入",
  NO_DATA_SOURCE: "数据源缺失",
};

/** 上游可测量的诊断输入（由 API 从真实表 count 得到）。 */
export interface ShadowDiagInputs {
  financialCoverage: number | null; // % aiEnabled 股票有 Financial 行
  instWeeks: number | null;         // InstitutionalFlow 去重周数
  tdnetTriggerCount: number | null; // 近 90 日开示事件触发数
  shortSellCoverage: number | null; // % 股票有 ShortSellingRatio
}

export interface ShadowDiag {
  coverage: number | null;       // 实测覆盖率 %（市场级信号 → 0，无数据 → null）
  sampleCount: number | null;    // 可用 backtest 样本（当前均无因子回测 → 触发数或 0）
  backtestAvailable: boolean;    // 是否已接入因子级回测
  pendingReasonCode: PendingReasonCode;
  pendingReason: string;         // 一句话真实原因（含实测数字）
}

interface FeatureMeta { id: string; category: string; source: string; description: string }

/** 描述里带「恒 N/A / 无字段」的因子直接判定数据源缺失。 */
function isKnownNoSource(desc: string): boolean {
  return /恒\s*N\/A|无现金流字段|无.*字段/.test(desc);
}

/**
 * 对单个无因子回测的 Shadow 因子做诊断。
 * @param f 因子元数据
 * @param inp 实测上游覆盖率
 */
export function diagnoseShadow(f: FeatureMeta, inp: ShadowDiagInputs): ShadowDiag {
  const base = { backtestAvailable: false as const };

  // 0) 描述已声明无数据源（如现金流质量：Financial 表无现金流字段）
  if (isKnownNoSource(f.description)) {
    return { ...base, coverage: null, sampleCount: 0, pendingReasonCode: "NO_DATA_SOURCE",
      pendingReason: "上游数据源缺失（对应字段不存在）→ 无法计算因子值" };
  }

  // 1) TDnet 事件因子：看真实触发数
  if (f.category === "TDNET") {
    const n = inp.tdnetTriggerCount ?? 0;
    if (n < 30) {
      return { ...base, coverage: null, sampleCount: n, pendingReasonCode: "NO_TRIGGER_SAMPLES",
        pendingReason: `近 90 日仅 ${n} 起相关开示事件（<30）→ 触发样本不足，无法回测事件超额` };
    }
    return { ...base, coverage: null, sampleCount: n, pendingReasonCode: "BACKTEST_DISABLED",
      pendingReason: `已有 ${n} 起开示事件，但事件研究（event-study）回测尚未接入` };
  }

  // 2) 机构资金流：市场级信号（非 per-symbol）
  if (f.category === "MONEY_FLOW" && f.source === "InstitutionalFlow") {
    const w = inp.instWeeks ?? 0;
    if (/连续|streak|稳定|stability|reversal|反转|momentum|趋势/.test(f.description) && w < 12) {
      return { ...base, coverage: 0, sampleCount: w, pendingReasonCode: "INSUFFICIENT_HISTORY",
        pendingReason: `机构资金历史仅 ${w} 周（趋势/连续类因子需更长）→ 历史不足` };
    }
    return { ...base, coverage: 0, sampleCount: w, pendingReasonCode: "COVERAGE_TOO_LOW",
      pendingReason: `机构资金为市场级信号（无 per-symbol 序列，历史 ${w} 周）→ 无法构建个股 cohort 回测` };
  }

  // 3) 空売り比率
  if (f.id === "shortSellingRatio") {
    const c = inp.shortSellCoverage;
    if (c != null && c < 30) {
      return { ...base, coverage: c, sampleCount: null, pendingReasonCode: "COVERAGE_TOO_LOW",
        pendingReason: `空売り比率覆盖仅 ${c}%（<30%）→ 覆盖不足以回测` };
    }
    return { ...base, coverage: c, sampleCount: null, pendingReasonCode: "BACKTEST_DISABLED",
      pendingReason: `空売り比率覆盖 ${c == null ? "—" : c + "%"}，但因子级回测尚未接入` };
  }

  // 4) 财务基本面：季度数据、无 per-date 信号序列
  if (f.category === "FUNDAMENTAL") {
    const c = inp.financialCoverage;
    if (c != null && c < 20) {
      return { ...base, coverage: c, sampleCount: null, pendingReasonCode: "COVERAGE_TOO_LOW",
        pendingReason: `Financial 覆盖仅 ${c}%（<20%）→ 覆盖不足` };
    }
    return { ...base, coverage: c, sampleCount: null, pendingReasonCode: "INSUFFICIENT_HISTORY",
      pendingReason: `Financial 覆盖 ${c == null ? "—" : c + "%"}，但为季度数据、无 per-date 信号序列 → 因子回测需更多财报期` };
  }

  // 5) AI 派生（V3 影子）：由 V3 Shadow Freeze replay 单独评估
  if (f.category === "AI") {
    return { ...base, coverage: null, sampleCount: null, pendingReasonCode: "BACKTEST_DISABLED",
      pendingReason: "由 V3 Shadow Freeze replay 管线单独评估，不走因子 alpha 回测" };
  }

  // 6) 兜底
  return { ...base, coverage: null, sampleCount: null, pendingReasonCode: "BACKTEST_DISABLED",
    pendingReason: "因子级回测尚未接入" };
}
