import { redirect } from "@remix-run/node";
import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Extract shop name from session (remove .myshopify.com)
  const shopName = session.shop.replace('.myshopify.com', '');
  
  // Use the shop's admin URL with proper authentication
  // This ensures the user stays logged in
  const pricingPlansUrl = `https://${session.shop}/admin/apps/urgify/pricing_plans`;
  
  return redirect(pricingPlansUrl);
};
