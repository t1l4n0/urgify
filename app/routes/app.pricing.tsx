import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect, session } = await authenticate.admin(request);
  const shop = session.shop; // z.B. "t1l4n0d3v.myshopify.com"
  const storeHandle = shop.replace(".myshopify.com", "");
  const appHandle = "urgify"; // aus Deiner app.toml übernehmen

  // Aktuelle Admin-Domain aus dem Referer bestimmen
  const referer = request.headers.get("referer") || "";
  let plansUrl: string;

  if (referer.includes("admin.shopify.com")) {
    // Neuer Admin (One Admin)
    plansUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
  } else if (referer.includes(".myshopify.com/admin")) {
    // Legacy Admin-Domain
    plansUrl = `https://${shop}/admin/charges/${appHandle}/pricing_plans`;
  } else {
    // Fallback: nimm One Admin
    plansUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
  }

  // Wichtig: aus dem iframe raus
  return redirect(plansUrl, { target: "_top" });
}

export default function PricingRedirect() { 
  return null; 
}
