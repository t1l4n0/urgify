import { useLocation } from "@remix-run/react";
import { Button } from "@shopify/polaris";

function b64UrlDecode(input: string) {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  return atob(s + "=".repeat(pad));
}

function buildPlansHref(search: string, appHandle = "urgify") {
  const params = new URLSearchParams(search);
  const host = params.get("host");
  const shop = params.get("shop")!; // z.B. t1l4n0d3v.myshopify.com
  if (!host || !shop) return "#";

  const decoded = b64UrlDecode(host);
  // One Admin?
  const mOne = decoded.match(/admin\.shopify\.com\/store\/([^/?#]+)/);
  if (mOne) {
    const storeSegment = mOne[1]; // z.B. "12345678"
    return `https://admin.shopify.com/store/${storeSegment}/charges/${appHandle}/pricing_plans`;
  }

  // Legacy Admin?
  const mLegacy = decoded.match(/([a-zA-Z0-9-]+\.myshopify\.com)\/admin/);
  if (mLegacy) {
    const shopDomain = mLegacy[1];
    return `https://${shopDomain}/admin/charges/${appHandle}/pricing_plans`;
  }

  // Fallback → One Admin (sollte selten greifen)
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

export function ViewPlansLink({ children = "💰 View Plans" }: { children?: React.ReactNode }) {
  const { search } = useLocation();
  const href = buildPlansHref(search, "urgify");

  return (
    <Button url={href} external>
      {children}
    </Button>
  );
}
