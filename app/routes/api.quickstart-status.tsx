import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shop = normalizeShop(url.searchParams.get("shop") || "");
    const row = await prisma.quickstartProgress.findUnique({ where: { shop } });

    // Niemals 500 an die UI durchlassen – lieber definierte Defaults:
    return json(
      {
        embedActive: row?.activateEmbed === "done",
        themeId: null, // Not stored in new model
        lastActivated: row?.updatedAt ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("quickstart-status error", e);
    return json(
      { embedActive: false, themeId: null, lastActivated: null, reason: "server_error" },
      { status: 200, headers: { "Cache-Control": "no-store" } } // bewusst 200
    );
  }
}
