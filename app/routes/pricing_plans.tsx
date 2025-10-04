import { redirect } from "@remix-run/node";
import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Get shop and host from URL parameters to maintain session
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop') || session.shop;
  const host = url.searchParams.get('host');
  
  // Extract store slug from shop name
  const storeSlug = shop.replace('.myshopify.com', '');
  
  // Use relative path to stay on admin.shopify.com and preserve session
  const pricingPlansPath = `/store/${storeSlug}/apps/urgify/pricing_plans?shop=${shop}${host ? `&host=${host}` : ''}`;
  
  return redirect(pricingPlansPath);
};
