-- CreateTable
CREATE TABLE "GdprRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmailHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "artifactPath" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "deletedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "GdprRequest_shop_topic_idx" ON "GdprRequest"("shop", "topic");
CREATE INDEX "GdprRequest_shop_customerId_idx" ON "GdprRequest"("shop", "customerId");

