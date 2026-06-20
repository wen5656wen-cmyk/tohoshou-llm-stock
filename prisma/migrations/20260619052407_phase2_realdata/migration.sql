-- AlterTable
ALTER TABLE "AIAnalysis" ADD COLUMN     "grade" TEXT,
ADD COLUMN     "investReason" TEXT,
ADD COLUMN     "riskWarnings" JSONB,
ADD COLUMN     "scoreCapitalFlow" INTEGER,
ADD COLUMN     "scoreGrowth" INTEGER,
ADD COLUMN     "scoreProfitability" INTEGER,
ADD COLUMN     "scoreSentiment" INTEGER,
ADD COLUMN     "scoreValuation" INTEGER,
ADD COLUMN     "stars" INTEGER,
ADD COLUMN     "upsideRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Financial" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "avgVolume" DOUBLE PRECISION,
ADD COLUMN     "beta" DOUBLE PRECISION,
ADD COLUMN     "bps" DOUBLE PRECISION,
ADD COLUMN     "eps" DOUBLE PRECISION,
ADD COLUMN     "high52w" DOUBLE PRECISION,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "low52w" DOUBLE PRECISION,
ADD COLUMN     "volume" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "DailyPrice" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "adjClose" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'yahoo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "dividend" DOUBLE PRECISION NOT NULL,
    "yieldRate" DOUBLE PRECISION,
    "payoutRatio" DOUBLE PRECISION,
    "exDivDate" DATE,
    "payDate" DATE,
    "source" TEXT NOT NULL DEFAULT 'yahoo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disclosure" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER,
    "symbol" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT,
    "sentiment" TEXT,
    "url" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Disclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyPrice_symbol_date_idx" ON "DailyPrice"("symbol", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPrice_symbol_date_key" ON "DailyPrice"("symbol", "date");

-- CreateIndex
CREATE INDEX "Dividend_symbol_idx" ON "Dividend"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Dividend_symbol_year_quarter_key" ON "Dividend"("symbol", "year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "Disclosure_url_key" ON "Disclosure"("url");

-- CreateIndex
CREATE INDEX "Disclosure_symbol_idx" ON "Disclosure"("symbol");

-- CreateIndex
CREATE INDEX "Disclosure_publishedAt_idx" ON "Disclosure"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Disclosure_category_idx" ON "Disclosure"("category");

-- CreateIndex
CREATE INDEX "SyncLog_source_createdAt_idx" ON "SyncLog"("source", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Disclosure" ADD CONSTRAINT "Disclosure_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
