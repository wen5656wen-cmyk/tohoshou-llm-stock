-- SyncJob: async background sync jobs (e.g. J-Quants full sync)
CREATE TABLE IF NOT EXISTS "SyncJob" (
  "id"           TEXT        NOT NULL,
  "source"       TEXT        NOT NULL,
  "status"       TEXT        NOT NULL DEFAULT 'PENDING',
  "total"        INTEGER     NOT NULL DEFAULT 0,
  "processed"    INTEGER     NOT NULL DEFAULT 0,
  "successCount" INTEGER     NOT NULL DEFAULT 0,
  "failedCount"  INTEGER     NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt"    TIMESTAMP(3),
  "finishedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncJob_source_createdAt_idx" ON "SyncJob"("source", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SyncJob_status_idx" ON "SyncJob"("status");
