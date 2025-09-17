import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import shopify from "../shopify.server";

const APP_API_KEY = "4e7fa9d45ac70f745a7ff4d762f9a6ca";
const EMBED_HANDLE = "app-embed";

function asMyshopifyHost(input: string) {
  let s = (input || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const m = s.match(/([a-z0-9-]+)\.myshopify\.com/i) || s.match(/store\/([a-z0-9-]+)/i);
  const handle = m ? m[1] : s.replace(/\..*$/, "");
  return `${handle.toLowerCase()}.myshopify.com`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const u = new URL(request.url);
  const shopParam = u.searchParams.get("shop");
  // optional: erlaubtes manuelles Übersteuern – gut fürs Debuggen:
  const forceThemeId = u.searchParams.get("theme_id");

  if (!shopParam) {
    return redirect("/auth?reason=missing_shop");
  }

  const shop = asMyshopifyHost(shopParam);
  const deepLinkValue = `${APP_API_KEY}/${EMBED_HANDLE}`;
  const q = encodeURIComponent(deepLinkValue);

  // 1) wenn theme_id mitgegeben wurde → direkt benutzen (kein API-Call)
  if (forceThemeId) {
    const url = `https://${shop}/admin/themes/${forceThemeId}/editor?context=apps&activateAppId=${q}&appEmbed=${q}`;
    return redirect(url, { headers: { "Cache-Control": "no-store" } });
  }

  // 2) versuche die aktive Theme-ID via Admin API zu ermitteln
  let mainId: string | null = null;
  try {
    const offlineId = `offline_${shop}`;
    const offline = await shopify.sessionStorage.loadSession(offlineId);

    if (offline?.accessToken) {
      const res = await fetch(`https://${shop}/admin/api/2024-10/themes.json?role=main`, {
        headers: {
          "X-Shopify-Access-Token": offline.accessToken,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const id = data?.themes?.[0]?.id;
        if (id) mainId = String(id);
      }
    }
  } catch {
    // absichtlich schlucken → wir fallen kontrolliert auf "current" zurück
  }

  // 3) baue die Editor-URL – bevorzugt mit expliziter ID, sonst "current"
  const base =
    mainId
      ? `https://${shop}/admin/themes/${mainId}/editor`
      : `https://${shop}/admin/themes/current/editor`;

  const url = `${base}?context=apps&activateAppId=${q}&appEmbed=${q}`;

  return redirect(url, { headers: { "Cache-Control": "no-store" } });
}