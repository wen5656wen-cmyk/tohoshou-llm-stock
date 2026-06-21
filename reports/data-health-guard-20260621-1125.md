# Data Health Guard — 2026-06-21T02:25 UTC

## Summary

| Field | Value |
|-------|-------|
| Status | **CRITICAL** |
| Stock total | 3716 |
| Score total | 325 |
| Latest price date | 2026-06-19 |
| adjClose coverage | 100.00% |
| CRITICAL | 2 |
| WARNING | 3 |
| INFO | 1 |
| Allow recommendation | ❌ NO |
| Requires review | ⚠️ YES |

## Check Results

| Check | Level | Value | Pass |
|-------|-------|-------|:----:|
| adjClose coverage ≥99% | CRITICAL | 100.00% | ✅ |
| Split contamination = 0 (sample top-10) | CRITICAL | 0 | ✅ |
| high52w < current price = 0 | CRITICAL | 0 | ✅ |
| low52w > current price = 0 | CRITICAL | 0 | ✅ |
| high52w > price×10 (suspect) | WARNING | 19 | ⚠️ |
| low52w < price÷20 (suspect) | WARNING | 262 | ⚠️ |
| |return5d| > 50% | INFO | 0 | ✅ |
| |return20d| > 100% or < -70% | WARNING | 0 | ✅ |
| return60d > 300% or < -90% | WARNING | 0 | ✅ |
| adaptiveScore NULL = 0 (priceCount≥20) | CRITICAL | 0 | ✅ |
| opportunityScore NULL = 0 (priceCount≥20) | INFO | 325 | ⚠️ |
| percentileRank NULL = 0 (priceCount≥20) | CRITICAL | 325 | ❌ |
| recommendationV2 NULL = 0 (priceCount≥20) | CRITICAL | 325 | ❌ |
| NaN/Infinity in StockScore = 0 | CRITICAL | 0 | ✅ |
| Stale stocks (>3 days, total) | WARNING | 3394 | ⚠️ |
| STRONG_BUY criteria violations = 0 | CRITICAL | 0 | ✅ |
| BUY criteria violations = 0 | INFO | 0 | ✅ |
| Extreme return60d without highRiskFlag | WARNING | 1 | ✅ |
| Stale stocks with STRONG_BUY = 0 | CRITICAL | 0 | ✅ |
| StockScore.latestClose valid (>0) | INFO | OK | ✅ |

## Top Issues

1. percentileRank NULL = 0 (priceCount≥20): 325
2. recommendationV2 NULL = 0 (priceCount≥20): 325
3. high52w > price×10 (suspect): 19
4. low52w < price÷20 (suspect): 262
5. Stale stocks (>3 days, total): 3394

## Action
**Daily Pick BLOCKED.** Please run `npm run audit:data` for full investigation.
