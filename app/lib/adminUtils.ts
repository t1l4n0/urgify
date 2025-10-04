/**
 * Decodes the Shopify host parameter to determine the current admin environment
 */
export function decodeHost(hostB64: string | null): string | null {
  if (!hostB64) return null;
  try {
    // host ist Base64, z.B. "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvMTIzNDU2"
    return Buffer.from(hostB64, "base64").toString("utf8"); // z.B. "admin.shopify.com/store/123456"
  } catch {
    return null;
  }
}

/**
 * Extracts the store segment from One Admin host
 */
export function parseOneAdminStoreSegment(decodedHost: string | null): string | null {
  // decodedHost z.B. "admin.shopify.com/store/12345678"
  if (!decodedHost) return null;
  const m = decodedHost.match(/admin\.shopify\.com\/store\/([^/?#]+)/);
  return m?.[1] ?? null; // "12345678"
}

/**
 * Determines the admin target from the host parameter
 */
export function getAdminTargetFromHost(hostB64: string | null): {
  mode: "one" | "legacy";
  base: string;
  storeSegment?: string; // nur bei one
  shopDomain?: string;   // nur bei legacy
} {
  const decoded = decodeHost(hostB64);

  if (decoded?.includes("admin.shopify.com/store/")) {
    const seg = parseOneAdminStoreSegment(decoded);
    return { mode: "one", base: "https://admin.shopify.com", storeSegment: seg ?? undefined };
  }
  if (decoded?.includes(".myshopify.com/admin")) {
    const m = decoded.match(/([a-zA-Z0-9-]+\.myshopify\.com)/);
    const shopDomain = m ? m[1] : undefined;
    return { mode: "legacy", base: shopDomain ? `https://${shopDomain}` : "", shopDomain };
  }
  // Fallback → One Admin (ohne Segment riskant, daher null)
  return { mode: "one", base: "https://admin.shopify.com" };
}
