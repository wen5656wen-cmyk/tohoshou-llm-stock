-- AddColumn: category and relatedSymbolConfidence to News
ALTER TABLE "News" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "News" ADD COLUMN IF NOT EXISTS "relatedSymbolConfidence" INTEGER NOT NULL DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS "News_relatedSymbolConfidence_idx" ON "News"("relatedSymbolConfidence");
CREATE INDEX IF NOT EXISTS "News_category_idx" ON "News"("category");
