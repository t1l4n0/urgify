import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shop = normalizeShop(url.searchParams.get("shop") || "");
    
    if (!shop) {
      if (process.env.NODE_ENV === 'development') {
        console.warn("❌ No shop parameter provided");
      }
      return json(
        { embedActive: false, themeId: null, lastActivated: null, reason: "missing_shop" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log("🔍 Quickstart status check for shop:", shop);
    }

    // NUR DB-Lookup, kein Shopify-Fallback mehr
    const quickstart = await prisma.quickstart.findUnique({ 
      where: { shop },
      select: {
        embedActive: true,
        lastActivated: true,
        updatedAt: true
      }
    });

    if (process.env.NODE_ENV === 'development') {
      console.log("✅ Database lookup result:", quickstart);
    }

    return json(
      {
        embedActive: quickstart?.embedActive ?? false,
        themeId: null,
        lastActivated: quickstart?.lastActivated ?? null,
        source: "database"
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error("❌ quickstart-status error", e);
    }
    return json(
      { embedActive: false, themeId: null, lastActivated: null, reason: "server_error" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}