import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { Card, Page, Layout, Text, Button, Banner, List, Badge, BlockStack, InlineStack, InlineGrid, Select, TextField, FormLayout, Form, Divider, Checkbox, Box, RadioButton, ChoiceList, Tabs, ButtonGroup, Toast, ContextualSaveBar, ColorPicker, Popover } from "@shopify/polaris";
import { useState, useCallback, useEffect, useRef } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Fetch shop metafields for stock alert settings
    const metafieldsResponse = await admin.graphql(`
      query getShopMetafields {
        shop {
          metafields(first: 20, namespace: "urgify") {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `);

    const metafieldsData = await metafieldsResponse.json();
    const metafields = metafieldsData.data?.shop?.metafields?.edges?.map((edge: any) => edge.node) || [];
    
    // Parse metafields into settings - prioritize new keys, fallback to old keys
    const settings = {
      stock_alert_enabled: metafields.find(m => m.key === "stock_alert_enabled")?.value === "true" || false,
      global_threshold: parseInt(
        metafields.find(m => m.key === "global_threshold")?.value || 
        metafields.find(m => m.key === "stock_alert_threshold")?.value || 
        "5"
      ),
      low_stock_message: 
        metafields.find(m => m.key === "low_stock_message")?.value || 
        metafields.find(m => m.key === "stock_alert_low_text")?.value || 
        metafields.find(m => m.key === "stock_alert_text")?.value || 
        "Only {{qty}} left in stock!",
      font_size: 
        metafields.find(m => m.key === "font_size")?.value || 
        metafields.find(m => m.key === "stock_alert_font_size")?.value || 
        "18px",
      text_color: 
        metafields.find(m => m.key === "text_color")?.value || 
        metafields.find(m => m.key === "stock_alert_text_color")?.value || 
        "#ffffff",
      background_color: 
        metafields.find(m => m.key === "background_color")?.value || 
        metafields.find(m => m.key === "stock_alert_background_color")?.value || 
        "#e74c3c",
      stock_counter_animation: 
        metafields.find(m => m.key === "stock_counter_animation")?.value || 
        metafields.find(m => m.key === "stock_alert_animation")?.value || 
        "pulse",
      stock_counter_position: 
        metafields.find(m => m.key === "stock_counter_position")?.value || 
        metafields.find(m => m.key === "stock_alert_position")?.value || 
        "above",
      show_for_all_products: 
        metafields.find(m => m.key === "show_for_all_products")?.value === "true" || 
        metafields.find(m => m.key === "stock_alert_show_all_products")?.value === "true" || 
        false,
      show_based_on_inventory: 
        metafields.find(m => m.key === "show_based_on_inventory")?.value === "true" || 
        metafields.find(m => m.key === "stock_alert_show_based_inventory")?.value === "true" || 
        false,
      show_only_below_threshold: 
        metafields.find(m => m.key === "show_only_below_threshold")?.value === "true" || 
        metafields.find(m => m.key === "stock_alert_show_only_below_threshold")?.value === "true" || 
        true,
      custom_threshold: parseInt(
        metafields.find(m => m.key === "custom_threshold")?.value || 
        metafields.find(m => m.key === "stock_alert_custom_threshold")?.value || 
        "5"
      ),
    };

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
    });
  }
};

export default function StockAlertsSimple() {
  const { settings, products, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  
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
      { method: "POST", action: "/api/stock-alert-settings", encType: "application/x-www-form-urlencoded" }
    );
  }, [globalThreshold, lowStockMessage, isEnabled, fontSize, textColor, backgroundColor, stockCounterAnimation, stockCounterPosition, showForAllProducts, showBasedOnInventory, showOnlyBelowThreshold, customThreshold, fetcher]);

  // Show success toast when save is successful
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setToastActive(true);
      const timer = setTimeout(() => setToastActive(false), 4000);
      setIsDirty(false);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data]);

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

  return (
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
      
      {toastActive && (
        <Toast
          content="Settings saved successfully!"
          onDismiss={() => setToastActive(false)}
        />
      )}
    </Page>
  );
}
