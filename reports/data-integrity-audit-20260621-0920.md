# Data Integrity Audit — 2026-06-21T01:20 UTC

> Version: v8.2.3 | Read-only audit of stock data pipeline


## 1. Basic Data Counts

-    **Stock total**: 3716
-    **DailyPrice total**: 7,912,513
-    **StockScore total**: 3714

## 2. adjClose Coverage (DailyPrice)

- ✅ **Rows WITH adjClose**: 7,912,513 / 7,912,513 (100.00%)
- ✅ **Rows WITHOUT adjClose (missing)**: 0

## 3. Return Anomalies (StockScore, priceCount≥20)

-    **|return5d|  > 30%**: 32   (↑24 ↓8)
-    **|return20d| > 50%**: 24 (↑20 ↓4)
-    **|return60d| > 100%**: 35 (↑35 ↓0)

## 4. Split Contamination (|return60d|>100% vs adjClose-computed return)

-    **Extreme return60d stocks (|>100%)**: 35
- ❌ **Contamination: return60d ≠ adjClose-based by >10pp**: 34

## 5. 52-Week High/Low Anomalies

- ✅ **high52w < current price (anomaly)**: 0
- ✅ **low52w  > current price (anomaly)**: 0

## 6. NaN / Infinity in StockScore Float Fields

- ✅ **NaN/Inf in adaptiveScore**: 0
- ✅ **NaN/Inf in percentileRank**: 0
- ✅ **NaN/Inf in rsi14**: 0
- ✅ **NaN/Inf in return60d**: 0
- ✅ **NaN/Inf in return20d**: 0
- ✅ **NaN/Inf in return5d**: 0
- ✅ **NaN/Inf in opportunityScore**: 0
- ✅ **TOTAL NaN/Infinity across all fields**: 0

## 7. NULL Rating in StockScore (priceCount≥20)

- ✅ **recommendationV2 = NULL**: 0
- ✅ **adaptiveScore = NULL**: 0
- ✅ **percentileRank = NULL**: 0

## 8. Stale Stocks

- ✅ **Stocks with lastSyncAt < 5 days ago**: 0
- ✅ **Stocks with lastSyncAt = NULL**: 0

## 9. Rating Distribution (priceCount≥20)

-    **STRONG_BUY**: 5 (0.1%)
-    **BUY**: 31 (0.8%)
-    **HOLD**: 508 (13.7%)
-    **WATCH**: 1512 (40.7%)
-    **AVOID**: 1658 (44.6%)
-    **Bull rate (STRONG_BUY + BUY)**: 1.0%

## 10. Rating Criteria Compliance


### STRONG_BUY Stocks (criteria: adaptiveScore≥75 AND percentileRank≤5%)

| Symbol | Name | adaptiveScore | percentileRank | Pass |
|--------|------|:---:|:---:|:---:|
| 291A.T | Reskill教育 | 77.0 | 0.0 | ✅ |
| 6194.T | 阿特拉埃人才科技 | 75.0 | 0.1 | ✅ |
| 9552.T | 量化研究控股 | 76.0 | 0.1 | ✅ |
| 2127.T | 日本M&A中心控股 | 75.0 | 0.1 | ✅ |
| 8918.T | Land不动产 | 75.0 | 0.1 | ✅ |
- ✅ **STRONG_BUY criteria violations**: 0
- ✅ **BUY criteria violations**: 0

## 11. Problem Stocks Summary

-    **Total problem stock entries (capped at 50)**: 35

