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
 * Determines the admin base URL from the decoded host parameter
 */
export function getAdminBaseFromHost(hostB64: string | null): {
  isOneAdmin: boolean;
  isLegacyAdmin: boolean;
  adminBase: string;
} {
  const decodedHost = decodeHost(hostB64);
  
  if (decodedHost?.includes("admin.shopify.com/store/")) {
    return {
      isOneAdmin: true,
      isLegacyAdmin: false,
      adminBase: "https://admin.shopify.com"
    };
  } else if (decodedHost?.includes(".myshopify.com/admin")) {
    // Extract shop domain from decoded host
    const shopMatch = decodedHost.match(/([a-zA-Z0-9-]+\.myshopify\.com)/);
    const shopDomain = shopMatch ? shopMatch[1] : "";
    return {
      isOneAdmin: false,
      isLegacyAdmin: true,
      adminBase: `https://${shopDomain}`
    };
  } else {
    // Fallback to One Admin
    return {
      isOneAdmin: true,
      isLegacyAdmin: false,
      adminBase: "https://admin.shopify.com"
    };
  }
}
