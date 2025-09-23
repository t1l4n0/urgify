import { type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";
import { pixel1x1GifBuffer } from "../utils/pixel";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = normalizeShop(url.searchParams.get("shop") || "");
  const themeId = url.searchParams.get("theme_id") || null;

  console.log("🔔 Embed activated pixel called:", { shop, themeId, url: request.url });

  // Sofortiges Pixel zurückgeben – nie blockieren:
  queueMicrotask(async () => {
    try {
      console.log("📝 Updating quickstart progress for shop:", shop);
      const result = await prisma.quickstartProgress.upsert({
        where: { shop },
        update: { activateEmbed: "done" },
        create: { shop, activateEmbed: "done" },
      });
      console.log("✅ Quickstart progress updated:", result);
    } catch (e) {
      console.error("❌ embed-activated upsert failed", e);
    }
  });

  return new Response(pixel1x1GifBuffer, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}