import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { Card, Page, Layout, Text, Button, Banner, List, Badge, BlockStack, InlineStack, InlineGrid, Select, TextField, FormLayout, Form, Divider, Checkbox, Box, RadioButton, ChoiceList, Tabs, ButtonGroup, Toast, ContextualSaveBar, ColorPicker, Popover } from "@shopify/polaris";
import { useState, useCallback, useEffect, useRef } from "react";

// Convert Polaris HSB (HSV) to RGBA string recognized by CSS
function hsbToRgbaString(color: { hue: number; saturation: number; brightness: number; alpha?: number }) {
  const hue = color.hue ?? 0;
  const sRaw = color.saturation ?? 0;
  const vRaw = color.brightness ?? 0;
  const alpha = color.alpha ?? 1;
  const s = sRaw > 1 ? sRaw / 100 : sRaw;
  const v = vRaw > 1 ? vRaw / 100 : vRaw;
  const C = v * s;
  const X = C * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - C;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hue >= 0 && hue < 60) { r1 = C; g1 = X; b1 = 0; }
  else if (hue < 120) { r1 = X; g1 = C; b1 = 0; }
  else if (hue < 180) { r1 = 0; g1 = C; b1 = X; }
  else if (hue < 240) { r1 = 0; g1 = X; b1 = C; }
  else if (hue < 300) { r1 = X; g1 = 0; b1 = C; }
  else { r1 = C; g1 = 0; b1 = X; }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Fetch shop metafields for stock alert settings
    const metafieldsResponse = await admin.graphql(`
      query getShopMetafields {
        shop {
          metafields(first: 10, namespace: "urgify") {
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
    
    // Parse metafields into settings
    const settings = {
      stock_alert_enabled: metafields.find(m => m.key === "stock_alert_enabled")?.value === "true" || false,
      global_threshold: parseInt(metafields.find(m => m.key === "global_threshold")?.value || "5"),
      low_stock_message: metafields.find(m => m.key === "low_stock_message")?.value || "Only {{qty}} left in stock!",
      font_size: metafields.find(m => m.key === "font_size")?.value || "18px",
      text_color: metafields.find(m => m.key === "text_color")?.value || "#ffffff",
      background_color: metafields.find(m => m.key === "background_color")?.value || "#e74c3c",
      stock_counter_animation: metafields.find(m => m.key === "stock_counter_animation")?.value || "pulse",
      stock_counter_position: metafields.find(m => m.key === "stock_counter_position")?.value || "above",
      show_for_all_products: metafields.find(m => m.key === "show_for_all_products")?.value === "true" || false,
      show_based_on_inventory: metafields.find(m => m.key === "show_based_on_inventory")?.value === "true" || false,
      show_only_below_threshold: metafields.find(m => m.key === "show_only_below_threshold")?.value === "true" || true,
      custom_threshold: parseInt(metafields.find(m => m.key === "custom_threshold")?.value || "5"),
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

export default function StockAlerts() {
  const { settings, products, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  
  // Safe defaults to prevent undefined errors
  const safeSettings = settings || {
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
    stock_alert_enabled: false,
    stock_alert_low_style: "animated",
    stock_alert_critical_style: "animated"
  };
  
  const [globalThreshold, setGlobalThreshold] = useState(String(safeSettings.global_threshold || 5));
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [lowStockMessage, setLowStockMessage] = useState(String(safeSettings.low_stock_message || "Only {{qty}} left in stock!"));
  // Single alert: one message only
  const [criticalStockMessage, setCriticalStockMessage] = useState("");
  const [isEnabled, setIsEnabled] = useState(Boolean(safeSettings.stock_alert_enabled));
  const [toastActive, setToastActive] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const initialValuesRef = useRef({
    globalThreshold: String(safeSettings.global_threshold || 5),
    lowStockMessage: String(safeSettings.low_stock_message || "Only {{qty}} left in stock!"),
    isEnabled: Boolean(safeSettings.stock_alert_enabled),
    fontSize: String(safeSettings.font_size || "18px"),
    textColor: String(safeSettings.text_color || "#ffffff"),
    backgroundColor: String(safeSettings.background_color || "#e74c3c"),
    showForAllProducts: Boolean(safeSettings.show_for_all_products),
    showBasedOnInventory: Boolean(safeSettings.show_based_on_inventory),
    showOnlyBelowThreshold: Boolean(safeSettings.show_only_below_threshold),
    customThreshold: String(safeSettings.custom_threshold || "5"),
    stockCounterAnimation: String(safeSettings.stock_counter_animation || "pulse"),
    stockCounterPosition: String(safeSettings.stock_counter_position || "above"),
  });
  // Styles unified by CSS variables; style presets removed
  const [selectedTab, setSelectedTab] = useState(0);
  const [fontSize, setFontSize] = useState(String(safeSettings.font_size || "18px"));
  const [textColor, setTextColor] = useState(String(safeSettings.text_color || "#ffffff"));
  const [backgroundColor, setBackgroundColor] = useState(String(safeSettings.background_color || "#e74c3c"));
  const [textColorHSB, setTextColorHSB] = useState({hue: 150, saturation: 0.0, brightness: 1.0, alpha: 1});
  const [bgColorHSB, setBgColorHSB] = useState({hue: 0, saturation: 0.8, brightness: 0.9, alpha: 1});
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [showForAllProducts, setShowForAllProducts] = useState(Boolean(safeSettings.show_for_all_products));
  const [showBasedOnInventory, setShowBasedOnInventory] = useState(Boolean(safeSettings.show_based_on_inventory));
  const [showOnlyBelowThreshold, setShowOnlyBelowThreshold] = useState(Boolean(safeSettings.show_only_below_threshold));
  const [customThreshold, setCustomThreshold] = useState(String(safeSettings.custom_threshold || "5"));
  const [stockCounterAnimation, setStockCounterAnimation] = useState(String(safeSettings.stock_counter_animation || "pulse"));
  // Shake removed
  const [stockCounterPosition, setStockCounterPosition] = useState(String(safeSettings.stock_counter_position || "above"));

  const safeProducts = Array.isArray(products) ? products : [];
  const lowStockProducts = safeProducts.filter((product: any) => {
    const inventory = product?.totalInventory || 0;
    const threshold = parseInt(globalThreshold) || 5;
    return inventory <= threshold;
  });
  // Single alert: no separate critical list

  const handleGlobalThresholdChange = useCallback((value: string) => {
    setGlobalThreshold(value);
    setIsDirty(true);
  }, []);

  // No critical threshold


  const handleEnabledChange = useCallback((checked: boolean) => {
    setIsEnabled(checked);
    setIsDirty(true);
  }, []);

  // Style presets removed

  const handleTabChange = useCallback((selectedTabIndex: number) => {
    setSelectedTab(selectedTabIndex);
  }, []);

  const handleInventoryDisplayChange = useCallback((value: string) => {
    setShowForAllProducts(value === "all");
    setShowBasedOnInventory(value === "inventory");
    setShowOnlyBelowThreshold(value === "threshold");
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

  // Show success toast when save is successful and reset dirty state
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setToastActive(true);
      const timer = setTimeout(() => setToastActive(false), 4000);
      setIsDirty(false);
      // Update initialValuesRef with current state values
      initialValuesRef.current = {
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
      };
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

  const tabs = [
    {
      id: 'appearance-rules',
      content: 'Appearance rules',
      panelID: 'appearance-rules-panel',
    },
    {
      id: 'stock-counter-text',
      content: 'Stock counter text',
      panelID: 'stock-counter-text-panel',
    },
  ];

  // Defensive guard: Avoid rendering if any Polaris component import is undefined
  const polarisComponents = {
    Page,
    Card,
    Tabs,
    BlockStack,
    InlineStack,
    InlineGrid,
    Select,
    TextField,
    Badge,
    Banner,
    Button,
    Text,
    Checkbox,
    Box,
    RadioButton,
    ButtonGroup,
    Popover,
  } as const;
  const missingComponents = Object.entries(polarisComponents)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingComponents.length > 0) {
    console.error("[Urgify] Missing Polaris components:", missingComponents);
    return (
      <Page title="Urgify Stock Alerts" subtitle="Loading error">
        <Box padding="400">
          <Banner tone="critical">
            <p>Some UI components failed to load: {missingComponents.join(", ")}</p>
            <p>Please refresh the page. If the error persists, contact support.</p>
          </Banner>
        </Box>
      </Page>
    );
  }

  return (
    <Page
      title="Create urgency to buy with smart Inventory-Aware customizable alert targeting"
      subtitle="Urgify Stock Alerts"
    >
      <BlockStack gap="800">
        {error && (
          <Banner tone="critical">
            <p>Error loading data: {error}</p>
            <p>Please check your app permissions and try refreshing the page.</p>
          </Banner>
        )}

        {toastActive && (
          <Toast content="Settings saved" onDismiss={() => setToastActive(false)} duration={4000} />
        )}

        <Card>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
            <Box padding="200">
              {selectedTab === 1 && (
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">
                    Stock alert
                  </Text>
                  
                  {/* Stock Counter Preview */}
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Stock counter preview</Text>
                    
                    <div style={{ 
                      border: '1px solid #e1e3e5', 
                      borderRadius: '8px', 
                      padding: '12px',
                      backgroundColor: '#f6f6f7'
                    }}>
                      <div style={{ marginBottom: '16px' }}>
                        <Text variant="bodyMd" fontWeight="semibold">
                          Product Name Example
                        </Text>
                        <Text variant="bodyMd" tone="subdued">
                          $29.99
                        </Text>
                      </div>
                      
                      {/* Single Stock Alert Preview (mirrors theme css variables) */}
                      {globalThreshold > 0 && (
                        <>
                          {stockCounterPosition !== 'below' && (
                            <div 
                              style={{
                                marginBottom: '12px',
                                padding: '1.5rem 2rem',
                                border: `4px solid ${textColor}`,
                                borderRadius: '12px',
                                fontWeight: '800',
                                fontSize: fontSize,
                                backgroundColor: backgroundColor,
                                background: backgroundColor,
                                backgroundImage: 'none',
                                color: textColor,
                                textAlign: 'center',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                animation: (() => {
                                  if (stockCounterAnimation === 'bounce') return 'urgifyBounce 1.2s infinite';
                                  if (stockCounterAnimation === 'shake') return 'criticalShake 0.5s infinite';
                                  if (stockCounterAnimation === 'none') return 'none';
                                  return 'scarcityPulse 2s infinite';
                                })(),
                                boxShadow: '0 8px 25px rgba(231, 76, 60, 0.5)',
                                position: 'relative',
                                overflow: 'hidden',
                                fontFamily: "'Arial Black', Arial, sans-serif",
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              } as React.CSSProperties}
                            >
                              <span className="urgify-stock-alert__text">
                                {lowStockMessage.replace('{{qty}}', String(globalThreshold))}
                              </span>
                            </div>
                          )}

                          <Button size="large">Add to cart</Button>

                          {stockCounterPosition === 'below' && (
                            <div 
                              style={{
                                marginTop: '12px',
                                padding: '1.5rem 2rem',
                                border: `4px solid ${textColor}`,
                                borderRadius: '12px',
                                fontWeight: '800',
                                fontSize: fontSize,
                                backgroundColor: backgroundColor,
                                background: backgroundColor,
                                backgroundImage: 'none',
                                color: textColor,
                                textAlign: 'center',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                animation: (() => {
                                  if (stockCounterAnimation === 'bounce') return 'urgifyBounce 1.2s infinite';
                                  if (stockCounterAnimation === 'shake') return 'criticalShake 0.5s infinite';
                                  if (stockCounterAnimation === 'none') return 'none';
                                  return 'scarcityPulse 2s infinite';
                                })(),
                                boxShadow: '0 8px 25px rgba(231, 76, 60, 0.5)',
                                position: 'relative',
                                overflow: 'hidden',
                                fontFamily: "'Arial Black', Arial, sans-serif",
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              } as React.CSSProperties}
                            >
                              <span className="urgify-stock-alert__text">
                                {lowStockMessage.replace('{{qty}}', String(globalThreshold))}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      
                    </div>

                    
                  </BlockStack>

                  <InlineGrid columns={{ xs: "1fr", md: "2fr 1fr 1fr" }} gap="300">
                    <TextField
                      label="Stock alert message template"
                      value={lowStockMessage}
                      onChange={(v) => { setLowStockMessage(v); setIsDirty(true); }}
                      placeholder="Only {{qty}} left in stock!"
                      helpText="Use {{qty}} to display the current stock level"
                    />

                    <TextField
                      label="Font size"
                      value={fontSize}
                      onChange={(v) => { setFontSize(v); setIsDirty(true); }}
                      helpText="Examples: 14px, 1rem"
                    />

                    <Box>
                      <Text>Text color</Text>
                      <Popover
                        active={textColorOpen}
                        autofocusTarget="none"
                        preferredAlignment="left"
                        onClose={() => setTextColorOpen(false)}
                        activator={
                          <Button onClick={() => setTextColorOpen((p) => !p)} disclosure>
                            Pick text color
                          </Button>
                        }
                      >
                        <Box padding="300" minWidth="260px">
                          <ColorPicker
                            onChange={(v) => {
                              setTextColorHSB(v);
                              setTextColor(hsbToRgbaString(v as any));
                              setIsDirty(true);
                            }}
                            color={textColorHSB}
                            allowAlpha
                            fullWidth
                          />
                        </Box>
                      </Popover>
                    </Box>
                  </InlineGrid>


                  {/* Advanced Styling Options */}
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Advanced styling options</Text>
                    <InlineStack gap="300" wrap>
                      <Select
                        label="Stock counter animation"
                        options={[
                          { label: "Pulse", value: "pulse" },
                          { label: "Shake", value: "shake" },
                          { label: "Bounce", value: "bounce" },
                          { label: "None", value: "none" }
                        ]}
                        value={stockCounterAnimation}
                        onChange={(v) => { setStockCounterAnimation(v); setIsDirty(true); }}
                      />
                      
                      {/* Shake option removed as requested */}
                      
                      <Select
                        label="Position on product page"
                        options={[
                          { label: "Above Add to Cart", value: "above" },
                          { label: "Below Add to Cart", value: "below" }
                        ]}
                        value={stockCounterPosition === 'custom' ? 'above' : stockCounterPosition}
                        onChange={(v) => { setStockCounterPosition(v); setIsDirty(true); }}
                      />

                      <Box>
                        <Text>Background color</Text>
                        <Popover
                          active={bgColorOpen}
                          autofocusTarget="none"
                          preferredAlignment="left"
                          onClose={() => setBgColorOpen(false)}
                          activator={
                            <Button onClick={() => setBgColorOpen((p) => !p)} disclosure>
                              Pick background color
                            </Button>
                          }
                        >
                          <Box padding="300" minWidth="260px">
                            <ColorPicker
                              onChange={(v) => {
                                const next = { ...v, alpha: 1 } as any;
                                setBgColorHSB(next);
                                setBackgroundColor(hsbToRgbaString(next));
                                setIsDirty(true);
                              }}
                              color={bgColorHSB}
                              fullWidth
                            />
                          </Box>
                        </Popover>
                      </Box>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              )}

              {selectedTab === 0 && (
                <BlockStack gap="300">
                  <Text variant="headingLg" as="h2">
                    Appearance rules
                  </Text>
                  
                  <BlockStack gap="300">
                    <Checkbox
                      label="Enable stock alerts"
                      checked={isEnabled}
                      onChange={handleEnabledChange}
                      helpText="When enabled, stock alerts will be displayed on product pages"
                    />
                  </BlockStack>

                  {/* Inventory-based Appearance */}
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Inventory-based appearance</Text>
                    <ChoiceList
                      title="Show stock counter"
                      choices={[
                        {label: "For all products", value: "all"},
                        {label: "Only for products below threshold", value: "threshold"}
                      ]}
                      selected={[showForAllProducts ? 'all' : 'threshold']}
                      onChange={(v) => handleInventoryDisplayChange(v[0] as string)}
                    />
                    {!showForAllProducts && (
                      <InlineStack gap="200" align="start">
                        <TextField
                          label="Threshold"
                          value={customThreshold}
                          onChange={setCustomThreshold}
                          type="number"
                          suffix="inventory in stock"
                        />
                      </InlineStack>
                    )}
                  </BlockStack>

                  {/* Stock Overview */}
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">
                      Current inventory status
                    </Text>
                    
                    <InlineStack align="space-between">
                      <Text variant="bodyMd">
                        {safeProducts.length} total products
                      </Text>
                    </InlineStack>

                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text variant="headingSm" as="h4">
                          Below threshold ({lowStockProducts.length})
                        </Text>
                        <Badge status="warning">≤ {globalThreshold} items</Badge>
                      </InlineStack>

                      {lowStockProducts.length > 0 ? (
                        <List type="bullet">
                          {lowStockProducts.slice(0, 5).map((product: any) => (
                            <List.Item key={product.id}>
                              <InlineStack align="space-between" blockAlign="center">
                                <Text variant="bodyMd">{product.title}</Text>
                                {getStockBadge(product.totalInventory)}
                              </InlineStack>
                            </List.Item>
                          ))}
                        </List>
                      ) : (
                        <Text variant="bodyMd" tone="subdued">
                          No products below the threshold
                        </Text>
                      )}
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              )}
            </Box>
          </Tabs>
        </Card>

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
                const v = initialValuesRef.current;
                setGlobalThreshold(v.globalThreshold);
                setLowStockMessage(v.lowStockMessage);
                setIsEnabled(Boolean(v.isEnabled));
                setFontSize(v.fontSize);
                setTextColor(v.textColor);
                setBackgroundColor(v.backgroundColor);
                setStockCounterAnimation(v.stockCounterAnimation);
                setStockCounterPosition(v.stockCounterPosition);
                setShowForAllProducts(v.showForAllProducts);
                setShowBasedOnInventory(v.showBasedOnInventory);
                setShowOnlyBelowThreshold(v.showOnlyBelowThreshold);
                setCustomThreshold(v.customThreshold);
                setIsDirty(false);
              },
              content: 'Discard',
            }}
            alignContentFlush
          />
        )}
      </BlockStack>
    </Page>
  );
}
