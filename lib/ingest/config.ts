/**
 * lib/ingest/config.ts — 摄入层常量（P12-INFRA-02 · Zero Wiring）
 * ────────────────────────────────────────────────────────────────────────────
 * 数值逐一取自**重构前的原实现**，完全一致，未做任何调整。
 * 由 scripts/test-ingest-equivalence.ts【1】用 `git show` 对旧源码字面量做机器校验。
 *
 * 🚧 本 Core 尚未接线 —— 这些常量目前**不影响生产**；原实现里各自的字面量仍在生效。
 *
 * 🔒 冻结提醒（docs/P11-Architecture-Baseline.md）：
 *    `NEWS_TOP_N` (200) 与 `TDNET_PROMOTE_TAKE` (500) + symbol 过滤 是
 *    Baseline §5.1「解除双重过滤」的目标 —— **本任务禁止改动**。
 *    集中于此的意义：将来只需改一处，而不必在两份复制品里各改一次
 *    （TDnet 两套已因分头维护而漂移 —— 见 types.ts）。
 */

/** 抓取标的：按 adaptiveScore 取前 N。原值 200（两份实现一致）。 */
export const NEWS_TOP_N = 200;

/** Yahoo 只对前 N 只标的抓取。原值 slice(0, 50)。 */
export const YAHOO_SLICE = 50;

/** Yahoo 每只标的之间的间隔（ms）。原值 100。 */
export const YAHOO_DELAY_MS = 100;

/** Kabutan 每只标的之间的间隔（ms）。原值 800。 */
export const KABUTAN_DELAY_MS = 800;

/** Disclosure→News 提升：回溯天数。原值 30。 */
export const TDNET_PROMOTE_LOOKBACK_DAYS = 30;

/** Disclosure→News 提升：单次取数上限。原值 take: 500。 */
export const TDNET_PROMOTE_TAKE = 500;

/** catalystScore 聚合回溯天数。原值 30（scripts/fetch-tdnet.ts）。 */
export const CATALYST_LOOKBACK_DAYS = 30;

/** Yahoo 市场通用新闻的来源标签值。原值 20。 */
export const CONFIDENCE_MARKET = 20;

/** TDnet 官方披露提升为 News 时的来源标签值。原值 95。 */
export const CONFIDENCE_DISCLOSURE = 95;

/** 僵尸任务阈值（ms）。原值 2h（两份实现一致）。 */
export const STALE_JOB_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/** SyncJob / SyncLog 的 source 值。 */
export const NEWS_SOURCE = "news";
export const TDNET_SOURCE = "tdnet";

/** SyncLog.message 最多保留的日志行数。原值 slice(0, 50)。 */
export const LOG_LINES_LIMIT = 50;
