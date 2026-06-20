-- CreateTable
CREATE TABLE "line_users" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "lastSymbol" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_users_userId_key" ON "line_users"("userId");

-- CreateIndex
CREATE INDEX "line_users_isActive_idx" ON "line_users"("isActive");
