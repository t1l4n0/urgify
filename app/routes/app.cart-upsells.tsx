import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type SerializeFrom,
} from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ensureProductMetafieldDefinitions } from "../utils/metafieldDefinitions";
import { shouldRateLimit, checkShopifyRateLimit } from "../utils/rateLimiting";
import { ViewPlansLink } from "../components/ViewPlansLink";
// Polaris Web Components - no imports needed, components are global
import { useState, useCallback, useEffect, useMemo } from "react";

type Product = {
  id: string;
  title: string;
  handle: string;
  featuredImage?: {
    url: string;
    altText?: string;
  } | null;
  upsellProductIds: string[];
};

type CartUpsellsLoaderData = SerializeFrom<typeof loader>;
type CartUpsellsSuccess = Extract<CartUpsellsLoaderData, { products: unknown }>;

const MIN_UPSELL_PRODUCTS = 3;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Ensure product metafield definitions exist
  await ensureProductMetafieldDefinitions(admin);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const searchQuery = url.searchParams.get("search") || "";
  const perPage = 20;

  try {
    // Check rate limiting
    const rateLimitCheck = await shouldRateLimit(request, 'admin');
    if (rateLimitCheck.limited) {
      return json(
        { error: rateLimitCheck.error },
        { 
          status: 429, 
          headers: { 
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '60' 
          } 
        }
      );
    }

    // Check Shopify GraphQL rate limits
    const shopifyRateLimit = await checkShopifyRateLimit('graphql', session.shop);
    if (!shopifyRateLimit.success) {
      return json(
        { error: shopifyRateLimit.error },
        { 
          status: 429, 
          headers: { 
            'Retry-After': shopifyRateLimit.retryAfter?.toString() || '60' 
          } 
        }
      );
    }

    // Build search query
    const searchFilter = searchQuery
      ? `title:${searchQuery}* OR handle:${searchQuery}*`
      : "";

    // Fetch products with pagination
    const productsQuery = `#graphql
      query getProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            node {
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
              metafield(namespace: "urgify", key: "cart_upsells") {
                value
                type
              }
            }
            cursor
          }
        }
      }
    `;

    const variables: any = {
      first: perPage,
      query: searchFilter || undefined,
    };

    // Handle pagination cursor
    if (page > 1) {
      // For simplicity, we'll fetch all products up to the current page
      // In production, you'd want to store cursors properly
      variables.after = null;
    }

    const response = await admin.graphql(productsQuery, { variables });
    const data = await response.json();

    const products = (data?.data?.products?.edges || []).map((edge: any) => {
      const product = edge.node;
      let upsellProductIds: string[] = [];

      // Parse metafield value (list.product_reference returns JSON array of GIDs)
      if (product.metafield?.value) {
        try {
          const metafieldValue = JSON.parse(product.metafield.value);
          if (Array.isArray(metafieldValue)) {
            upsellProductIds = metafieldValue
              .map((ref: any) => {
                // Extract product ID from GID
                if (typeof ref === 'string' && ref.startsWith('gid://shopify/Product/')) {
                  return ref.replace('gid://shopify/Product/', '');
                } else if (typeof ref === 'object' && ref.id) {
                  const refId = String(ref.id);
                  if (refId.startsWith('gid://shopify/Product/')) {
                    return refId.replace('gid://shopify/Product/', '');
                  }
                }
                return null;
              })
              .filter((id: string | null): id is string => id !== null);
          }
        } catch (error) {
          console.warn('Failed to parse cart_upsells metafield for product', product.id, error);
        }
      }

      return {
        id: product.id.replace('gid://shopify/Product/', ''),
        title: product.title || '',
        handle: product.handle || '',
        featuredImage: product.featuredMedia?.preview?.image || null,
        upsellProductIds,
      };
    });

    return json({
      products,
      pageInfo: data?.data?.products?.pageInfo || {},
      currentPage: page,
      searchQuery,
      perPage,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error loading cart upsells:", error);
    return json(
      { error: "Failed to load products. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Check rate limiting
    const rateLimitCheck = await shouldRateLimit(request, 'admin');
    if (rateLimitCheck.limited) {
      return json(
        { error: rateLimitCheck.error },
        { 
          status: 429, 
          headers: { 
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '60' 
          } 
        }
      );
    }

    // Check Shopify GraphQL rate limits
    const shopifyRateLimit = await checkShopifyRateLimit('graphql', session.shop);
    if (!shopifyRateLimit.success) {
      return json(
        { error: shopifyRateLimit.error },
        { 
          status: 429, 
          headers: { 
            'Retry-After': shopifyRateLimit.retryAfter?.toString() || '60' 
          } 
        }
      );
    }

    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "update") {
      const productId = formData.get("productId");
      const upsellProductIds = formData.get("upsellProductIds");

      if (!productId) {
        return json({ error: "Product ID is required" }, { status: 400 });
      }

      // Parse upsell product IDs
      let upsellGids: string[] = [];
      if (upsellProductIds) {
        const ids = String(upsellProductIds).split(',').filter(id => id.trim());
        upsellGids = ids.map(id => `gid://shopify/Product/${id.trim()}`);
      }

      // Note: Auto-fill to MIN_UPSELL_PRODUCTS happens in frontend JavaScript
      // Backend just saves what the user selected

      // Update metafield
      const updateMutation = `#graphql
        mutation updateProductMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const metafieldValue = JSON.stringify(upsellGids);

      const updateResponse = await admin.graphql(updateMutation, {
        variables: {
          metafields: [
            {
              ownerId: `gid://shopify/Product/${productId}`,
              namespace: "urgify",
              key: "cart_upsells",
              type: "list.product_reference",
              value: metafieldValue,
            },
          ],
        },
      });

      const updateData = await updateResponse.json();
      const userErrors = updateData?.data?.metafieldsSet?.userErrors || [];

      if (userErrors.length > 0) {
        return json(
          { error: userErrors.map((e: any) => e.message).join(", ") },
          { status: 400 }
        );
      }

      return json({ success: true, message: "Upsell products updated successfully" });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in cart upsells action:", error);
    return json(
      { error: "Failed to update upsell products. Please try again." },
      { status: 500 }
    );
  }
};

