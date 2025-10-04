import { json } from "@remix-run/node";
import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Extract shop name from session (remove .myshopify.com)
  const shopName = session.shop.replace('.myshopify.com', '');
  
  // Return the URL for client-side redirect to avoid X-Frame-Options issues
  const pricingPlansUrl = `https://admin.shopify.com/store/${shopName}/apps/urgify/pricing_plans`;
  
  return json({ redirectUrl: pricingPlansUrl });
};

export default function PricingPlansRedirect() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          // Redirect to Shopify Admin Pricing Plans page
          // This avoids X-Frame-Options issues by opening in the same window
          window.location.href = window.location.search.includes('redirectUrl=') 
            ? decodeURIComponent(new URLSearchParams(window.location.search).get('redirectUrl'))
            : '${typeof window !== 'undefined' ? window.location.origin : ''}/api/pricing-redirect';
        `,
      }}
    />
  );
}
