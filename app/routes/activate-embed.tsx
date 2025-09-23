import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const APP_API_KEY = "4e7fa9d45ac70f745a7ff4d762f9a6ca";
const EMBED_HANDLE = "app-embed";

// GraphQL Query to get shop domain
const GET_SHOP_DOMAIN_QUERY = `
  query getShopDomain {
    shop {
      myshopifyDomain
    }
  }
`;

function asMyshopifyHost(input: string) {
  let s = (input || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const m = s.match(/([a-z0-9-]+)\.myshopify\.com/i) || s.match(/store\/([a-z0-9-]+)/i);
  const handle = m ? m[1] : s.replace(/\..*$/, "");
  return `${handle.toLowerCase()}.myshopify.com`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const u = new URL(request.url);
  const shopParam = u.searchParams.get("shop");

  if (!shopParam) {
    return redirect("/auth?reason=missing_shop");
  }

  const shop = asMyshopifyHost(shopParam);
  console.log("🔗 Generating deep link for shop:", shop);

  try {
    // Get shop domain via GraphQL API
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(GET_SHOP_DOMAIN_QUERY);
    const data = await response.json();
    
    const myshopifyDomain = data.data?.shop?.myshopifyDomain;
    console.log("🏪 Shop domain from API:", myshopifyDomain);
    
    if (!myshopifyDomain) {
      console.warn("❌ Could not get shop domain from API, using fallback");
      // Fallback to the shop parameter
      const fallbackDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
      return generateDeepLink(fallbackDomain);
    }
    
    return generateDeepLink(myshopifyDomain);
    
  } catch (error) {
    console.error("❌ Error getting shop domain:", error);
    // Fallback to the shop parameter
    const fallbackDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    return generateDeepLink(fallbackDomain);
  }
}

function generateDeepLink(myshopifyDomain: string) {
  const deepLinkValue = `${APP_API_KEY}/${EMBED_HANDLE}`;
  const q = encodeURIComponent(deepLinkValue);
  
  // Correct deep link structure for app embed activation
  const url = `https://${myshopifyDomain}/admin/themes/current/editor?context=apps&activateAppId=${q}`;
  
  console.log("🔗 Generated deep link:", url);
  console.log("🔗 Deep link value:", deepLinkValue);
  console.log("🔗 App API Key:", APP_API_KEY);
  console.log("🔗 Embed Handle:", EMBED_HANDLE);
  
  return redirect(url, { headers: { "Cache-Control": "no-store" } });
}