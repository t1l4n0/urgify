import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shop = normalizeShop(url.searchParams.get("shop") || "");
    
    const progress = await prisma.quickstartProgress.findUnique({
      where: { shop },
    });

    return json(
      {
        activateEmbed: progress?.activateEmbed || "todo",
        dismissedAt: progress?.dismissedAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("quickstart error", e);
    return json(
      { activateEmbed: "todo", dismissedAt: null },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
