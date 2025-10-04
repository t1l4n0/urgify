import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAdminTargetFromHost } from "../lib/adminUtils";

export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect, session } = await authenticate.admin(request);
  const shop = session.shop; // "t1l4n0d3v.myshopify.com"
  const appHandle = "urgify"; // exakt wie im App-Handle!

  const url = new URL(request.url);
  const { mode, base, storeSegment, shopDomain } = getAdminTargetFromHost(url.searchParams.get("host"));

  let plansUrl: string;

  if (mode === "one" && storeSegment) {
    // One Admin MUSS das Segment aus host verwenden:
    plansUrl = `${base}/store/${storeSegment}/charges/${appHandle}/pricing_plans`;
  } else if (mode === "legacy" && shopDomain) {
    plansUrl = `${base}/admin/charges/${appHandle}/pricing_plans`;
  } else {
    // Sicherer Fallback: generische One-Admin-URL ohne Segment führt häufig zum Login,
    // aber besser als ein 404. Optional: Händlerfreundliche Fehlermeldung rendern.
    plansUrl = `https://admin.shopify.com/store/${shop.replace(".myshopify.com","")}/charges/${appHandle}/pricing_plans`;
  }

  // Aus dem iFrame heraus navigieren
  return redirect(plansUrl, { target: "_top" });
}

export default function PricingRedirect() { 
  return null; 
}
