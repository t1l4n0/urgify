import { json, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { shop: raw, step, to } = await request.json();
    const shop = normalizeShop(raw);

    if (step === "activateEmbed" && (to === "clicked" || to === "done")) {
      await prisma.quickstartProgress.upsert({
        where: { shop },
        update: { activateEmbed: to },
        create: { shop, activateEmbed: to },
      });
    }

    return json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("quickstart-step error", e);
    return json(
      { success: false, error: "server_error" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
