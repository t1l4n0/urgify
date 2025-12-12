-- CreateTable
CREATE TABLE "cart_upsell_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "heading" TEXT NOT NULL DEFAULT 'Recommendations',
    "maxProducts" INTEGER NOT NULL DEFAULT 3,
    "showPrice" BOOLEAN NOT NULL DEFAULT true,
    "showCompareAtPrice" BOOLEAN NOT NULL DEFAULT true,
    "imageSize" TEXT NOT NULL DEFAULT 'medium',
    "buttonLabel" TEXT NOT NULL DEFAULT 'Add to cart',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "cart_upsell_settings_shop_key" ON "cart_upsell_settings"("shop");
