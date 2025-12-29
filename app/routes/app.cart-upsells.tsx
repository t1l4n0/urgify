import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type SerializeFrom,
} from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ensureShopMetafieldDefinitions } from "../utils/metafieldDefinitions";
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
  
  // Ensure shop metafield definitions exist
  await ensureShopMetafieldDefinitions(admin);

  try {
    // Note: Rate limiting checks removed for admin UI pages to avoid blocking legitimate user actions
    // Shopify's own rate limits will still apply

    // Fetch shop metafield for cart upsell settings
    const metafieldResponse = await admin.graphql(`
      query getShopMetafield {
        shop {
          id
          metafield(namespace: "urgify", key: "cart_upsell_config") {
            value
            type
          }
        }
      }
    `);

    const metafieldData = await metafieldResponse.json();
    const configValue = metafieldData.data?.shop?.metafield?.value;
    const shopId = metafieldData.data?.shop?.id;
    
    // Parse JSON metafield or use defaults
    let settings = {
      enabled: false,
      heading: "Recommendations",
      max_products: 3,
      show_price: true,
      show_compare_at_price: true,
      image_size: "medium",
      button_label: "Add to cart",
    };

    if (configValue) {
      try {
        const parsedConfig = JSON.parse(configValue);
        settings = { ...settings, ...parsedConfig };
      } catch (error) {
        console.error("Error parsing cart upsell config:", error);
      }
    }

    return json({
      settings,
      shopId,
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
        heading: String(formData.get("heading") || "Recommendations"),
        max_products: parseInt(String(formData.get("max_products") || "3"), 10),
        show_price: formData.get("show_price") === "true",
        show_compare_at_price: formData.get("show_compare_at_price") === "true",
        image_size: String(formData.get("image_size") || "medium"),
        button_label: String(formData.get("button_label") || "Add to cart"),
      };

      // Validate max_products
      if (settings.max_products < 1 || settings.max_products > 10) {
        return json({ error: "Max products must be between 1 and 10" }, { status: 400 });
      }

      // Update metafield
      const updateMutation = `#graphql
        mutation updateShopMetafield($metafields: [MetafieldsSetInput!]!) {
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

      const metafieldValue = JSON.stringify(settings);

      const updateResponse = await admin.graphql(updateMutation, {
        variables: {
          metafields: [
            {
              ownerId: shopId,
              namespace: "urgify",
              key: "cart_upsell_config",
              type: "json",
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

      return json({ success: true, message: "Cart Upsell settings updated successfully" });
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
  const { settings } = data;

  const [enabled, setEnabled] = useState(settings.enabled);
  const [heading, setHeading] = useState(settings.heading);
  const [maxProducts, setMaxProducts] = useState(String(settings.max_products));
  const [showPrice, setShowPrice] = useState(settings.show_price);
  const [showCompareAtPrice, setShowCompareAtPrice] = useState(settings.show_compare_at_price);
  const [imageSize, setImageSize] = useState(settings.image_size);
  const [buttonLabel, setButtonLabel] = useState(settings.button_label);
  const [isDirty, setIsDirty] = useState(false);

  // Reset form when settings change (after save)
  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      setIsDirty(false);
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
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
              <s-heading level="3">General Settings</s-heading>
              
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
                <s-heading level="3">Display Settings</s-heading>
                
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

          <s-banner tone="info" heading="How it works">
            <s-paragraph>
              Cart Upsell uses the product metafield <strong>upsell.products</strong> to display
              recommended products. Make sure to configure this metafield for your products in the
              Shopify Admin. When a customer adds a product to their cart, the upsell products
              from that product's metafield will be displayed in the cart drawer.
            </s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>
    </s-page>
  );
}
