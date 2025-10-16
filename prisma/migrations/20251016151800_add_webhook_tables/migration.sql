-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "dead_letters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "stack" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "retriedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
