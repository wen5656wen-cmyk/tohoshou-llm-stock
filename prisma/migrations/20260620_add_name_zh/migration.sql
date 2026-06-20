-- Add nameZh (Chinese name) to Stock and StockScore
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "nameZh" TEXT;
ALTER TABLE "StockScore" ADD COLUMN IF NOT EXISTS "nameZh" TEXT;

-- Index for search
CREATE INDEX IF NOT EXISTS "Stock_nameZh_idx" ON "Stock"("nameZh");
