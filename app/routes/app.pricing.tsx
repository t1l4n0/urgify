import { useEffect } from "react";
import { useLoaderData } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAdminTargetFromHost } from "../lib/adminUtils";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
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
      if (m2) { 
        return json({ plansUrl: buildPlansUrl(appHandle, shop, m2, b2, s2, d2) });
      }
    }
  }

  const plansUrl = buildPlansUrl(appHandle, shop, mode, base, storeSegment, shopDomain);
  return json({ plansUrl });
}

function buildPlansUrl(
  appHandle: string,
  shop: string,
  mode: "one" | "legacy",
  base: string,
  storeSegment?: string,
  shopDomain?: string
): string {
  if (mode === "one" && storeSegment) {
    return `${base}/store/${storeSegment}/charges/${appHandle}/pricing_plans`;
  } else if (mode === "legacy" && shopDomain) {
    return `${base}/admin/charges/${appHandle}/pricing_plans`;
  } else {
    // letzter Fallback (kann Login auslösen, sollte aber selten greifen)
    const storeHandle = shop.replace(".myshopify.com", "");
    return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
  }
}

export default function PricingRedirect() {
  const { plansUrl } = useLoaderData<typeof loader>();

  useEffect(() => {
    // Add small delay to ensure session is established in iframe
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && window.top && window.top !== window.self) {
        // We're in an iframe, redirect parent window
        window.top.location.href = plansUrl;
      } else if (typeof window !== "undefined") {
        // Not in iframe (shouldn't happen normally)
        window.location.href = plansUrl;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [plansUrl]);

  return <div>Redirecting to pricing...</div>;
}