| Symbol | Name | IssueType | Detail | Judgment |
|--------|------|-----------|--------|----------|
| 285A.T | キオクシア控股 | EXTREME_RETURN60D | return60d=405.9% | GENUINE (adjClose-verified) |
| 6976.T | 太阳诱电 | EXTREME_RETURN60D | return60d=392.0% | GENUINE (adjClose-verified) |
| 6997.T | 日本ケミコン | EXTREME_RETURN60D | return60d=312.1% | GENUINE (adjClose-verified) |
| 3905.T | 数据セクション | EXTREME_RETURN60D | return60d=307.9% | GENUINE (adjClose-verified) |
| 6779.T | 日本电波工业 | EXTREME_RETURN60D | return60d=288.7% | GENUINE (adjClose-verified) |
| 4392.T | FIG | EXTREME_RETURN60D | return60d=279.7% | GENUINE (adjClose-verified) |
| 6327.T | 北川精機 | EXTREME_RETURN60D | return60d=248.8% | GENUINE (adjClose-verified) |
| 3449.T | 技术フレックス | EXTREME_RETURN60D | return60d=247.8% | GENUINE (adjClose-verified) |
| 6981.T | 村田制作所 | EXTREME_RETURN60D | return60d=234.9% | GENUINE (adjClose-verified) |
| 4062.T | 揖斐电 | EXTREME_RETURN60D | return60d=225.7% | GENUINE (adjClose-verified) |
| 9256.T | サクシード | EXTREME_RETURN60D | return60d=214.4% | GENUINE (adjClose-verified) |
| 3891.T | 日本高度纸工业 | EXTREME_RETURN60D | return60d=207.6% | GENUINE (adjClose-verified) |
| 4047.T | 关东电化工业 | EXTREME_RETURN60D | return60d=196.8% | GENUINE (adjClose-verified) |
| 278A.T | Terra Drone | EXTREME_RETURN60D | return60d=173.9% | GENUINE (adjClose-verified) |
| 6597.T | HPC系统 | EXTREME_RETURN60D | return60d=173.2% | GENUINE (adjClose-verified) |
| 3480.T | ジェイ・エス・ビー | EXTREME_RETURN60D | return60d=171.7% | GENUINE (adjClose-verified) |
| 3436.T | SUMCO | EXTREME_RETURN60D | return60d=166.5% | GENUINE (adjClose-verified) |
| 6480.T | 日本トムソン | EXTREME_RETURN60D | return60d=163.6% | GENUINE (adjClose-verified) |
| 6996.T | ニチコン | EXTREME_RETURN60D | return60d=162.6% | GENUINE (adjClose-verified) |
| 6217.T | 津田駒工业 | EXTREME_RETURN60D | return60d=142.5% | GENUINE (adjClose-verified) |
| 6101.T | 津上 | EXTREME_RETURN60D | return60d=126.4% | GENUINE (adjClose-verified) |
| 4980.T | デクセリアルズ | EXTREME_RETURN60D | return60d=126.1% | GENUINE (adjClose-verified) |
| 8289.T | Olympic集团 | EXTREME_RETURN60D | return60d=125.3% | GENUINE (adjClose-verified) |
| 6336.T | 石井表記 | EXTREME_RETURN60D | return60d=121.4% | GENUINE (adjClose-verified) |
| 5367.T | Nikkato精细陶瓷 | EXTREME_RETURN60D | return60d=121.0% | GENUINE (adjClose-verified) |
| 6266.T | タツモ | EXTREME_RETURN60D | return60d=115.1% | GENUINE (adjClose-verified) |
| 6966.T | 三井ハイテック | EXTREME_RETURN60D | return60d=112.8% | GENUINE (adjClose-verified) |
| 6840.T | AKIBA控股 | EXTREME_RETURN60D | return60d=109.7% | GENUINE (adjClose-verified) |
| 6800.T | 横河电机 | EXTREME_RETURN60D | return60d=109.0% | GENUINE (adjClose-verified) |
| 6668.T | 阿德泰克等离子技术 | EXTREME_RETURN60D | return60d=108.0% | GENUINE (adjClose-verified) |
| 6723.T | 瑞萨电子 | EXTREME_RETURN60D | return60d=108.0% | GENUINE (adjClose-verified) |
| 6324.T | 谐波传动系统 | EXTREME_RETURN60D | return60d=103.1% | GENUINE (adjClose-verified) |
| 9984.T | 软银集团 | EXTREME_RETURN60D | return60d=102.8% | GENUINE (adjClose-verified) |
| 6387.T | サムコ | EXTREME_RETURN60D | return60d=102.5% | GENUINE (adjClose-verified) |
| 5998.T | アドバネクス | EXTREME_RETURN60D | return60d=102.2% | GENUINE (adjClose-verified) |

## 12. Deep-Dive: 10 Specific Stocks

(Full data chain: Stock table → DailyPrice → StockScore)


