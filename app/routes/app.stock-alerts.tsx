import { json, type LoaderFunctionArgs, type ActionFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager } from "../utils/billing";
import { z } from "zod";
import { shouldRateLimit, checkShopifyRateLimit } from "../utils/rateLimiting";
import {
  Frame,
  Card,
  Page,
  Layout,
  Text,
  List,
  Badge,
  BlockStack,
  InlineStack,
  Select,
  TextField,
  FormLayout,
  Checkbox,
  Toast,
  ContextualSaveBar,
} from "@shopify/polaris";
import { useState, useCallback, useEffect, useRef } from "react";
import stockAlertStyles from "../styles/stock-alert-preview.css?url";

export const links = () => [
  { rel: "stylesheet", href: stockAlertStyles }
];

// Validation schema for stock alert settings - simplified
const stockAlertSettingsSchema = z.object({
  globalThreshold: z.string().default('5'),
  lowStockMessage: z.string().default('Only {{qty}} left in stock!'),
  isEnabled: z.string().default('false'),
  fontSize: z.string().default('18px'),
  textColor: z.string().default('#ffffff'),
  backgroundColor: z.string().default('#e74c3c'),
  showForAllProducts: z.string().default('false'),
  showBasedOnInventory: z.string().default('false'),
  showOnlyBelowThreshold: z.string().default('false'),
  customThreshold: z.string().default('100'),
  stockCounterAnimation: z.string().default('pulse'),
  stockCounterPosition: z.string().default('above'),
  stockAlertStyle: z.string().default('spectacular'),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Sync subscription status to metafield first
  try {
    const shopResponse = await admin.graphql(`
      query getShop {
        shop {
          id
        }
      }
    `);
    
    const shopData = await shopResponse.json();
    const shopId = shopData.data?.shop?.id;
    
    if (shopId) {
      const { syncSubscriptionStatusToMetafield } = await import("../utils/billing");
      await syncSubscriptionStatusToMetafield(admin, shopId);
    }
  } catch (syncError) {
    console.error("Failed to sync subscription status:", syncError);
    // Continue with subscription check even if sync fails
  }

  // Check subscription status first
  try {
    const billingManager = new BillingManager(session.shop, admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    // If no active subscription or trial, redirect to pricing
    if (!subscriptionStatus.hasActiveSubscription && !subscriptionStatus.isTrialActive) {
      throw redirect("/app/pricing?reason=subscription_required");
    }
  } catch (error) {
    // If subscription check fails, redirect to pricing as well
    console.error("Error checking subscription status:", error);
    throw redirect("/app/pricing?reason=subscription_required");
  }

  try {
    // Fetch shop metafield for stock alert settings (single JSON metafield)
    const metafieldResponse = await admin.graphql(`
      query getShopMetafield {
        shop {
          metafield(namespace: "urgify", key: "stock_alert_config") {
            value
            type
          }
        }
      }
    `);

    const metafieldData = await metafieldResponse.json();
    const configValue = metafieldData.data?.shop?.metafield?.value;
    
    // Parse JSON metafield or use defaults
    let settings = {
      stock_alert_enabled: false,
      global_threshold: 5,
      low_stock_message: "Only {{qty}} left in stock!",
      font_size: "18px",
      text_color: "#ffffff",
      background_color: "#e74c3c",
      stock_counter_animation: "pulse",
      stock_counter_position: "above",
      stock_alert_style: "spectacular",
      show_for_all_products: false,
      show_based_on_inventory: false,
      show_only_below_threshold: false,
      custom_threshold: 100,
    };

    if (configValue) {
      try {
        const parsedConfig = JSON.parse(configValue);
        // RICHTIG: Defaults zuerst, dann das Geladene (überschreibt Defaults)
        settings = { ...settings, ...parsedConfig };
      } catch (error) {
        console.error("Error parsing stock alert config:", error);
      }
    }

    // Fetch products with inventory levels
    const response = await admin.graphql(`
      query getProductsWithInventory {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              totalInventory
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    inventoryQuantity
                    availableForSale
                  }
                }
              }
            }
          }
        }
      }
    `);

    const data = await response.json();
    
    // Check for GraphQL errors
    if ((data as any).errors) {
      console.error("GraphQL errors:", (data as any).errors);
      throw new Error(`GraphQL errors: ${(data as any).errors.map((e: any) => e.message).join(', ')}`);
    }
    
    const products = data.data?.products?.edges?.map((edge: any) => edge.node) || [];

    return json({
      settings,
      products: products
        .filter((product: any) => (product.totalInventory || 0) > 0) // Nur Produkte mit Bestand > 0
        .map((product: any) => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          totalInventory: product.totalInventory || 0,
          variants: product.variants?.edges?.map((edge: any) => edge.node) || [],
          lowStock: (product.totalInventory || 0) <= (settings.global_threshold || 5),
        })),
    }, { 
      headers: { 
        "Cache-Control": "no-store" 
      } 
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return json({ 
      settings: {
        stock_alert_enabled: false,
        global_threshold: 5,
        low_stock_message: "Only {{qty}} left in stock!",
        font_size: "18px",
        text_color: "#ffffff",
        background_color: "#e74c3c",
        stock_counter_animation: "pulse",
        stock_counter_position: "above",
        stock_alert_style: "spectacular",
        show_for_all_products: false,
        show_based_on_inventory: false,
        show_only_below_threshold: true,
        custom_threshold: 5,
      },
      products: [], 
      error: "Failed to fetch data" 
    }, { 
      headers: { 
        "Cache-Control": "no-store" 
      } 
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Check rate limiting for admin actions
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
    // Check available scopes for debugging
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
    console.log("Available scopes:", scopeData.data?.currentAppInstallation?.accessScopes?.map((s: any) => s.handle) || []);

    const formData = await request.formData();
    const getStr = (key: string, fallback = "") => {
      const v = formData.get(key);
      if (v === null || v === undefined) return fallback;
      return String(v);
    };

    // Extract form data
    const formValues = {
      globalThreshold: getStr("globalThreshold", "5"),
      lowStockMessage: getStr("lowStockMessage", "Only {{qty}} left in stock!"),
      isEnabled: getStr("isEnabled", "false"),
      fontSize: getStr("fontSize", "18px"),
      textColor: getStr("textColor", "#ffffff"),
      backgroundColor: getStr("backgroundColor", "#e74c3c"),
      showForAllProducts: getStr("showForAllProducts", "false"),
      showBasedOnInventory: getStr("showBasedOnInventory", "true"),
      showOnlyBelowThreshold: getStr("showOnlyBelowThreshold", "false"),
      customThreshold: getStr("customThreshold", "100"),
      stockCounterAnimation: getStr("stockCounterAnimation", "pulse"),
      stockCounterPosition: getStr("stockCounterPosition", "above"),
      stockAlertStyle: getStr("stockAlertStyle", "spectacular"),
    };

    // Validate input
    const validatedData = stockAlertSettingsSchema.parse(formValues);
    
    const {
      globalThreshold,
      lowStockMessage,
      isEnabled,
      fontSize,
      textColor,
      backgroundColor,
      showForAllProducts,
      showBasedOnInventory,
      showOnlyBelowThreshold,
      customThreshold,
      stockCounterAnimation,
      stockCounterPosition,
      stockAlertStyle,
    } = validatedData;

    console.log("Saving Stock Alert Settings to Shop Metafields:", {
      globalThreshold,
      lowStockMessage,
      isEnabled,
      fontSize,
      textColor,
      backgroundColor,
      stockCounterAnimation,
      stockCounterPosition,
      stockAlertStyle,
      showForAllProducts,
      showBasedOnInventory,
      showOnlyBelowThreshold,
      customThreshold,
    });

    // First, get the shop ID
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
      throw new Error("Could not retrieve shop ID");
    }

    // Save all settings as a single JSON metafield
    const settings = {
      stock_alert_enabled: isEnabled === "true",
      global_threshold: parseInt(globalThreshold) || 5,
      low_stock_message: lowStockMessage,
      font_size: fontSize,
      text_color: textColor,
      background_color: backgroundColor,
      stock_counter_animation: stockCounterAnimation,
      stock_counter_position: stockCounterPosition,
      stock_alert_style: stockAlertStyle,
      show_for_all_products: showForAllProducts === "true",
      show_based_on_inventory: showBasedOnInventory === "true",
      show_only_below_threshold: showOnlyBelowThreshold === "true",
      custom_threshold: parseInt(customThreshold) || 100,
    };

    // Speichere sowohl JSON-Metafield als auch individuelle Metafields für Liquid-Templates
    const metafields = [
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "stock_alert_config",
        value: JSON.stringify(settings),
        type: "json"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "stock_alert_enabled",
        value: settings.stock_alert_enabled.toString(),
        type: "boolean"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "global_threshold",
        value: settings.global_threshold.toString(),
        type: "number_integer"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "low_stock_message",
        value: settings.low_stock_message,
        type: "single_line_text_field"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "font_size",
        value: settings.font_size,
        type: "single_line_text_field"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "text_color",
        value: settings.text_color,
        type: "single_line_text_field"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "background_color",
        value: settings.background_color,
        type: "single_line_text_field"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "stock_counter_animation",
        value: settings.stock_counter_animation,
        type: "single_line_text_field"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "stock_counter_position",
        value: settings.stock_counter_position,
        type: "single_line_text_field"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "stock_alert_style",
        value: settings.stock_alert_style,
        type: "single_line_text_field"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "show_for_all_products",
        value: settings.show_for_all_products.toString(),
        type: "boolean"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "show_based_on_inventory",
        value: settings.show_based_on_inventory.toString(),
        type: "boolean"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "show_only_below_threshold",
        value: settings.show_only_below_threshold.toString(),
        type: "boolean"
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "custom_threshold",
        value: settings.custom_threshold.toString(),
        type: "number_integer"
      }
    ];

    const response = await admin.graphql(`#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `, { variables: { metafields } });

    const data = await response.json();
    const userErrors = data?.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("Metafield error:", userErrors);
      throw new Error(`Failed to save metafields: ${userErrors[0]?.message || 'Unknown error'}`);
    }

    return json({ success: true });
  } catch (error) {
    console.error("Error saving stock alert settings:", error);
    
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues?.map((err: any) => `${err.path?.join('.')}: ${err.message}`).join(', ') || 'Validation failed';
      return json({
        error: `Validation failed: ${errorMessage}`
      }, { status: 400 });
    }
    
    return json({
      error: "Failed to save settings: " + (error as Error).message
    }, { status: 500 });
  }
};

