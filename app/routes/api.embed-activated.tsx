import { type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";
import { pixel1x1GifBuffer } from "../utils/pixel";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = normalizeShop(url.searchParams.get("shop") || "");
  const themeId = url.searchParams.get("theme_id") || null;

  // Sofortiges Pixel zurückgeben – nie blockieren:
  queueMicrotask(async () => {
    try {
      await prisma.quickstartProgress.upsert({
        where: { shop },
        update: { activateEmbed: "done" },
        create: { shop, activateEmbed: "done" },
      });
    } catch (e) {
      console.error("embed-activated upsert failed", e);
    }
  });

  return new Response(pixel1x1GifBuffer, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}