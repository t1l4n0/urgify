import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getOfflineToken, adminCall } from "../utils/webhookHelpers";

/**
 * Metafield definition constant
 */
const UPSELL_METAFIELD = {
  namespace: 'urgify',
  key: 'cart_upsells'
};

const MIN_UPSELL_PRODUCTS = 3;

/**
 * Public storefront endpoint for fetching metafield-based upsell products
 * 
 * Query parameters:
 * - product_ids: Comma-separated list of product IDs from cart
 * - limit: Maximum number of upsell products to return (default: 3, max: 10)
 * - shop: Shop domain (e.g., shop.myshopify.com)
 * 
 * Returns:
 * {
 *   upsellProducts: Array<{
 *     id: number
 *     title: string
 *     handle: string
 *     url: string
 *     featuredImage: string | null
 *     featuredImageAlt: string
 *     price: number
 *     compareAtPrice: number | null
 *     variantId: number | null
 *     available: boolean
 *   }>
 * }
 * 
 * Or fallback format:
 * {
 *   upsellProductIds: number[]
 * }
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const productIdsParam = url.searchParams.get('product_ids');
    const limitParam = url.searchParams.get('limit');
    const shopParam = url.searchParams.get('shop');

    // Validate required parameters
    if (!productIdsParam) {
      return json(
        { error: "product_ids parameter is required" },
        { status: 400 }
      );
    }

    if (!shopParam) {
      return json(
        { error: "shop parameter is required" },
        { status: 400 }
      );
    }

    // Parse and validate product IDs
    const productIds = productIdsParam
      .split(',')
      .map(id => id.trim())
      .filter(id => id && !isNaN(Number(id)))
      .map(id => `gid://shopify/Product/${id}`);

    if (productIds.length === 0) {
      return json({ upsellProductIds: [] });
    }

    // Parse and validate limit
    const limit = Math.min(
      Math.max(1, parseInt(limitParam || '3', 10)),
      10 // Maximum limit for safety
    );

    // Get offline token for admin API access
    let shop = shopParam;
    // Normalize shop domain (remove https:// if present)
    shop = shop.replace(/^https?:\/\//, '').split('/')[0];

    // Validate shop has offline token (adminCall will handle token retrieval)
    try {
      // Test if we can get the token (adminCall will use it internally)
      await getOfflineToken(shop);
    } catch (tokenError) {
      console.error('Failed to get offline token for shop:', shop, tokenError);
      return json(
        { error: "Unable to authenticate with shop" },
        { status: 401 }
      );
    }

    // Fetch metafields for all cart products
    const upsellProductGids = new Set<string>();

    // Process products in batches to avoid query size limits
    const batchSize = 10;
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);

      const query = `#graphql
        query getProductUpsells($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              metafield(namespace: "${UPSELL_METAFIELD.namespace}", key: "${UPSELL_METAFIELD.key}") {
                value
                type
              }
            }
          }
        }
      `;

      try {
        const response = await adminCall(shop, query, { ids: batch });
        const data = response.data;

        if (data?.nodes) {
          data.nodes.forEach((node: any) => {
            if (node?.metafield?.value) {
              try {
                // Metafield value is a JSON string containing list of product references
                const upsellRefs = JSON.parse(node.metafield.value);
                
                // Handle both array and single reference formats
                const refs = Array.isArray(upsellRefs) ? upsellRefs : [upsellRefs];
                
                refs.forEach((ref: any) => {
                  // Extract product GID from reference (format: gid://shopify/Product/1234567890)
                  if (typeof ref === 'string' && ref.startsWith('gid://shopify/Product/')) {
                    upsellProductGids.add(ref);
                  } else if (typeof ref === 'object' && ref.id) {
                    // Handle object format with id property
                    const refId = String(ref.id);
                    if (refId.startsWith('gid://shopify/Product/')) {
                      upsellProductGids.add(refId);
                    }
                  }
                });
              } catch (parseError) {
                console.warn('Failed to parse metafield value for product', node.id, parseError);
              }
            }
          });
        }
      } catch (batchError) {
        console.error('Failed to fetch metafields for batch', batchError);
        // Continue with next batch instead of failing completely
      }
    }

    // Return metafield products (auto-fill to MIN_UPSELL_PRODUCTS happens in frontend)
    let upsellGidsArray = Array.from(upsellProductGids).slice(0, limit);
    
    if (upsellGidsArray.length === 0) {
      return json({ upsellProducts: [] });
    }

    // Fetch product details
    const productQuery = `#graphql
      query getUpsellProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredMedia {
              preview {
                image {
                  url
                  altText
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                  compareAtPrice
                  availableForSale
                }
              }
            }
          }
        }
      }
    `;

    try {
      const productResponse = await adminCall(shop, productQuery, { ids: upsellGidsArray });
      const productData = productResponse.data;

      const upsellProducts = (productData?.nodes || [])
        .filter((node: any) => node !== null)
        .map((node: any) => {
          const variant = node.variants?.edges?.[0]?.node;
          const productId = node.id.replace('gid://shopify/Product/', '');
          const variantId = variant?.id?.replace('gid://shopify/ProductVariant/', '');

          const featuredImage = node.featuredMedia?.preview?.image;
          return {
            id: Number(productId),
            title: node.title || '',
            handle: node.handle || '',
            url: `/products/${node.handle || ''}`,
            featuredImage: featuredImage?.url || null,
            featuredImageAlt: featuredImage?.altText || node.title || '',
            price: variant?.price ? Number(variant.price) : 0,
            compareAtPrice: variant?.compareAtPrice ? Number(variant.compareAtPrice) : null,
            variantId: variantId ? Number(variantId) : null,
            available: variant?.availableForSale || false
          };
        })
        .filter((p: any) => p.available); // Only return available products

      return json({ upsellProducts });
    } catch (productError) {
      console.error('Failed to fetch product details', productError);
      // Fallback: return just IDs if product fetch fails
      const fallbackIds = upsellGidsArray
        .map(gid => gid.replace('gid://shopify/Product/', ''))
        .filter(id => !isNaN(Number(id)))
        .map(id => Number(id));
      return json({ upsellProductIds: fallbackIds });
    }
  } catch (error) {
    console.error("Upsells endpoint error:", error);
    return json(
      { 
        error: "Failed to fetch upsell products",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
};

