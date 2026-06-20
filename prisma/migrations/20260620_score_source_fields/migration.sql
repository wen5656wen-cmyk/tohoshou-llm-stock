-- V3.1: Data Authority — add source transparency fields to StockScore
ALTER TABLE "StockScore" ADD COLUMN IF NOT EXISTS "moneyFlowSource"   TEXT;
ALTER TABLE "StockScore" ADD COLUMN IF NOT EXISTS "globalTrendSource"  TEXT;
ALTER TABLE "StockScore" ADD COLUMN IF NOT EXISTS "scoreSource"        TEXT;

-- Index for filtering by scoreSource (e.g. show only REAL data stocks)
CREATE INDEX IF NOT EXISTS "StockScore_scoreSource_idx" ON "StockScore"("scoreSource");
