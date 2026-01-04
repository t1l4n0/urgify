import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type SerializeFrom,
} from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ensureProductMetafieldDefinitions } from "../utils/metafieldDefinitions";
// Polaris Web Components - no imports needed, components are global
import { useState, useCallback, useEffect } from "react";

type ProductBadgesLoaderData = SerializeFrom<typeof loader>;
type ProductBadgesSuccess = Extract<ProductBadgesLoaderData, { products: unknown }>;

type Product = {
  id: string;
  title: string;
  handle: string;
  featuredImage?: {
    url: string;
    altText?: string;
  } | null;
  badge?: {
    text: string;
    backgroundColor: string;
    textColor: string;
    position: string;
  } | null;
};

type ActionData = 
  | { success: true; message: string; productId?: string }
  | { error: string }
  | undefined;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  // Ensure product metafield definitions exist
  await ensureProductMetafieldDefinitions(admin);

  try {
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("search") || "";
    const after = url.searchParams.get("after") || null;

    // Fetch products with pagination
    const productsQuery = `#graphql
      query getProducts($first: Int!, $query: String, $after: String) {
        products(first: $first, query: $query, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
                altText
              }
              metafield(namespace: "urgify", key: "product_badge") {
                value
                type
              }
            }
          }
        }
      }
    `;

    const variables: any = {
      first: 20,
    };

    if (searchQuery) {
      variables.query = `title:*${searchQuery}* OR handle:*${searchQuery}*`;
    }

    if (after) {
      variables.after = after;
    }

    const productsResponse = await admin.graphql(productsQuery, { variables });
    const productsData = await productsResponse.json();

    const products: Product[] = (productsData.data?.products?.edges || []).map((edge: any) => {
      const product = edge.node;
      let badge = null;

      if (product.metafield?.value) {
        try {
          badge = JSON.parse(product.metafield.value);
        } catch (error) {
          console.error("Error parsing badge metafield:", error);
        }
      }

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        featuredImage: product.featuredImage,
        badge,
      };
    });

    return json({
      products,
      pageInfo: productsData.data?.products?.pageInfo || {
        hasNextPage: false,
        endCursor: null,
      },
      searchQuery,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error loading products:", error);
    return json(
      { error: "Failed to load products. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "update") {
      const productId = formData.get("productId") as string;
      const badgeText = formData.get("badgeText") as string;
      const backgroundColor = formData.get("backgroundColor") as string;
      const textColor = formData.get("textColor") as string;
      const position = formData.get("position") as string;

      if (!productId) {
        return json({ error: "Product ID is required" }, { status: 400 });
      }

      // Build badge object
      let badgeValue: string | null = null;
      
      if (badgeText && badgeText.trim()) {
        const badge = {
          text: badgeText.trim(),
          backgroundColor: backgroundColor || "#e74c3c",
          textColor: textColor || "#ffffff",
          position: position || "top-left",
        };
        badgeValue = JSON.stringify(badge);
      }

      // Update metafield
      const updateMutation = `#graphql
        mutation updateProductBadge($metafields: [MetafieldsSetInput!]!) {
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

      const metafieldsInput: any[] = [{
        ownerId: productId,
        namespace: "urgify",
        key: "product_badge",
        type: "json",
      }];

      if (badgeValue) {
        metafieldsInput[0].value = badgeValue;
      } else {
        // To delete, we need to set value to null
        metafieldsInput[0].value = null;
      }

      const updateResponse = await admin.graphql(updateMutation, {
        variables: {
          metafields: metafieldsInput,
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

      return json({ 
        success: true, 
        message: "Badge updated successfully",
        productId,
      });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in product badges action:", error);
    return json(
      { error: "Failed to update badge. Please try again." },
      { status: 500 }
    );
  }
};

export default function ProductBadges() {
  const loaderData = useLoaderData<typeof loader>();

  if ("error" in loaderData) {
    return (
      <s-page heading="Product Badges">
        <s-section>
          <s-banner tone="critical" heading="Error">
            <s-paragraph>{loaderData.error}</s-paragraph>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  if ("products" in loaderData) {
    return <ProductBadgesForm data={loaderData as ProductBadgesSuccess} />;
  }

  return (
    <s-page heading="Product Badges">
      <s-section>
        <s-banner tone="critical" heading="Error">
          <s-paragraph>Failed to load products</s-paragraph>
        </s-banner>
      </s-section>
    </s-page>
  );
}

function ProductBadgesForm({ data }: { data: ProductBadgesSuccess }) {
  const fetcher = useFetcher<ActionData>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { products, pageInfo, searchQuery: initialSearchQuery } = data;

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || "");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [badgeText, setBadgeText] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#e74c3c");
  const [textColor, setTextColor] = useState("#ffffff");
  const [position, setPosition] = useState("top-left");

  // Reset form when save succeeds
  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      setTimeout(() => {
        revalidator.revalidate();
        setEditingProductId(null);
        setBadgeText("");
        setBackgroundColor("#e74c3c");
        setTextColor("#ffffff");
        setPosition("top-left");
      }, 500);
    }
  }, [fetcher.data, revalidator]);

  const handleEdit = useCallback((product: Product) => {
    setEditingProductId(product.id);
    if (product.badge) {
      setBadgeText(product.badge.text || "");
      setBackgroundColor(product.badge.backgroundColor || "#e74c3c");
      setTextColor(product.badge.textColor || "#ffffff");
      setPosition(product.badge.position || "top-left");
    } else {
      setBadgeText("");
      setBackgroundColor("#e74c3c");
      setTextColor("#ffffff");
      setPosition("top-left");
    }
  }, []);

  const handleSave = useCallback((productId: string) => {
    const formData = new FormData();
    formData.append("action", "update");
    formData.append("productId", productId);
    formData.append("badgeText", badgeText);
    formData.append("backgroundColor", backgroundColor);
    formData.append("textColor", textColor);
    formData.append("position", position);

    fetcher.submit(formData, { method: "post" });
  }, [badgeText, backgroundColor, textColor, position, fetcher]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (searchQuery) {
      params.set("search", searchQuery);
    }
    navigate(`/app/product-badges?${params.toString()}`);
  }, [searchQuery, navigate]);

  const handleLoadMore = useCallback(() => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      const params = new URLSearchParams();
      if (initialSearchQuery) {
        params.set("search", initialSearchQuery);
      }
      params.set("after", pageInfo.endCursor);
      navigate(`/app/product-badges?${params.toString()}`);
    }
  }, [pageInfo, initialSearchQuery, navigate]);

  return (
    <s-page heading="Product Badges">
      <s-section>
        <s-stack gap="base">
          <s-paragraph>
            Erstelle und verwalte individuelle Badges für Produkte. Die Badges werden automatisch
            auf Produktkarten im Storefront angezeigt.
          </s-paragraph>

          {fetcher.data && "success" in fetcher.data && fetcher.data.success && (
            <s-banner tone="success" heading="Success">
              <s-paragraph>{fetcher.data.message}</s-paragraph>
            </s-banner>
          )}

          {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
            <s-banner tone="critical" heading="Error">
              <s-paragraph>{fetcher.data.error}</s-paragraph>
            </s-banner>
          )}

          <s-card>
            <s-stack gap="base">
              <s-heading level="3">Produkte durchsuchen</s-heading>
              
              <s-stack gap="tight" direction="row">
                <s-text-field
                  value={searchQuery}
                  onChange={(e: any) => setSearchQuery(e.target.value)}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  placeholder="Nach Produktname oder Handle suchen..."
                  style={{ flex: 1 }}
                />
                <s-button variant="primary" onClick={handleSearch}>
                  Suchen
                </s-button>
              </s-stack>
            </s-stack>
          </s-card>

          <s-card>
            <s-stack gap="base">
              <s-heading level="3">Produktliste</s-heading>
              
              {products.length === 0 ? (
                <s-paragraph>Keine Produkte gefunden.</s-paragraph>
              ) : (
                <>
                  {products.map((product) => (
                    <div
                      key={product.id}
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                        padding: "16px",
                        marginBottom: "16px",
                      }}
                    >
                      <s-stack gap="base">
                        <s-stack gap="tight" direction="row" style={{ alignItems: "center" }}>
                          {product.featuredImage && (
                            <img
                              src={product.featuredImage.url}
                              alt={product.featuredImage.altText || product.title}
                              style={{
                                width: "60px",
                                height: "60px",
                                objectFit: "cover",
                                borderRadius: "4px",
                              }}
                            />
                          )}
                          <div style={{ flex: 1 }}>
                            <strong>{product.title}</strong>
                            <div style={{ color: "#666", fontSize: "14px" }}>
                              /{product.handle}
                            </div>
                            {product.badge && (
                              <div style={{ marginTop: "8px" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "4px 12px",
                                    borderRadius: "4px",
                                    backgroundColor: product.badge.backgroundColor,
                                    color: product.badge.textColor,
                                    fontSize: "12px",
                                    fontWeight: "600",
                                  }}
                                >
                                  {product.badge.text}
                                </span>
                              </div>
                            )}
                          </div>
                          <s-button
                            variant="secondary"
                            onClick={() => handleEdit(product)}
                          >
                            {editingProductId === product.id ? "Abbrechen" : "Bearbeiten"}
                          </s-button>
                        </s-stack>

                        {editingProductId === product.id && (
                          <div
                            style={{
                              borderTop: "1px solid #e0e0e0",
                              paddingTop: "16px",
                              marginTop: "16px",
                            }}
                          >
                            <s-stack gap="base">
                              <s-heading level="4">Badge konfigurieren</s-heading>
                              
                              <s-stack gap="tight">
                                <s-text-field
                                  label="Badge-Text"
                                  value={badgeText}
                                  onChange={(e: any) => setBadgeText(e.target.value)}
                                  placeholder="z.B. Bestseller, -7%, wenige verfügbar"
                                  details="Der Text, der auf dem Badge angezeigt wird."
                                />
                              </s-stack>

                              <s-stack gap="tight" direction="row">
                                <s-stack gap="tight" style={{ flex: 1, position: "relative" }}>
                                  <label htmlFor={`bg-color-${product.id}`} style={{ fontWeight: 500, marginBottom: "4px" }}>
                                    Hintergrundfarbe
                                  </label>
                                  <s-stack gap="tight" direction="row" style={{ position: "relative" }}>
                                    <div
                                      style={{
                                        width: "50px",
                                        height: "40px",
                                        backgroundColor: backgroundColor,
                                        border: "1px solid #ccc",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        flexShrink: 0,
                                      }}
                                      onClick={() => {
                                        const input = document.getElementById(`bg-color-input-${product.id}`) as HTMLInputElement;
                                        input?.click();
                                      }}
                                    />
                                    <input
                                      id={`bg-color-input-${product.id}`}
                                      type="color"
                                      value={backgroundColor}
                                      onChange={(e) => setBackgroundColor(e.target.value)}
                                      style={{
                                        position: "absolute",
                                        left: 0,
                                        top: 0,
                                        opacity: 0,
                                        width: "50px",
                                        height: "40px",
                                        cursor: "pointer",
                                        zIndex: 1,
                                      }}
                                    />
                                    <s-text-field
                                      value={backgroundColor}
                                      onChange={(e: any) => setBackgroundColor(e.target.value)}
                                      placeholder="#e74c3c"
                                      style={{ flex: 1 }}
                                    />
                                  </s-stack>
                                </s-stack>

                                <s-stack gap="tight" style={{ flex: 1, position: "relative" }}>
                                  <label htmlFor={`text-color-${product.id}`} style={{ fontWeight: 500, marginBottom: "4px" }}>
                                    Textfarbe
                                  </label>
                                  <s-stack gap="tight" direction="row" style={{ position: "relative" }}>
                                    <div
                                      style={{
                                        width: "50px",
                                        height: "40px",
                                        backgroundColor: textColor,
                                        border: "1px solid #ccc",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        flexShrink: 0,
                                      }}
                                      onClick={() => {
                                        const input = document.getElementById(`text-color-input-${product.id}`) as HTMLInputElement;
                                        input?.click();
                                      }}
                                    />
                                    <input
                                      id={`text-color-input-${product.id}`}
                                      type="color"
                                      value={textColor}
                                      onChange={(e) => setTextColor(e.target.value)}
                                      style={{
                                        position: "absolute",
                                        left: 0,
                                        top: 0,
                                        opacity: 0,
                                        width: "50px",
                                        height: "40px",
                                        cursor: "pointer",
                                        zIndex: 1,
                                      }}
                                    />
                                    <s-text-field
                                      value={textColor}
                                      onChange={(e: any) => setTextColor(e.target.value)}
                                      placeholder="#ffffff"
                                      style={{ flex: 1 }}
                                    />
                                  </s-stack>
                                </s-stack>
                              </s-stack>

                              <s-stack gap="tight">
                                <label htmlFor={`position-${product.id}`} style={{ fontWeight: 500 }}>
                                  Position
                                </label>
                                <select
                                  id={`position-${product.id}`}
                                  value={position}
                                  onChange={(e) => setPosition(e.target.value)}
                                  style={{
                                    padding: "8px 12px",
                                    border: "1px solid #ccc",
                                    borderRadius: "4px",
                                    width: "100%",
                                  }}
                                >
                                  <option value="top-left">Oben links</option>
                                  <option value="top-right">Oben rechts</option>
                                  <option value="bottom-left">Unten links</option>
                                  <option value="bottom-right">Unten rechts</option>
                                </select>
                              </s-stack>

                              {badgeText && (
                                <s-stack gap="tight">
                                  <label style={{ fontWeight: 500 }}>Vorschau</label>
                                  <div
                                    style={{
                                      padding: "16px",
                                      border: "1px solid #e0e0e0",
                                      borderRadius: "8px",
                                      backgroundColor: "#f9f9f9",
                                      position: "relative",
                                      minHeight: "200px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        position: "absolute",
                                        [position.includes("top") ? "top" : "bottom"]: "12px",
                                        [position.includes("left") ? "left" : "right"]: "12px",
                                        padding: "6px 12px",
                                        borderRadius: "4px",
                                        backgroundColor: backgroundColor,
                                        color: textColor,
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        display: "inline-block",
                                      }}
                                    >
                                      {badgeText}
                                    </div>
                                  </div>
                                </s-stack>
                              )}

                              <s-stack gap="tight" direction="row">
                                <s-button
                                  variant="primary"
                                  onClick={() => handleSave(product.id)}
                                  disabled={fetcher.state === "submitting"}
                                >
                                  {fetcher.state === "submitting" ? "Speichern..." : "Speichern"}
                                </s-button>
                                {product.badge && (
                                  <s-button
                                    variant="secondary"
                                    onClick={() => {
                                      setBadgeText("");
                                      handleSave(product.id);
                                    }}
                                    disabled={fetcher.state === "submitting"}
                                  >
                                    Badge entfernen
                                  </s-button>
                                )}
                              </s-stack>
                            </s-stack>
                          </div>
                        )}
                      </s-stack>
                    </div>
                  ))}

                  {pageInfo.hasNextPage && (
                    <s-button variant="secondary" onClick={handleLoadMore}>
                      Mehr laden
                    </s-button>
                  )}
                </>
              )}
            </s-stack>
          </s-card>

          <s-banner tone="info" heading="Hinweis">
            <s-paragraph>
              Die Badges werden automatisch auf Produktkarten im Storefront angezeigt. Stelle sicher,
              dass das Urgify Theme Extension Snippet in deinem Theme eingebunden ist.
            </s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>
    </s-page>
  );
}

