-- CreateTable: AI产业链主题分类
CREATE TABLE IF NOT EXISTS "ai_themes" (
    "id"        SERIAL PRIMARY KEY,
    "symbol"    TEXT NOT NULL,
    "theme"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_themes_symbol_key" ON "ai_themes"("symbol");
CREATE INDEX IF NOT EXISTS "ai_themes_theme_idx" ON "ai_themes"("theme");
