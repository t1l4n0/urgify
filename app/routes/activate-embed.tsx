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

async function getOfflineToken(shop: string) {
  const id = `offline_${shop}`;
  const sess = await shopify.sessionStorage.loadSession(id);
  return sess?.accessToken ?? null;
}

async function getMainThemeId(shop: string, token: string): Promise<number> {
  const r = await fetch(`https://${shop}/admin/api/2025-01/themes.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!r.ok) throw new Error(`themes.json ${r.status}`);
  const { themes } = await r.json();
  const main = themes.find((t: any) => t.role === "main");
  if (!main) throw new Error("No main theme");
  return main.id as number;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const u = new URL(request.url);
  const shopParam = u.searchParams.get("shop");
  if (!shopParam) return redirect("/auth?reason=missing_shop");

  const shop = asMyshopifyHost(shopParam);

  // 1) OFFLINE-Token laden (ohne Auth-Redirects)
  const token = await getOfflineToken(shop);
  if (!token) {
    // Shop hat (noch) keinen Offline-Token gespeichert -> sauber re-autorisieren
    return redirect(`/auth?shop=${shop}&reason=no_offline_token`);
  }

  // 2) Aktive Theme-ID ermitteln und **darauf** verlinken
  const mainId = await getMainThemeId(shop, token);
  const url =
    `https://${shop}/admin/themes/${mainId}/editor` +
    `?context=apps` +
    `&activateAppId=${APP_API_KEY}/${EMBED_HANDLE}` +
    `&appEmbed=${APP_API_KEY}/${EMBED_HANDLE}`;

  return redirect(url, { headers: { "Cache-Control": "no-store" } });
}

