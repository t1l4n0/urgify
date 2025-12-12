import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type SerializeFrom,
} from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ensureShopMetafieldDefinitions, ensureProductMetafieldDefinitions } from "../utils/metafieldDefinitions";
import prisma from "../db.server";
// Polaris Web Components - no imports needed, components are global
import { useState, useCallback, useEffect } from "react";

type CartUpsellsLoaderData = SerializeFrom<typeof loader>;
type CartUpsellsSuccess = Extract<CartUpsellsLoaderData, { settings: unknown }>;

type ActionData = 
  | { success: true; message: string }
  | { error: string }
  | undefined;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Note: Rate limiting checks removed for admin UI pages to avoid blocking legitimate user actions
    // Shopify's own rate limits will still apply

    // Check if product metafield definition exists and is pinned
    const definitionQuery = `#graphql
      query getProductMetafieldDefinition {
        metafieldDefinitions(first: 10, namespace: "urgify", ownerType: PRODUCT) {
          nodes {
            id
            key
            pinnedPosition
          }
        }
      }
    `;

    const definitionResponse = await admin.graphql(definitionQuery);
    const definitionData = await definitionResponse.json();
    const definitions = definitionData.data?.metafieldDefinitions?.nodes || [];
    const cartUpsellsDefinition = definitions.find((def: any) => def.key === "cart_upsells");
    const metafieldDefinitionExists = !!cartUpsellsDefinition;
    const metafieldDefinitionPinned = cartUpsellsDefinition?.pinnedPosition !== null && cartUpsellsDefinition?.pinnedPosition !== undefined;

    // Get shop ID
    const shopResponse = await admin.graphql(`
      query getShop {
        shop {
          id
        }
      }
    `);
    const shopData = await shopResponse.json();
    const shopId = shopData.data?.shop?.id;

    // Normalize shop name (remove .myshopify.com if present for consistency)
    const normalizedShop = session.shop.replace(/\.myshopify\.com$/, '');
    
    // Fetch cart upsell settings from database
    let settings = {
      enabled: false,
      heading: "Recommendations",
      max_products: 3,
      show_price: true,
      show_compare_at_price: true,
      image_size: "medium",
      button_label: "Add to cart",
    };

    const dbSettings = await prisma.cartUpsellSettings.findUnique({
      where: { shop: normalizedShop },
    });

    if (dbSettings) {
      settings = {
        enabled: dbSettings.enabled,
        heading: dbSettings.heading,
        max_products: dbSettings.maxProducts,
        show_price: dbSettings.showPrice,
        show_compare_at_price: dbSettings.showCompareAtPrice,
        image_size: dbSettings.imageSize,
        button_label: dbSettings.buttonLabel,
      };
      console.log(`[Cart Upsells] Loaded settings for shop: "${normalizedShop}"`, settings);
    } else {
      console.log(`[Cart Upsells] No settings found for shop: "${normalizedShop}", using defaults`);
    }

    return json({
      settings,
      shopId,
      metafieldDefinitionExists,
      metafieldDefinitionPinned,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error loading cart upsells:", error);
    return json(
      { error: "Failed to load settings. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Note: Rate limiting checks removed for admin UI actions to avoid blocking legitimate saves
    // Shopify's own rate limits will still apply and be handled by the GraphQL client

    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "update") {
      // Get shop ID
      const shopResponse = await admin.graphql(`
        query getShop {
          shop {
            id
          }
        }
      `);
      const shopData = await shopResponse.json();
      const shopId = shopData.data?.shop?.id;

      if (!shopId) {
        return json({ error: "Shop ID not found" }, { status: 400 });
      }

      // Build settings object
      const settings = {
        enabled: formData.get("enabled") === "true",
        heading: formData.get("heading") || "Recommendations",
        max_products: parseInt(formData.get("max_products") || "3", 10),
        show_price: formData.get("show_price") === "true",
        show_compare_at_price: formData.get("show_compare_at_price") === "true",
        image_size: formData.get("image_size") || "medium",
        button_label: formData.get("button_label") || "Add to cart",
      };

      // Validate max_products
      if (settings.max_products < 1 || settings.max_products > 10) {
        return json({ error: "Max products must be between 1 and 10" }, { status: 400 });
      }

      // Normalize shop name (remove .myshopify.com if present for consistency)
      const normalizedShop = session.shop.replace(/\.myshopify\.com$/, '');
      
      console.log(`[Cart Upsells] Saving settings for shop: "${normalizedShop}" (original: "${session.shop}")`, settings);

      // Save settings to database
      await prisma.cartUpsellSettings.upsert({
        where: { shop: normalizedShop },
        update: {
          enabled: settings.enabled,
          heading: settings.heading,
          maxProducts: settings.max_products,
          showPrice: settings.show_price,
          showCompareAtPrice: settings.show_compare_at_price,
          imageSize: settings.image_size,
          buttonLabel: settings.button_label,
        },
        create: {
          shop: normalizedShop,
          enabled: settings.enabled,
          heading: settings.heading,
          maxProducts: settings.max_products,
          showPrice: settings.show_price,
          showCompareAtPrice: settings.show_compare_at_price,
          imageSize: settings.image_size,
          buttonLabel: settings.button_label,
        },
      });

      console.log(`[Cart Upsells] Settings saved successfully for shop: "${normalizedShop}"`);

      // Set shop metafield to enable/disable cart upsell in Liquid templates
      try {
        await ensureShopMetafieldDefinitions(admin);
        
        const metafieldMutation = `#graphql
          mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
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

        const metafieldVariables = {
          metafields: [
            {
              ownerId: shopId,
              namespace: "urgify",
              key: "cart_upsell_enabled",
              type: "boolean",
              value: String(settings.enabled),
            },
          ],
        };

        const metafieldResponse = await admin.graphql(metafieldMutation, {
          variables: metafieldVariables,
        });

        const metafieldData = await metafieldResponse.json();

        if (metafieldData.errors) {
          console.error("GraphQL errors in metafieldsSet:", metafieldData.errors);
        }

        const userErrors = metafieldData?.data?.metafieldsSet?.userErrors || [];
        if (userErrors.length > 0) {
          console.error("User errors in metafieldsSet:", userErrors);
        } else {
          console.log(`[Cart Upsells] Shop metafield 'cart_upsell_enabled' set to: ${settings.enabled}`);
        }
      } catch (metafieldError) {
        console.error("[Cart Upsells] Error setting shop metafield:", metafieldError);
        // Don't fail the request if metafield update fails - settings are already saved to DB
      }

      return json({ success: true, message: "Cart Upsell settings updated successfully" });
    }

    if (action === "create-metafield-definition") {
      try {
        // Check available scopes for debugging
        let availableScopes: string[] = [];
        try {
          const scopeResponse = await admin.graphql(`
            query getCurrentAppInstallation {
              currentAppInstallation {
                accessScopes {
                  handle
                }
              }
            }
          `);
          const scopeData = await scopeResponse.json();
          
          // Check for GraphQL errors in scope query
          if (scopeData.errors) {
            console.error("GraphQL errors when checking scopes:", scopeData.errors);
            // Continue anyway - might still work
          } else {
            availableScopes = scopeData.data?.currentAppInstallation?.accessScopes?.map((s: any) => s.handle) || [];
            console.log("Available scopes:", availableScopes);
          }
        } catch (scopeError) {
          console.error("Error checking scopes:", scopeError);
          // Continue anyway - might still work
        }
        
        // Check if required scopes are present (but don't block if check failed)
        if (availableScopes.length > 0) {
          const hasWriteMetaobjectDefinitions = availableScopes.includes("write_metaobject_definitions");
          
          if (!hasWriteMetaobjectDefinitions) {
            console.warn("Scope 'write_metaobject_definitions' not found. Available scopes:", availableScopes);
            // Don't block - try anyway, might work if scopes were just updated
            // return json({ 
            //   error: "Missing required scope: 'write_metaobject_definitions'. Please ensure the app has been updated with the new scopes and the permissions have been granted. Available scopes: " + availableScopes.join(", ") 
            // }, { status: 403 });
          }
        }
        
        // Create and pin the product metafield definition
        // This will throw an error if scopes are missing, which we'll catch below
        await ensureProductMetafieldDefinitions(admin);
        
        // Verify it was created and pinned
        const verifyQuery = `#graphql
          query verifyProductMetafieldDefinition {
            metafieldDefinitions(first: 10, namespace: "urgify", ownerType: PRODUCT) {
              nodes {
                id
                key
                pinnedPosition
              }
            }
          }
        `;
        
        const verifyResponse = await admin.graphql(verifyQuery);
        const verifyData = await verifyResponse.json();
        
        // Check for GraphQL errors
        if (verifyData.errors) {
          console.error("GraphQL errors when verifying metafield definition:", verifyData.errors);
          const errorDetails = verifyData.errors.map((e: any) => {
            return `${e.message}${e.extensions?.code ? ` (${e.extensions.code})` : ''}`;
          }).join(", ");
          return json({ 
            error: `Failed to verify metafield definition: ${errorDetails}` 
          }, { status: 500 });
        }
        
        const definitions = verifyData.data?.metafieldDefinitions?.nodes || [];
        const cartUpsellsDefinition = definitions.find((def: any) => def.key === "cart_upsells");
        
        if (cartUpsellsDefinition) {
          const isPinned = cartUpsellsDefinition.pinnedPosition !== null && cartUpsellsDefinition.pinnedPosition !== undefined;
          if (isPinned) {
            return json({ 
              success: true, 
              message: "Metafield definition created and pinned successfully. It should now be visible in the Shopify Admin." 
            });
          } else {
            return json({ 
              success: true, 
              message: "Metafield definition created but may not be pinned. Please check in Shopify Admin." 
            });
          }
        } else {
          return json({ 
            error: "Failed to create metafield definition. The definition was not found after creation. Please check the browser console or server logs for detailed error messages." 
          }, { status: 500 });
        }
      } catch (error) {
        console.error("Error creating metafield definition:", error);
        
        // Log full error details
        let errorDetails = "Unknown error";
        if (error instanceof Error) {
          errorDetails = error.message;
          console.error("Error name:", error.name);
          console.error("Error message:", error.message);
          console.error("Error stack:", error.stack);
        } else if (typeof error === "string") {
          errorDetails = error;
        } else {
          try {
            errorDetails = JSON.stringify(error);
          } catch {
            errorDetails = String(error);
          }
        }
        
        // Check if it's a scope-related error
        if (errorDetails.includes("access") || errorDetails.includes("scope") || errorDetails.includes("permission") || errorDetails.includes("unauthorized")) {
          return json({ 
            error: `Permission error: ${errorDetails}. Please ensure the app has the 'write_metaobject_definitions' and 'read_metaobject_definitions' scopes and that permissions have been granted.` 
          }, { status: 403 });
        }
        
        return json({ 
          error: `Failed to create metafield definition: ${errorDetails}` 
        }, { status: 500 });
      }
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in cart upsells action:", error);
    return json(
      { error: "Failed to update settings. Please try again." },
      { status: 500 }
    );
  }
};

export default function CartUpsells() {
  const loaderData = useLoaderData<typeof loader>();

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

  if ("settings" in loaderData) {
    return <CartUpsellsForm data={loaderData as CartUpsellsSuccess} />;
  }

  return (
    <s-page heading="Cart Upsells">
      <s-section>
        <s-banner tone="critical" heading="Error">
          <s-paragraph>Failed to load settings</s-paragraph>
        </s-banner>
      </s-section>
    </s-page>
  );
}

function CartUpsellsForm({ data }: { data: CartUpsellsSuccess }) {
  const fetcher = useFetcher<ActionData>();
  const revalidator = useRevalidator();
  const { settings, metafieldDefinitionExists, metafieldDefinitionPinned } = data;

  const [enabled, setEnabled] = useState(settings.enabled);
  const [heading, setHeading] = useState(settings.heading);
  const [maxProducts, setMaxProducts] = useState(String(settings.max_products));
  const [showPrice, setShowPrice] = useState(settings.show_price);
  const [showCompareAtPrice, setShowCompareAtPrice] = useState(settings.show_compare_at_price);
  const [imageSize, setImageSize] = useState(settings.image_size);
  const [buttonLabel, setButtonLabel] = useState(settings.button_label);
  const [isDirty, setIsDirty] = useState(false);

  // Reset form when settings change (after save) or when metafield definition is created
  useEffect(() => {
    if (fetcher.data) {
      if ("success" in fetcher.data && fetcher.data.success) {
        setIsDirty(false);
        setTimeout(() => {
          revalidator.revalidate();
        }, 500);
      }
      // Log errors for debugging
      if ("error" in fetcher.data && fetcher.data.error) {
        console.error("Action error:", fetcher.data.error);
      }
    }
  }, [fetcher.data, revalidator]);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "update");
    formData.append("enabled", enabled ? "true" : "false");
    formData.append("heading", heading);
    formData.append("max_products", maxProducts);
    formData.append("show_price", showPrice ? "true" : "false");
    formData.append("show_compare_at_price", showCompareAtPrice ? "true" : "false");
    formData.append("image_size", imageSize);
    formData.append("button_label", buttonLabel);

    fetcher.submit(formData, { method: "post" });
  }, [enabled, heading, maxProducts, showPrice, showCompareAtPrice, imageSize, buttonLabel, fetcher]);

  const handleChange = useCallback(() => {
    setIsDirty(true);
  }, []);

  return (
    <s-page heading="Cart Upsells">
      <s-section>
        <s-stack gap="base">
          <s-paragraph>
            Configure cart upsell recommendations. When customers add products to their cart,
            recommended upsell products from the product metafield (upsell.products) will be
            displayed in the cart drawer.
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
              <s-heading level={3}>General Settings</s-heading>
              
              <s-stack gap="tight">
                <s-checkbox
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.currentTarget.checked);
                    handleChange();
                  }}
                  label="Enable Cart Upsell"
                  helpText="Display upsell products in the cart drawer when customers add products to their cart."
                />
              </s-stack>

              {enabled && (
                <>
                  <s-stack gap="tight">
                    <label htmlFor="heading" style={{ fontWeight: 500 }}>
                      Heading Text
                    </label>
                    <input
                      id="heading"
                      type="text"
                      value={heading}
                      onChange={(e) => {
                        setHeading(e.target.value);
                        handleChange();
                      }}
                      placeholder="Recommendations"
                      style={{
                        padding: "8px 12px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        width: "100%",
                      }}
                    />
                    <small style={{ color: "#666" }}>
                      Text displayed above the upsell products in the cart drawer.
                    </small>
                  </s-stack>

                  <s-stack gap="tight">
                    <label htmlFor="max_products" style={{ fontWeight: 500 }}>
                      Maximum Products
                    </label>
                    <input
                      id="max_products"
                      type="number"
                      min="1"
                      max="10"
                      value={maxProducts}
                      onChange={(e) => {
                        setMaxProducts(e.target.value);
                        handleChange();
                      }}
                      style={{
                        padding: "8px 12px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        width: "100px",
                      }}
                    />
                    <small style={{ color: "#666" }}>
                      Maximum number of upsell products to display (1-10).
                    </small>
                  </s-stack>

                  <s-stack gap="tight">
                    <label htmlFor="button_label" style={{ fontWeight: 500 }}>
                      Button Label
                    </label>
                    <input
                      id="button_label"
                      type="text"
                      value={buttonLabel}
                      onChange={(e) => {
                        setButtonLabel(e.target.value);
                        handleChange();
                      }}
                      placeholder="Add to cart"
                      style={{
                        padding: "8px 12px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        width: "100%",
                      }}
                    />
                    <small style={{ color: "#666" }}>
                      Text displayed on the add to cart button for upsell products.
                    </small>
                  </s-stack>
                </>
              )}
            </s-stack>
          </s-card>

          {enabled && (
            <s-card>
              <s-stack gap="base">
                <s-heading level={3}>Display Settings</s-heading>
                
                <s-stack gap="tight">
                  <s-checkbox
                    checked={showPrice}
                    onChange={(e) => {
                      setShowPrice(e.currentTarget.checked);
                      handleChange();
                    }}
                    label="Show Price"
                    helpText="Display product prices in the upsell list."
                  />
                </s-stack>

                {showPrice && (
                  <s-stack gap="tight">
                    <s-checkbox
                      checked={showCompareAtPrice}
                      onChange={(e) => {
                        setShowCompareAtPrice(e.currentTarget.checked);
                        handleChange();
                      }}
                      label="Show Compare at Price"
                      helpText="Display original price when product is on sale (strikethrough)."
                    />
                  </s-stack>
                )}

                <s-stack gap="tight">
                  <label htmlFor="image_size" style={{ fontWeight: 500 }}>
                    Image Size
                  </label>
                  <select
                    id="image_size"
                    value={imageSize}
                    onChange={(e) => {
                      setImageSize(e.target.value);
                      handleChange();
                    }}
                    style={{
                      padding: "8px 12px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      width: "200px",
                    }}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                  <small style={{ color: "#666" }}>
                    Size of product images in the upsell list.
                  </small>
                </s-stack>
              </s-stack>
            </s-card>
          )}

          <s-stack gap="tight" direction="row">
            <s-button
              variant="primary"
              onClick={handleSave}
              disabled={!isDirty || fetcher.state === "submitting"}
            >
              {fetcher.state === "submitting" ? "Saving..." : "Save Settings"}
            </s-button>
            {isDirty && (
              <s-button
                variant="secondary"
                onClick={() => {
                  setEnabled(settings.enabled);
                  setHeading(settings.heading);
                  setMaxProducts(String(settings.max_products));
                  setShowPrice(settings.show_price);
                  setShowCompareAtPrice(settings.show_compare_at_price);
                  setImageSize(settings.image_size);
                  setButtonLabel(settings.button_label);
                  setIsDirty(false);
                }}
              >
                Reset
              </s-button>
            )}
          </s-stack>

          {metafieldDefinitionExists && metafieldDefinitionPinned ? (
            <s-banner tone="success" heading="Metafield Definition Ready">
              <s-paragraph>
                The product metafield <strong>urgify.cart_upsells</strong> has been created and pinned,
                making it visible in the Shopify Admin. You can configure upsell products for each product
                directly in the Shopify Admin under the product's Metafields section. When a customer
                adds a product to their cart, the upsell products from that product's metafield will
                be displayed in the cart drawer.
              </s-paragraph>
            </s-banner>
          ) : (
            <s-card>
              <s-stack gap="base">
                <s-heading level={3}>Metafield Definition</s-heading>
                <s-paragraph>
                  The product metafield <strong>urgify.cart_upsells</strong> needs to be created to enable
                  cart upsell functionality. Click the button below to create and pin the metafield definition,
                  which will make it visible in the Shopify Admin for all products.
                </s-paragraph>
                {metafieldDefinitionExists && !metafieldDefinitionPinned && (
                  <s-banner tone="warning" heading="Definition exists but not pinned">
                    <s-paragraph>
                      The metafield definition exists but is not pinned. Click the button below to pin it.
                    </s-paragraph>
                  </s-banner>
                )}
                <s-button
                  variant="primary"
                  onClick={() => {
                    const formData = new FormData();
                    formData.append("action", "create-metafield-definition");
                    fetcher.submit(formData, { method: "post" });
                  }}
                  disabled={fetcher.state === "submitting"}
                >
                  {fetcher.state === "submitting" ? "Creating..." : "Create Metafield Definition"}
                </s-button>
              </s-stack>
            </s-card>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
