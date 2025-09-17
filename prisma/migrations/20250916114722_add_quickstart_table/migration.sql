-- CreateTable
CREATE TABLE "Quickstart" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "embedActive" BOOLEAN NOT NULL DEFAULT false,
    "themeId" TEXT,
    "lastActivated" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