export default function StockAlertsSimple() {
  const { settings, products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  
  // Simple state management
  const [globalThreshold, setGlobalThreshold] = useState(String(settings.global_threshold || 5));
  const [lowStockMessage, setLowStockMessage] = useState(String(settings.low_stock_message || "Only {{qty}} left in stock!"));
  const [isEnabled, setIsEnabled] = useState(Boolean(settings.stock_alert_enabled));
  const [fontSize, setFontSize] = useState(String(settings.font_size || "18px"));
  const [textColor, setTextColor] = useState(String(settings.text_color || "#ffffff"));
  const [backgroundColor, setBackgroundColor] = useState(String(settings.background_color || "#e74c3c"));
  const [stockCounterAnimation, setStockCounterAnimation] = useState(String(settings.stock_counter_animation || "pulse"));
  const [stockCounterPosition, setStockCounterPosition] = useState(String(settings.stock_counter_position || "above"));
  const [stockAlertStyle, setStockAlertStyle] = useState(String(settings.stock_alert_style || "spectacular"));
  const [showForAllProducts, setShowForAllProducts] = useState(Boolean(settings.show_for_all_products));
  const [showBasedOnInventory, setShowBasedOnInventory] = useState(Boolean(settings.show_based_on_inventory));
  const [showOnlyBelowThreshold, setShowOnlyBelowThreshold] = useState(Boolean(settings.show_only_below_threshold));
  const [customThreshold, setCustomThreshold] = useState(String(settings.custom_threshold || "5"));
  
  const [isDirty, setIsDirty] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const shownRef = useRef(false);        // Gate gegen erneutes Öffnen

  // Sobald der Loader neue Daten liefert, lokale Felder aktualisieren:
  useEffect(() => {
    setGlobalThreshold(String(settings.global_threshold || 5));
    setLowStockMessage(String(settings.low_stock_message || "Only {{qty}} left in stock!"));
    setIsEnabled(Boolean(settings.stock_alert_enabled));
    setFontSize(String(settings.font_size || "18px"));
    setTextColor(String(settings.text_color || "#ffffff"));
    setBackgroundColor(String(settings.background_color || "#e74c3c"));
    setStockCounterAnimation(String(settings.stock_counter_animation || "pulse"));
    setStockCounterPosition(String(settings.stock_counter_position || "above"));
    setStockAlertStyle(String(settings.stock_alert_style || "spectacular"));
    setShowForAllProducts(Boolean(settings.show_for_all_products));
    setShowBasedOnInventory(Boolean(settings.show_based_on_inventory));
    setShowOnlyBelowThreshold(Boolean(settings.show_only_below_threshold));
    setCustomThreshold(String(settings.custom_threshold || "5"));
  }, [settings]);

  const safeProducts = Array.isArray(products) ? products : [];
  const lowStockProducts = safeProducts.filter((product: any) => {
    const inventory = product?.totalInventory || 0;
    const threshold = parseInt(globalThreshold) || 5;
    return inventory <= threshold;
  });

  const handleGlobalThresholdChange = useCallback((value: string) => {
    setGlobalThreshold(value);
    setIsDirty(true);
  }, []);

  const handleEnabledChange = useCallback((checked: boolean) => {
    setIsEnabled(checked);
    setIsDirty(true);
  }, []);

  const handleSaveSettings = useCallback(() => {
    fetcher.submit(
      {
        globalThreshold,
        lowStockMessage,
        isEnabled: isEnabled.toString(),
        fontSize,
        textColor,
        backgroundColor,
        stockCounterAnimation,
        stockCounterPosition,
        stockAlertStyle,
        showForAllProducts: showForAllProducts.toString(),
        showBasedOnInventory: showBasedOnInventory.toString(),
        showOnlyBelowThreshold: showOnlyBelowThreshold.toString(),
        customThreshold,
      },
      { method: "POST", action: "/app/stock-alerts", encType: "application/x-www-form-urlencoded" }
    );
  }, [globalThreshold, lowStockMessage, isEnabled, fontSize, textColor, backgroundColor, stockCounterAnimation, stockCounterPosition, stockAlertStyle, showForAllProducts, showBasedOnInventory, showOnlyBelowThreshold, customThreshold, fetcher]);

  // Show success toast when save is successful (nur Rising-Edge)
  useEffect(() => {
    // Bei neuem Submit/Reload Gate zurücksetzen
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      shownRef.current = false;
      return;
    }

    if (fetcher.state === "idle" && (fetcher.data as any)?.success && !shownRef.current) {
      shownRef.current = true;          // einmalig pro Erfolg
      setToastActive(true);
      setIsDirty(false);
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const getStockBadge = (inventory: number) => {
    const safeInventory = Number(inventory) || 0;
    const globalThresh = parseInt(globalThreshold) || 5;
    if (safeInventory <= globalThresh) {
      return <Badge tone="warning">{`Below threshold (${safeInventory})`}</Badge>;
    }
    return <Badge tone="success">{`OK (${safeInventory})`}</Badge>;
  };

  // Preview component for stock alert
  const StockAlertPreview = () => {
    const previewMessage = lowStockMessage.replace('{{qty}}', '3');
    
    const getPreviewStyle = () => {
      // Animation für alle Styles
      const animationStyle = stockCounterAnimation === 'none' ? 'none' : 
                            stockCounterAnimation === 'pulse' ? 'scarcityPulse 2s infinite' :
                            stockCounterAnimation === 'bounce' ? 'urgifyBounce 1.2s infinite' :
                            stockCounterAnimation === 'shake' ? 'criticalShake 0.5s infinite' : 'scarcityPulse 2s infinite';

      // Nur für Custom Style alle Eigenschaften setzen
      if (stockAlertStyle === "custom") {
        return {
          background: backgroundColor,
          color: textColor,
          fontSize: fontSize,
          animation: animationStyle,
        };
      }

      // Für vordefinierte Styles nur Animation setzen, Rest macht CSS
      return {
        animation: animationStyle,
      };
    };

    return (
      <div style={{ 
        padding: '20px', 
        border: '1px solid #e1e3e5', 
        borderRadius: '8px',
        backgroundColor: '#f6f6f7',
        marginTop: '10px'
      }}>
        <Text variant="headingSm" as="h3">
          Preview:
        </Text>
        <div 
          className={`urgify-stock-alert urgify-stock-alert--${stockAlertStyle}`}
          style={getPreviewStyle()}
        >
          <span className="urgify-stock-alert__text">
            {previewMessage}
          </span>
        </div>
      </div>
    );
  };

  // Remove error handling since error is not in loader data anymore

  const toastMarkup = toastActive ? (
    <Toast
      content="Settings saved successfully!"
      duration={3000}
      onDismiss={() => setToastActive(false)}
    />
  ) : null;

  return (
    <Frame>
      <Page>
        <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Stock Alert Settings
              </Text>
              
              <StockAlertPreview />
              
              <FormLayout>
                <Checkbox
                  label="Enable Stock Alerts"
                  checked={isEnabled}
                  onChange={handleEnabledChange}
                />
                
                <TextField
                  label="Stock Alert Threshold"
                  value={globalThreshold}
                  onChange={handleGlobalThresholdChange}
                  type="number"
                  autoComplete="off"
                  helpText="Show alert when inventory is below this number"
                />
                
                <TextField
                  label="Stock Alert Message"
                  value={lowStockMessage}
                  onChange={(value) => {
                    setLowStockMessage(value);
                    setIsDirty(true);
                  }}
                  autoComplete="off"
                  helpText="Use {{qty}} as placeholder for quantity"
                />
                
                <Select
                  label="Animation"
                  options={[
                    { label: "None", value: "none" },
                    { label: "Pulse", value: "pulse" },
                    { label: "Shake", value: "shake" },
                    { label: "Bounce", value: "bounce" },
                  ]}
                  value={stockCounterAnimation}
                  onChange={(value) => {
                    setStockCounterAnimation(value);
                    setIsDirty(true);
                  }}
                />
                
                <Select
                  label="Position"
                  options={[
                    { label: "Above Add to Cart", value: "above" },
                    { label: "Below Add to Cart", value: "below" },
                  ]}
                  value={stockCounterPosition}
                  onChange={(value) => {
                    setStockCounterPosition(value);
                    setIsDirty(true);
                  }}
                />
                
                <Select
                  label="Stock Alert Style"
                  options={[
                    { label: "Spectacular", value: "spectacular" },
                    { label: "Brutalist Bold", value: "brutalist" },
                    { label: "Glassmorphism", value: "glassmorphism" },
                    { label: "Neumorphism", value: "neumorphism" },
                    { label: "Custom", value: "custom" },
                  ]}
                  value={stockAlertStyle}
                  onChange={(value) => {
                    setStockAlertStyle(value);
                    setIsDirty(true);
                  }}
                />
                
                {stockAlertStyle === "custom" && (
                  <>
                    <TextField
                      label="Font Size"
                      value={fontSize}
                      onChange={(value) => {
                        setFontSize(value);
                        setIsDirty(true);
                      }}
                      autoComplete="off"
                      helpText="e.g., 18px, 1.2rem"
                    />
                    
                    <TextField
                      label="Text Color"
                      value={textColor}
                      onChange={(value) => {
                        setTextColor(value);
                        setIsDirty(true);
                      }}
                      autoComplete="off"
                      helpText="e.g., #ffffff, red"
                    />
                    
                    <TextField
                      label="Background Color"
                      value={backgroundColor}
                      onChange={(value) => {
                        setBackgroundColor(value);
                        setIsDirty(true);
                      }}
                      autoComplete="off"
                      helpText="e.g., #e74c3c, red"
                    />
                  </>
                )}
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Products Below Threshold ({lowStockProducts.length})
              </Text>
              
              {lowStockProducts.length === 0 ? (
                <Text as="p">No products below the threshold of {globalThreshold}</Text>
              ) : (
                <List>
                  {lowStockProducts.map((product: any) => (
                    <List.Item key={product.id}>
                      <InlineStack gap="200" align="space-between">
                        <Text as="span">{product.title}</Text>
                        {getStockBadge(product.totalInventory)}
                      </InlineStack>
                    </List.Item>
                  ))}
                </List>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      
      {isDirty && (
        <ContextualSaveBar
          message="Unsaved changes"
          saveAction={{
            onAction: handleSaveSettings,
            loading: fetcher.state === 'submitting',
            content: 'Save',
          }}
          discardAction={{
            onAction: () => {
              // Reset to original values
              setGlobalThreshold(String(settings.global_threshold || 5));
              setLowStockMessage(String(settings.low_stock_message || "Only {{qty}} left in stock!"));
              setIsEnabled(Boolean(settings.stock_alert_enabled));
              setFontSize(String(settings.font_size || "18px"));
              setTextColor(String(settings.text_color || "#ffffff"));
              setBackgroundColor(String(settings.background_color || "#e74c3c"));
              setStockCounterAnimation(String(settings.stock_counter_animation || "pulse"));
              setStockCounterPosition(String(settings.stock_counter_position || "above"));
              setStockAlertStyle(String(settings.stock_alert_style || "spectacular"));
              setShowForAllProducts(Boolean(settings.show_for_all_products));
              setShowBasedOnInventory(Boolean(settings.show_based_on_inventory));
              setShowOnlyBelowThreshold(Boolean(settings.show_only_below_threshold));
              setCustomThreshold(String(settings.custom_threshold || "5"));
              setIsDirty(false);
            },
            content: 'Discard',
          }}
          alignContentFlush
        />
      )}
      
      </Page>
      {toastMarkup}
    </Frame>
  );
}