export default function CartUpsells() {
  const loaderData = useLoaderData<CartUpsellsLoaderData>();

  if ("error" in loaderData) {
    return (
      <s-page heading="Cart Upsells">
        <s-section>
          <s-banner tone="critical" heading="Error">
            <s-paragraph>{loaderData.error}</s-paragraph>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  return <CartUpsellsForm data={loaderData} />;
}

function CartUpsellsForm({ data }: { data: CartUpsellsSuccess }) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const { products, currentPage, searchQuery } = data;

  const [searchTerm, setSearchTerm] = useState(searchQuery || "");
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string[]>>({});
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Initialize selected products from loader data
  useEffect(() => {
    const initial: Record<string, string[]> = {};
    products.forEach((product) => {
      initial[product.id] = product.upsellProductIds;
    });
    setSelectedProducts(initial);
  }, [products]);

  // Fetch all products for the product selector
  useEffect(() => {
    const fetchAllProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const response = await fetch(`/apps/urgify/upsells?shop=${window.location.search.match(/shop=([^&]+)/)?.[1] || ''}&product_ids=`);
        // For now, we'll use a simpler approach - fetch products via GraphQL in the loader
        // This is a placeholder - in production, you'd want a dedicated endpoint
        setIsLoadingProducts(false);
      } catch (error) {
        console.error('Failed to fetch products:', error);
        setIsLoadingProducts(false);
      }
    };
    // Don't fetch on initial load - we'll use a different approach
  }, []);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (searchTerm) {
      params.set("search", searchTerm);
    }
    params.set("page", "1");
    window.location.search = params.toString();
  }, [searchTerm]);

  const handleUpsellChange = useCallback((productId: string, upsellProductIds: string[]) => {
    setSelectedProducts((prev) => ({
      ...prev,
      [productId]: upsellProductIds,
    }));
  }, []);

  const handleSave = useCallback(async (productId: string) => {
    const upsellIds = selectedProducts[productId] || [];
    const formData = new FormData();
    formData.append("action", "update");
    formData.append("productId", productId);
    formData.append("upsellProductIds", upsellIds.join(","));

    fetcher.submit(formData, { method: "post" });
  }, [selectedProducts, fetcher]);

  const handleSaveAll = useCallback(async () => {
    for (const productId of Object.keys(selectedProducts)) {
      await handleSave(productId);
    }
    setTimeout(() => {
      revalidator.revalidate();
    }, 1000);
  }, [selectedProducts, handleSave, revalidator]);

  return (
    <s-page heading="Cart Upsells">
      <s-section>
        <s-stack gap="base">
          <s-paragraph>
            Configure upsell products for each product. When a customer adds a product to their cart,
            up to 3 recommended upsell products will be displayed in the cart drawer.
            If you select fewer than 3 products, the system will automatically fill the remaining
            slots with Shopify product recommendations.
          </s-paragraph>

          <s-stack gap="tight" direction="row">
            <s-textfield
              label="Search products"
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
            />
            <s-button variant="primary" onClick={handleSearch}>
              Search
            </s-button>
          </s-stack>

          {fetcher.data?.success && (
            <s-banner tone="success" heading="Success">
              <s-paragraph>{fetcher.data.message}</s-paragraph>
            </s-banner>
          )}

          {fetcher.data?.error && (
            <s-banner tone="critical" heading="Error">
              <s-paragraph>{fetcher.data.error}</s-paragraph>
            </s-banner>
          )}

          <s-stack gap="base">
            {products.map((product) => (
              <ProductUpsellEditor
                key={product.id}
                product={product}
                selectedUpsellIds={selectedProducts[product.id] || []}
                onUpsellChange={(ids) => handleUpsellChange(product.id, ids)}
                onSave={() => handleSave(product.id)}
                isSaving={fetcher.state === "submitting"}
              />
            ))}
          </s-stack>

          {products.length === 0 && (
            <s-banner tone="info" heading="No products found">
              <s-paragraph>
                {searchQuery
                  ? `No products found matching "${searchQuery}". Try a different search term.`
                  : "No products found."}
              </s-paragraph>
            </s-banner>
          )}

          <s-stack gap="tight" direction="row">
            {currentPage > 1 && (
              <s-button
                variant="secondary"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.set("page", String(currentPage - 1));
                  window.location.search = params.toString();
                }}
              >
                Previous
              </s-button>
            )}
            {data.pageInfo.hasNextPage && (
              <s-button
                variant="secondary"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.set("page", String(currentPage + 1));
                  window.location.search = params.toString();
                }}
              >
                Next
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function ProductUpsellEditor({
  product,
  selectedUpsellIds,
  onUpsellChange,
  onSave,
  isSaving,
}: {
  product: Product;
  selectedUpsellIds: string[];
  onUpsellChange: (ids: string[]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Fetch available products for selection
  const fetchProducts = useCallback(async (search: string = "") => {
    setIsLoadingProducts(true);
    try {
      // In a real implementation, you'd have an endpoint to fetch products
      // For now, we'll use a simple approach - this would need a dedicated API endpoint
      // Placeholder: products would be fetched via GraphQL
      setIsLoadingProducts(false);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      setIsLoadingProducts(false);
    }
  }, []);

  const handleProductSearch = useCallback((term: string) => {
    setProductSearchTerm(term);
    if (term.length >= 2) {
      fetchProducts(term);
    }
  }, [fetchProducts]);

  const handleAddUpsell = useCallback((productId: string) => {
    if (!selectedUpsellIds.includes(productId) && selectedUpsellIds.length < 10) {
      onUpsellChange([...selectedUpsellIds, productId]);
    }
  }, [selectedUpsellIds, onUpsellChange]);

  const handleRemoveUpsell = useCallback((productId: string) => {
    onUpsellChange(selectedUpsellIds.filter(id => id !== productId));
  }, [selectedUpsellIds, onUpsellChange]);

  const needsAutoFill = selectedUpsellIds.length < MIN_UPSELL_PRODUCTS;

  return (
    <s-card>
      <s-stack gap="base">
        <s-stack gap="tight" direction="row" alignment="space-between">
          <s-stack gap="tight">
            <s-heading level={3}>{product.title}</s-heading>
            <s-paragraph tone="subdued">
              {product.handle} • {selectedUpsellIds.length} upsell product{selectedUpsellIds.length !== 1 ? 's' : ''} selected
            </s-paragraph>
            {needsAutoFill && (
              <s-banner tone="info" heading="Auto-fill enabled">
                <s-paragraph>
                  You have selected {selectedUpsellIds.length} product{selectedUpsellIds.length !== 1 ? 's' : ''}. 
                  The system will automatically add {MIN_UPSELL_PRODUCTS - selectedUpsellIds.length} more 
                  product{MIN_UPSELL_PRODUCTS - selectedUpsellIds.length !== 1 ? 's' : ''} from Shopify recommendations 
                  when saving.
                </s-paragraph>
              </s-banner>
            )}
          </s-stack>
          <s-button
            variant="secondary"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "Collapse" : "Edit"}
          </s-button>
        </s-stack>

        {isExpanded && (
          <s-stack gap="base">
            <s-textfield
              label="Search products to add as upsells"
              value={productSearchTerm}
              onChange={(e: any) => handleProductSearch(e.target.value)}
              placeholder="Type to search products..."
            />

            {selectedUpsellIds.length > 0 && (
              <s-stack gap="tight">
                <s-heading level={4}>Selected Upsell Products</s-heading>
                <s-stack gap="tight">
                  {selectedUpsellIds.map((upsellId) => (
                    <s-chip
                      key={upsellId}
                      onRemove={() => handleRemoveUpsell(upsellId)}
                    >
                      Product ID: {upsellId}
                    </s-chip>
                  ))}
                </s-stack>
              </s-stack>
            )}

            <s-button
              variant="primary"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Upsell Products"}
            </s-button>
          </s-stack>
        )}
      </s-stack>
    </s-card>
  );
}



