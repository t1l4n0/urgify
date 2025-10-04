import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAdminBaseFromHost } from "../lib/adminUtils";

export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect, session } = await authenticate.admin(request);
  const shop = session.shop; // z.B. "t1l4n0d3v.myshopify.com"
  const storeHandle = shop.replace(".myshopify.com", "");
  const appHandle = "urgify";

  const url = new URL(request.url);
  const { isOneAdmin, adminBase } = getAdminBaseFromHost(url.searchParams.get("host"));

  let plansUrl: string;
  if (isOneAdmin) {
    // One Admin
    plansUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
  } else {
    // Legacy Admin
    plansUrl = `https://${shop}/admin/charges/${appHandle}/pricing_plans`;
  }

  // Aus dem iFrame heraus navigieren
  return redirect(plansUrl, { target: "_top" });
}

export default function PricingRedirect() { 
  return null; 
}
