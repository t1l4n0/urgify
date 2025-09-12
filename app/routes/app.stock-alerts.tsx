import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  Frame,
  Card,
  Page,
  Layout,
  Text,
  Banner,
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

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
    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      throw new Error(`GraphQL errors: ${data.errors.map((e: any) => e.message).join(', ')}`);
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
  const { admin } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
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

    const globalThreshold = getStr("globalThreshold", "5");
    const lowStockMessage = getStr("lowStockMessage", "Only {{qty}} left in stock!");
    const isEnabled = getStr("isEnabled", "false");
    const fontSize = getStr("fontSize", "18px");
    const textColor = getStr("textColor", "#ffffff");
    const backgroundColor = getStr("backgroundColor", "#e74c3c");
    const showForAllProducts = getStr("showForAllProducts", "false");
    const showBasedOnInventory = getStr("showBasedOnInventory", "true");
    const showOnlyBelowThreshold = getStr("showOnlyBelowThreshold", "false");
    const customThreshold = getStr("customThreshold", "100");
    const stockCounterAnimation = getStr("stockCounterAnimation", "pulse");
    const stockCounterPosition = getStr("stockCounterPosition", "above");

    console.log("Saving Stock Alert Settings to Shop Metafields:", {
      globalThreshold,
      lowStockMessage,
      isEnabled,
      fontSize,
      textColor,
      backgroundColor,
      stockCounterAnimation,
      stockCounterPosition,
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
      show_for_all_products: showForAllProducts === "true",
      show_based_on_inventory: showBasedOnInventory === "true",
      show_only_below_threshold: showOnlyBelowThreshold === "true",
      custom_threshold: parseInt(customThreshold) || 100,
    };

    const metafields = [
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "stock_alert_config",
        value: JSON.stringify(settings),
        type: "json"
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
    return json({
      error: "Failed to save settings: " + (error as Error).message
    }, { status: 500 });
  }
};

export default function StockAlertsSimple() {
  const { settings, products, error } = useLoaderData<typeof loader>();
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
        showForAllProducts: showForAllProducts.toString(),
        showBasedOnInventory: showBasedOnInventory.toString(),
        showOnlyBelowThreshold: showOnlyBelowThreshold.toString(),
        customThreshold,
      },
      { method: "POST", action: "/app/stock-alerts", encType: "application/x-www-form-urlencoded" }
    );
  }, [globalThreshold, lowStockMessage, isEnabled, fontSize, textColor, backgroundColor, stockCounterAnimation, stockCounterPosition, showForAllProducts, showBasedOnInventory, showOnlyBelowThreshold, customThreshold, fetcher]);

  // Show success toast when save is successful (nur Rising-Edge)
  useEffect(() => {
    // Bei neuem Submit/Reload Gate zurücksetzen
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      shownRef.current = false;
      return;
    }

    if (fetcher.state === "idle" && fetcher.data?.success && !shownRef.current) {
      shownRef.current = true;          // einmalig pro Erfolg
      setToastActive(true);
      setIsDirty(false);
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data?.success, revalidator]);

  const getStockBadge = (inventory: number) => {
    const safeInventory = Number(inventory) || 0;
    const globalThresh = parseInt(globalThreshold) || 5;
    if (safeInventory <= globalThresh) {
      return <Badge status="warning">Below threshold ({safeInventory})</Badge>;
    }
    return <Badge status="success">OK ({safeInventory})</Badge>;
  };

  if (error) {
    return (
      <Page>
        <Banner status="critical">
          <p>Error loading data: {error}</p>
        </Banner>
      </Page>
    );
  }

  const toastMarkup = toastActive ? (
    <Toast
      content={fetcher.data?.message ?? "Settings saved successfully!"}
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
                  helpText="Show alert when inventory is below this number"
                />
                
                <TextField
                  label="Stock Alert Message"
                  value={lowStockMessage}
                  onChange={(value) => {
                    setLowStockMessage(value);
                    setIsDirty(true);
                  }}
                  helpText="Use {{qty}} as placeholder for quantity"
                />
                
                <TextField
                  label="Font Size"
                  value={fontSize}
                  onChange={(value) => {
                    setFontSize(value);
                    setIsDirty(true);
                  }}
                  helpText="e.g., 18px, 1.2rem"
                />
                
                <TextField
                  label="Text Color"
                  value={textColor}
                  onChange={(value) => {
                    setTextColor(value);
                    setIsDirty(true);
                  }}
                  helpText="e.g., #ffffff, red"
                />
                
                <TextField
                  label="Background Color"
                  value={backgroundColor}
                  onChange={(value) => {
                    setBackgroundColor(value);
                    setIsDirty(true);
                  }}
                  helpText="e.g., #e74c3c, red"
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
                <Text>No products below the threshold of {globalThreshold}</Text>
              ) : (
                <List>
                  {lowStockProducts.map((product: any) => (
                    <List.Item key={product.id}>
                      <InlineStack gap="200" align="space-between">
                        <Text>{product.title}</Text>
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
