-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "scaleCategory" TEXT,
ALTER COLUMN "market" SET DEFAULT 'TSE',
ALTER COLUMN "price" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "StockScore" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "scaleCategory" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "priceCount" INTEGER NOT NULL DEFAULT 0,
    "latestDate" TEXT,
    "latestClose" DOUBLE PRECISION,
    "return5d" DOUBLE PRECISION,
    "return20d" DOUBLE PRECISION,
    "return60d" DOUBLE PRECISION,
    "rsi14" DOUBLE PRECISION,
    "macd" DOUBLE PRECISION,
    "macdSignal" DOUBLE PRECISION,
    "macdHist" DOUBLE PRECISION,
    "maTrend" TEXT,
    "macdSignalLabel" TEXT,
    "technicalScore" INTEGER,
    "fundamentalScore" INTEGER,
    "riskScore" INTEGER,
    "totalScore" INTEGER,
    "recommendation" TEXT,
    "starsLabel" TEXT,
    "summaryReason" TEXT,

    CONSTRAINT "StockScore_pkey" PRIMARY KEY ("symbol")
);

-- CreateIndex
CREATE INDEX "StockScore_totalScore_idx" ON "StockScore"("totalScore" DESC);

-- CreateIndex
CREATE INDEX "StockScore_computedAt_idx" ON "StockScore"("computedAt" DESC);

-- CreateIndex
CREATE INDEX "StockScore_market_idx" ON "StockScore"("market");

-- CreateIndex
CREATE INDEX "StockScore_recommendation_idx" ON "StockScore"("recommendation");
