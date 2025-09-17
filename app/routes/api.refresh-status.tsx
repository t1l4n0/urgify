import { json, type ActionFunctionArgs } from "@remix-run/node";
import shopify from "../shopify.server";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";

const API_KEY = "4e7fa9d45ac70f745a7ff4d762f9a6ca";
const EMBED_HANDLE = "app-embed";

function parseSettingsForEmbed(jsonStr: string) {
  // robust für Presets und unterschiedliche Schlüssel
  const data = JSON.parse(jsonStr);
  const current = typeof data.current === "string"
    ? (data.presets?.[data.current] ?? data[data.current] ?? data)
    : (data.current ?? data);

  const maps =
    current?.enabled_app_embeds ||
    current?.app_embeds ||
    current?.appEmbeds ||
    current?.settings?.enabled_app_embeds ||
    current?.theme_settings?.enabled_app_embeds ||
    {};

  const keyA = `${API_KEY}/${EMBED_HANDLE}`;
  const keyB = `${API_KEY}__${EMBED_HANDLE}`;

  if (Array.isArray(maps)) return maps.includes(keyA) || maps.includes(keyB);
  if (typeof maps === "object") return maps[keyA] === true || maps[keyB] === true;

  // Fallback: Stringsuche
  const hay = JSON.stringify(current);
  return hay.includes(keyA) || hay.includes(keyB);
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { shop: raw } = await request.json();
    const shop = normalizeShop(raw);
    const offlineId = `offline_${shop}`;
    const offline = await shopify.sessionStorage.loadSession(offlineId);
    if (!offline) return json({ ok: false, reason: "no_offline_token" }, { status: 200 });

    // 1) aktive Theme-ID
    const themes = await fetch(`https://${shop}/admin/api/2024-10/themes.json?role=main`, {
      headers: { "X-Shopify-Access-Token": offline.accessToken!, "Content-Type": "application/json" },
    }).then(r => r.json());
    const mainId = themes?.themes?.[0]?.id;
    if (!mainId) return json({ ok: false, reason: "no_main_theme" }, { status: 200 });

    // 2) settings_data.json lesen
    const asset = await fetch(
      `https://${shop}/admin/api/2024-10/themes/${mainId}/assets.json?asset[key]=config/settings_data.json`,
      { headers: { "X-Shopify-Access-Token": offline.accessToken! } }
    ).then(r => r.json());

    const ok = parseSettingsForEmbed(asset?.asset?.value || "{}");

    // 3) DB auffrischen
    await prisma.quickstartProgress.upsert({
      where: { shop },
      update: { activateEmbed: ok ? "done" : "todo" },
      create: { shop, activateEmbed: ok ? "done" : "todo" },
    });

    return json({ ok, themeId: String(mainId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("refresh-status error", e);
    return json({ ok: false, reason: "server_error" }, { status: 200 });
  }
}