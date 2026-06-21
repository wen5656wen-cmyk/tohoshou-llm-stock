# Data Integrity Audit — 2026-06-21T01:36 UTC

> Version: v8.2.3 | Read-only audit of stock data pipeline


## 1. Basic Data Counts

-    **Stock total**: 3716
-    **DailyPrice total**: 677,292
-    **StockScore total**: 325

## 2. adjClose Coverage (DailyPrice)

- ✅ **Rows WITH adjClose**: 677,292 / 677,292 (100.00%)
- ✅ **Rows WITHOUT adjClose (missing)**: 0

## 3. Return Anomalies (StockScore, priceCount≥20)

-    **|return5d|  > 30%**: 2   (↑0 ↓2)
-    **|return20d| > 50%**: 3 (↑2 ↓1)
-    **|return60d| > 100%**: 1 (↑1 ↓0)

## 4. Split Contamination (|return60d|>100% vs adjClose-computed return)

-    **Extreme return60d stocks (|>100%)**: 1
- ✅ **Contamination: return60d ≠ adjClose-based by >10pp**: 0

## 5. 52-Week High/Low Anomalies

- ✅ **high52w < current price (anomaly)**: 0
- ✅ **low52w  > current price (anomaly)**: 0

## 6. NaN / Infinity in StockScore Float Fields

- ✅ **NaN/Inf in adaptiveScore**: 0
- ✅ **NaN/Inf in percentileRank**: 0
- ✅ **NaN/Inf in return5d**: 0
- ✅ **NaN/Inf in return20d**: 0
- ✅ **NaN/Inf in return60d**: 0
- ✅ **NaN/Inf in rsi14**: 0
- ✅ **NaN/Inf in opportunityScore**: 0
- ✅ **TOTAL NaN/Infinity across all fields**: 0

## 7. NULL Rating in StockScore (priceCount≥20)

- ❌ **recommendationV2 = NULL**: 325
- ✅ **adaptiveScore = NULL**: 0
- ❌ **percentileRank = NULL**: 325

## 8. Stale Stocks

- ✅ **Stocks with lastSyncAt < 5 days ago**: 0
- ❌ **Stocks with lastSyncAt = NULL**: 3394

## 9. Rating Distribution (priceCount≥20)

-    **STRONG_BUY**: 0
-    **BUY**: 0
-    **HOLD**: 0
-    **WATCH**: 0
-    **AVOID**: 0
-    **Bull rate (STRONG_BUY + BUY)**: 0.0%

## 10. Rating Criteria Compliance


### STRONG_BUY Stocks (criteria: adaptiveScore≥75 AND percentileRank≤5%)

| Symbol | Name | adaptiveScore | percentileRank | Pass |
|--------|------|:---:|:---:|:---:|
- ✅ **STRONG_BUY criteria violations**: 0
- ✅ **BUY criteria violations**: 0

## 11. Problem Stocks Summary

-    **Total problem stock entries (capped at 50)**: 1

| Symbol | Name | IssueType | Detail | Judgment |
|--------|------|-----------|--------|----------|
| 9984.T | 软银集团 | EXTREME_RETURN60D | return60d=102.8% | GENUINE (adjClose-verified) |

## 12. Deep-Dive: 10 Specific Stocks

(Full data chain: Stock table → DailyPrice → StockScore)


### 2127.T — 日本M&A中心控股
| Field | Value |
|-------|-------|
| price / high52w / low52w | 644.1 / 7840 / 0 |
| lastSyncAt | 2026-06-19 |
| adaptiveScore | 75.0 |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | 1.3% / -2.7% / 2.7% |
| adjClose-computed return60d | 2.7% ✅ |
| priceCount | 300 |
| computedAt | 2026-06-20T11:31 |

### 4062.T — 揖斐电
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 9552.T — クオンツ总研控股
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 5985.T — サンコール
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 7717.T — ブイ・技术
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 8136.T — サンリオ
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 7012.T — 川崎重工业
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 5803.T — 藤仓
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 6731.T — ピクセラ
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

### 285A.T — キオクシア控股
| Field | Value |
|-------|-------|
| price / high52w / low52w | 0 / NULL / NULL |
| lastSyncAt | NULL |
| adaptiveScore | — |
| percentileRank | — |
| recommendationV2 | NULL |
| return5d / 20d / 60d | —% / —% / —% |
| adjClose-computed return60d | N/A ✅ |
| priceCount | N/A |
| computedAt | NULL |

## 13. Acceptance Criteria Summary


| Criterion | Value | Pass |
|-----------|-------|:----:|
| adjClose coverage ≥99% | 100.00% | ✅ |
| Split contamination = 0 | 0 | ✅ |
| NaN/Infinity in StockScore = 0 | 0 | ✅ |
| recommendationV2 NULL = 0 (p≥20) | 325 | ❌ |
| adaptiveScore NULL = 0 (p≥20) | 0 | ✅ |
| high52w anomalies = 0 | 0 | ✅ |
| low52w anomalies = 0 | 0 | ✅ |
| STRONG_BUY criteria violations = 0 | 0 | ✅ |
| BUY criteria violations = 0 | 0 | ✅ |

**Overall: 8/9 criteria passed**
