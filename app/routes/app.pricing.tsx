import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const appHandle = "urgify"; // aus shopify.app.toml übernehmen
  const { redirect, session } = await authenticate.admin(request);

  const shop = session.shop;                    // z.B. "t1l4n0d3v.myshopify.com"
  const storeHandle = shop.replace(".myshopify.com", "");

  // Offizieller Managed-Pricing-Pfad:
  const plansUrl =
    `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;

  // Wichtig: target "_top", da außerhalb des Embeds
  return redirect(plansUrl, { target: "_top" });
}

export default function PricingRedirect() { 
  return null; 
}
