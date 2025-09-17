-- CreateTable
CREATE TABLE "QuickstartProgress" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "activateEmbed" TEXT NOT NULL DEFAULT 'todo',
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
