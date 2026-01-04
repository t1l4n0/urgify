import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

// CORS headers for storefront access
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
};

/**
 * Public endpoint for fetching cart upsell configuration
 * Used by the frontend JavaScript when Liquid config is empty
 * 
 * Query parameters:
 * - shop: Shop domain (e.g., shop.myshopify.com)
 * 
 * Returns:
 * {
 *   config: {
 *     enabled: boolean
 *     heading: string
 *     max_products: number
 *     show_price: boolean
 *     show_compare_at_price: boolean
 *     image_size: string
 *     button_label: string
 *   }
 * }
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Max-Age": "600",
      },
    });
  }
  try {
    const url = new URL(request.url);
    const shopParam = url.searchParams.get('shop');

    if (!shopParam) {
      return json(
        { error: "shop parameter is required" },
        { status: 400, headers: { ...CORS_HEADERS } }
      );
    }

    // Normalize shop domain
    let shop = shopParam.replace(/^https?:\/\//, '').split('/')[0];
    // Remove .myshopify.com if present (we store without it)
    shop = shop.replace(/\.myshopify\.com$/, '');
    
    console.log(`[Cart Upsell Config] Looking up settings for shop: "${shop}" (normalized from: "${shopParam}")`);
    
    // Default config
    const defaultConfig = {
      enabled: false,
      heading: "Recommendations",
      max_products: 3,
      show_price: true,
      show_compare_at_price: true,
      image_size: "medium",
      button_label: "Add to cart",
    };

    // Fetch cart upsell settings from database
    let config = { ...defaultConfig };
    try {
      // Try exact match first
      let dbSettings = await prisma.cartUpsellSettings.findUnique({
        where: { shop },
      });

      // If not found, try with .myshopify.com suffix
      if (!dbSettings && !shop.includes('.')) {
        const shopWithDomain = `${shop}.myshopify.com`;
        console.log(`[Cart Upsell Config] Trying with domain: "${shopWithDomain}"`);
        dbSettings = await prisma.cartUpsellSettings.findUnique({
          where: { shop: shopWithDomain },
        });
      }

      // If still not found, try without .myshopify.com
      if (!dbSettings && shop.includes('.')) {
        const shopWithoutDomain = shop.replace(/\.myshopify\.com$/, '');
        console.log(`[Cart Upsell Config] Trying without domain: "${shopWithoutDomain}"`);
        dbSettings = await prisma.cartUpsellSettings.findUnique({
          where: { shop: shopWithoutDomain },
        });
      }

      if (dbSettings) {
        config = {
          enabled: dbSettings.enabled,
          heading: dbSettings.heading,
          max_products: dbSettings.maxProducts,
          show_price: dbSettings.showPrice,
          show_compare_at_price: dbSettings.showCompareAtPrice,
          image_size: dbSettings.imageSize,
          button_label: dbSettings.buttonLabel,
        };
        console.log(`[Cart Upsell Config] Successfully loaded config for shop: ${shop}`, config);
      } else {
        console.log(`[Cart Upsell Config] No settings found for shop: ${shop}, using defaults`);
        // Log all existing shops for debugging
        const allSettings = await prisma.cartUpsellSettings.findMany({
          select: { shop: true, enabled: true },
        });
        console.log(`[Cart Upsell Config] Available shops in DB:`, allSettings.map(s => s.shop));
      }
    } catch (dbError) {
      console.error(`[Cart Upsell Config] Error fetching settings for shop: ${shop}`, dbError);
      // Return default config on database error
      config = defaultConfig;
    }

    return json({ config }, {
      headers: {
        "Cache-Control": "public, max-age=60", // Cache for 1 minute
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("Cart upsell config endpoint error:", error);
    return json(
      { 
        error: "Failed to fetch cart upsell config",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers: { ...CORS_HEADERS } }
    );
  }
};












