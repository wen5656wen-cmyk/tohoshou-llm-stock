-- CreateTable
CREATE TABLE "watch_list" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "market" TEXT,
    "note" TEXT,
    "targetPrice" DOUBLE PRECISION,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_list_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watch_list_symbol_key" ON "watch_list"("symbol");

-- CreateIndex
CREATE INDEX "watch_list_addedAt_idx" ON "watch_list"("addedAt" DESC);