### 2127.T — 日本M&A中心控股
| Field | Value |
|-------|-------|
| price / high52w / low52w | 644.1 / 805.8 / 623.7 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 75.0 |
| percentileRank | 0.1 |
| recommendationV2 | STRONG_BUY |
| return5d / 20d / 60d | 1.3% / -2.7% / 2.7% |
| adjClose-computed return60d | -5.6% ⚠️ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 4062.T — 揖斐电
| Field | Value |
|-------|-------|
| price / high52w / low52w | 24560 / 25715 / 2915 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 63.0 |
| percentileRank | 8.5 |
| recommendationV2 | HOLD |
| return5d / 20d / 60d | 28.6% / 27.6% / 225.7% |
| adjClose-computed return60d | 156.5% ⚠️ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 9552.T — 量化研究控股
| Field | Value |
|-------|-------|
| price / high52w / low52w | 1048 / 1433 / 560 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 76.0 |
| percentileRank | 0.1 |
| recommendationV2 | STRONG_BUY |
| return5d / 20d / 60d | 0.1% / 12.4% / 87.1% |
| adjClose-computed return60d | 52.8% ⚠️ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 5985.T — サンコール
| Field | Value |
|-------|-------|
| price / high52w / low52w | 2014 / 2280 / 286 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 54.0 |
| percentileRank | 27.1 |
| recommendationV2 | WATCH |
| return5d / 20d / 60d | 45.8% / 9.3% / 24.5% |
| adjClose-computed return60d | 20.3% ✅ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 7717.T — ブイ・技术
| Field | Value |
|-------|-------|
| price / high52w / low52w | 8430 / 8430 / 2800 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 65.0 |
| percentileRank | 4.4 |
| recommendationV2 | HOLD |
| return5d / 20d / 60d | 37.8% / 61.8% / 93.1% |
| adjClose-computed return60d | 66.9% ⚠️ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 8136.T — サンリオ
| Field | Value |
|-------|-------|
| price / high52w / low52w | 918 / 1728.6 / 839 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 43.0 |
| percentileRank | 59.9 |
| recommendationV2 | AVOID |
| return5d / 20d / 60d | 6.2% / 6.2% / -13.6% |
| adjClose-computed return60d | -12.2% ✅ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 7012.T — 川崎重工业
| Field | Value |
|-------|-------|
| price / high52w / low52w | 3191 / 3675 / 1744 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 54.0 |
| percentileRank | 27.0 |
| recommendationV2 | WATCH |
| return5d / 20d / 60d | 12.6% / 7.4% / 3.8% |
| adjClose-computed return60d | 1.9% ✅ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 5803.T — 藤仓
| Field | Value |
|-------|-------|
| price / high52w / low52w | 5161 / 7855 / 1118.8 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 43.0 |
| percentileRank | 61.4 |
| recommendationV2 | AVOID |
| return5d / 20d / 60d | 21.3% / 6.4% / 27.3% |
| adjClose-computed return60d | -6.7% ⚠️ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 6731.T — ピクセラ
| Field | Value |
|-------|-------|
| price / high52w / low52w | 103 / 1160 / 103 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 34.0 |
| percentileRank | 88.4 |
| recommendationV2 | AVOID |
| return5d / 20d / 60d | -30.4% / -30.9% / -74.3% |
| adjClose-computed return60d | -47.2% ⚠️ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

### 285A.T — キオクシア控股
| Field | Value |
|-------|-------|
| price / high52w / low52w | 108600 / 108600 / 2300 |
| lastSyncAt | 2026-06-20 |
| adaptiveScore | 57.0 |
| percentileRank | 21.7 |
| recommendationV2 | WATCH |
| return5d / 20d / 60d | 33.7% / 89.2% / 405.9% |
| adjClose-computed return60d | 255.9% ⚠️ |
| priceCount | 300 |
| computedAt | 2026-06-21T01:03 |

## 13. Acceptance Criteria Summary


| Criterion | Value | Pass |
|-----------|-------|:----:|
| adjClose coverage ≥99% | 100.00% | ✅ |
| Split contamination = 0 | 34 | ❌ |
| NaN/Infinity in StockScore = 0 | 0 | ✅ |
| recommendationV2 NULL = 0 (p≥20) | 0 | ✅ |
| adaptiveScore NULL = 0 (p≥20) | 0 | ✅ |
| high52w anomalies = 0 | 0 | ✅ |
| low52w anomalies = 0 | 0 | ✅ |
| STRONG_BUY criteria violations = 0 | 0 | ✅ |
| BUY criteria violations = 0 | 0 | ✅ |

**Overall: 8/9 criteria passed**
