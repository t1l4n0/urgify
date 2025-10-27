import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAdminTargetFromHost } from "../lib/adminUtils";

export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect, session } = await authenticate.admin(request);
  const shop = session.shop; // z.B. t1l4n0d3v.myshopify.com
  const appHandle = "urgify";

  const url = new URL(request.url);
  const hostB64 = url.searchParams.get("host");

  // 1) Primär über host (zuverlässig)
  const { mode, base, storeSegment, shopDomain } = getAdminTargetFromHost(hostB64);

  // 2) Extra Guard: Wenn host fehlt, versuche Referer zu dekodieren
  // (manchmal hängt Shopify denselben host auch im Referer an)
  if (!hostB64) {
    const ref = request.headers.get("referer") || "";
    const fromRef = ref.includes("host=") ? new URL(ref).searchParams.get("host") : null;
    if (fromRef) {
      const { mode: m2, base: b2, storeSegment: s2, shopDomain: d2 } = getAdminTargetFromHost(fromRef);
      if (m2) { return _redir(redirect, appHandle, shop, m2, b2, s2, d2); }
    }
  }

  return _redir(redirect, appHandle, shop, mode, base, storeSegment, shopDomain);
}

function _redir(
  redirectFn: any,
  appHandle: string,
  shop: string,
  mode: "one" | "legacy",
  base: string,
  storeSegment?: string,
  shopDomain?: string
) {
  let plansUrl: string;

  if (mode === "one" && storeSegment) {
    plansUrl = `${base}/store/${storeSegment}/charges/${appHandle}/pricing_plans`;
  } else if (mode === "legacy" && shopDomain) {
    plansUrl = `${base}/admin/charges/${appHandle}/pricing_plans`;
  } else {
    // letzter Fallback (kann Login auslösen, sollte aber selten greifen)
    const storeHandle = shop.replace(".myshopify.com", "");
    plansUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
  }

  return redirectFn(plansUrl, { target: "_top" });
}

export default function PricingRedirect() { 
  // This component is only shown briefly before redirect
  // The actual pricing page is handled by Shopify's billing system
  return null; 
}
