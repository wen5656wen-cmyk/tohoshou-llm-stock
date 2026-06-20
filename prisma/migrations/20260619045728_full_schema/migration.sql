/*
  Warnings:

  - You are about to drop the column `eps` on the `Stock` table. All the data in the column will be lost.
  - You are about to drop the column `pb` on the `Stock` table. All the data in the column will be lost.
  - You are about to drop the column `pe` on the `Stock` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Stock" DROP COLUMN "eps",
DROP COLUMN "pb",
DROP COLUMN "pe",
ADD COLUMN     "aiScore" INTEGER,
ADD COLUMN     "change" DOUBLE PRECISION,
ADD COLUMN     "changeRate" DOUBLE PRECISION,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "dividend" DOUBLE PRECISION,
ADD COLUMN     "employees" INTEGER,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "pbr" DOUBLE PRECISION,
ADD COLUMN     "per" DOUBLE PRECISION,
ADD COLUMN     "roa" DOUBLE PRECISION,
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "Financial" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "quarter" INTEGER,
    "revenue" DOUBLE PRECISION,
    "operatingProfit" DOUBLE PRECISION,
    "ordinaryProfit" DOUBLE PRECISION,
    "netProfit" DOUBLE PRECISION,
    "totalAssets" DOUBLE PRECISION,
    "equity" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "bps" DOUBLE PRECISION,
    "roe" DOUBLE PRECISION,
    "roa" DOUBLE PRECISION,
    "equityRatio" DOUBLE PRECISION,
    "dividendPerShare" DOUBLE PRECISION,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Financial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "News" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "sentiment" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "score" INTEGER,
    "recommendation" TEXT,
    "summary" TEXT,
    "bullPoints" JSONB,
    "bearPoints" JSONB,
    "targetPrice" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Financial_stockId_idx" ON "Financial"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "Financial_stockId_fiscalYear_quarter_key" ON "Financial"("stockId", "fiscalYear", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "News_url_key" ON "News"("url");

-- CreateIndex
CREATE INDEX "News_stockId_idx" ON "News"("stockId");

-- CreateIndex
CREATE INDEX "News_publishedAt_idx" ON "News"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "AIAnalysis_stockId_idx" ON "AIAnalysis"("stockId");

-- CreateIndex
CREATE INDEX "AIAnalysis_createdAt_idx" ON "AIAnalysis"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Portfolio_symbol_idx" ON "Portfolio"("symbol");

-- AddForeignKey
ALTER TABLE "Financial" ADD CONSTRAINT "Financial_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
