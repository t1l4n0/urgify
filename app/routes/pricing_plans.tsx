import { redirect } from "@remix-run/node";
import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Extract shop name from session (remove .myshopify.com)
  const shopName = session.shop.replace('.myshopify.com', '');
  
  // Redirect to Shopify Admin Pricing Plans page for this app
  const pricingPlansUrl = `https://admin.shopify.com/store/${shopName}/apps/urgify/pricing_plans`;
  
  return redirect(pricingPlansUrl);
};
