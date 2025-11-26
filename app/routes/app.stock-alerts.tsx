import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type SerializeFrom,
} from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager, hasAccessToStockAlerts } from "../utils/billing";
import { z } from "zod";
import { shouldRateLimit, checkShopifyRateLimit } from "../utils/rateLimiting";
import { ViewPlansLink } from "../components/ViewPlansLink";
// Polaris Web Components - no imports needed, components are global
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import stockAlertStyles from "../styles/stock-alert-preview.css?url";

export const links = () => [
  { rel: "stylesheet", href: stockAlertStyles }
];

// Validation schema for stock alert settings - simplified
const stockAlertSettingsSchema = z.object({
  globalThreshold: z.string().default("5"),
  lowStockMessage: z.string().default("Only {{qty}} left in stock!"),
  isEnabled: z.string().default("false"),
  fontSize: z.string().default("18px"),
  textColor: z.string().default("#ffffff"),
  backgroundColor: z.string().default("#e74c3c"),
  showForAllProducts: z.string().default("false"),
  showBasedOnInventory: z.string().default("false"),
  showOnlyBelowThreshold: z.string().default("false"),
  customThreshold: z.string().default("100"),
  stockCounterAnimation: z.string().default("pulse"),
  stockCounterPosition: z.string().default("above"),
  stockAlertStyle: z.string().default("spectacular"),
  locationId: z.string().optional().default(""),
});

type StockAlertsLoaderData = SerializeFrom<typeof loader>;
type StockAlertsSuccess = Extract<StockAlertsLoaderData, { settings: unknown }>;

export default function StockAlertsSimple() {
  const loaderData = useLoaderData<StockAlertsLoaderData>();

  if (!("settings" in loaderData)) {
    const message =
      loaderData.error ||
      "Stock Alerts feature requires an active paid plan. Please upgrade your subscription to access this feature.";

    return <StockAlertsAccessRequired message={message} />;
  }

  return <StockAlertsForm data={loaderData} />;
}

function StockAlertsAccessRequired({ message }: { message: string }) {
  return (
    <s-page heading="Stock Alert Settings">
      <s-section>
        <s-banner tone="warning" heading="Subscription Required">
          <s-paragraph>{message}</s-paragraph>
          <div style={{ marginTop: "12px" }}>
            <ViewPlansLink />
          </div>
        </s-banner>
      </s-section>
    </s-page>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let primaryLocationId: string | null = null;
  let primaryLocationName: string | null = null;
  let shopId: string | null = null;

  // Sync subscription status to metafield first
  try {
    const shopResponse = await admin.graphql(`
      query getShop {
        shop {
          id
          primaryLocation {
            id
            name
          }
        }
      }
    `);
    
    const shopData = await shopResponse.json();
    const shop = shopData.data?.shop;
    shopId = shop?.id || null;
    
    if (shop?.primaryLocation) {
      primaryLocationId = shop.primaryLocation.id;
      primaryLocationName = shop.primaryLocation.name || null;
    }
    
    if (shopId) {
      const { syncSubscriptionStatusToMetafield } = await import("../utils/billing");
      await syncSubscriptionStatusToMetafield(admin, shopId);
    }
  } catch (syncError) {
    console.error("Failed to sync subscription status:", syncError);
    // Continue with subscription check even if sync fails
  }

  // Check subscription status and feature access
  let hasActiveSubscription = false;
  let isTrialActive = false;
  let planHandle: string | null = null;
  let hasAccess = false;
  
  try {
    const billingManager = new BillingManager(session.shop, admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    hasActiveSubscription = subscriptionStatus.hasActiveSubscription;
    isTrialActive = subscriptionStatus.isTrialActive;
    planHandle = subscriptionStatus.planHandle;
    hasAccess = hasAccessToStockAlerts(planHandle);
  } catch (error) {
    console.error("Error checking subscription status:", error);
    // Continue without subscription check
  }
  
  // If user doesn't have access, return early with error message
  if (!hasAccess) {
    return json({
      error: "Stock Alerts feature requires an active paid plan. Please upgrade your subscription to access this feature.",
      hasAccess: false,
      planHandle,
    }, { 
      headers: { 
        "Cache-Control": "no-store" 
      } 
    });
  }
  
  // Continue with fetching settings, but mark subscription status in data
  
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
      location_id: "",
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

    const locationsResponse = await admin.graphql(`
      query getLocations {
        locations(first: 250) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `);

    const locationsData = await locationsResponse.json();
    if ((locationsData as any)?.errors?.length) {
      console.error(
        "GraphQL errors while fetching locations:",
        (locationsData as any).errors
      );
    }
    const parsedLocations =
      locationsData.data?.locations?.edges?.map((edge: any) => edge.node) || [];

    let productsPayload: Array<any> = [];
    const threshold = settings.global_threshold || 5;

    let selectedLocationId =
      settings.location_id ||
      primaryLocationId ||
      (parsedLocations[0]?.id ?? "");

    if (
      selectedLocationId &&
      !parsedLocations.some((loc: any) => loc.id === selectedLocationId)
    ) {
      selectedLocationId = parsedLocations[0]?.id || primaryLocationId || "";
    }

    let persistedLocationId = selectedLocationId;
    let responseLocationId = selectedLocationId;

    let resolvedLocationName =
      parsedLocations.find((loc: any) => loc.id === selectedLocationId)?.name ||
      primaryLocationName;

    if (selectedLocationId) {
      try {
        const locationInventory = await fetchInventoryByLocation(
          admin,
          selectedLocationId
        );
        if (!resolvedLocationName && locationInventory.locationName) {
          resolvedLocationName = locationInventory.locationName;
        }
        productsPayload = locationInventory.products.map((product) => {
          const variants = Array.isArray(product.variants) ? product.variants : [];
          const locationInventoryValue =
            typeof product.locationInventory === "number"
              ? product.locationInventory
              : variants.reduce((sum, variant) => {
                  const qty = getVariantQuantity(variant);
                  return sum + (Number.isFinite(qty) ? Math.max(qty, 0) : 0);
                }, 0);
          const lowStockVariants = variants.filter((variant) => {
            const qty = getVariantQuantity(variant);
            return qty > 0 && qty <= threshold;
          });
          const zeroInventory = locationInventoryValue <= 0;
          const lowStockByProduct = locationInventoryValue > 0 && locationInventoryValue <= threshold;
          return {
            ...product,
            variants,
            locationInventory: locationInventoryValue,
            lowStockVariantCount: lowStockVariants.length,
            zeroInventory,
            lowStockByProduct,
          };
        });
      } catch (inventoryError) {
        console.error("Error fetching location inventory:", inventoryError);
        responseLocationId = "";
        persistedLocationId = "";
        resolvedLocationName = null;
      }
    }

    if (productsPayload.length === 0) {
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
      productsPayload = products.map((product: any) => {
        const variantNodes = product.variants?.edges?.map((edge: any) => edge.node) || [];
        const lowStockVariants = variantNodes.filter((variant: any) => {
          const qty = getVariantQuantity(variant);
          return qty > 0 && qty <= threshold;
        });
        const totalInventory = product.totalInventory || 0;
        const zeroInventory = totalInventory <= 0;
        const lowStockByProduct = totalInventory > 0 && totalInventory <= threshold;
        return {
          id: product.id,
          title: product.title,
          handle: product.handle,
          totalInventory,
          locationInventory: totalInventory,
          variants: variantNodes,
          lowStockVariantCount: lowStockVariants.length,
          zeroInventory,
          lowStockByProduct,
        };
      });
    }

    const inventorySummary = createInventorySummary(productsPayload, threshold);

    settings = {
      ...settings,
      location_id: persistedLocationId ?? "",
    };

    if (
      shopId &&
      responseLocationId &&
      productsPayload.length > 0
    ) {
      try {
        await syncLowStockVariantCache(
          admin,
          shopId,
          responseLocationId,
          productsPayload,
          threshold
        );
      } catch (cacheError) {
        console.error("Failed to sync low stock variant cache:", cacheError);
      }
    }

    return json({
      settings,
      hasActiveSubscription,
      isTrialActive,
      hasAccess: true,
      products: productsPayload,
      locationName: resolvedLocationName,
      locations: parsedLocations,
      selectedLocationId: responseLocationId,
      inventorySummary,
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
        location_id: "",
      },
      hasActiveSubscription,
      isTrialActive,
      hasAccess: false,
      products: [], 
      error: "Failed to fetch data",
      locations: [],
      selectedLocationId: "",
      locationName: null,
      inventorySummary: createInventorySummary([], 5),
    }, { 
      headers: { 
        "Cache-Control": "no-store" 
      } 
    });
  }
};

type LocationInventoryVariant = {
  id: string;
  title: string;
  available: number;
};

type LocationInventoryProduct = {
  id: string;
  title: string;
  handle: string;
  totalInventory: number;
  locationInventory: number;
  variants: LocationInventoryVariant[];
};

async function fetchInventoryByLocation(admin: any, locationId: string) {
  const productsMap = new Map<string, LocationInventoryProduct>();
  let cursor: string | null = null;
  let hasNextPage = true;
  let locationName: string | null = null;

  while (hasNextPage) {
    const response: Response = await admin.graphql(
      `#graphql
        query inventoryLevelsByLocation($locationId: ID!, $cursor: String) {
          location(id: $locationId) {
            id
            name
            inventoryLevels(first: 250, after: $cursor) {
              edges {
                cursor
                node {
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  item {
                    variant {
                      id
                      title
                      product {
                        id
                        title
                        handle
                        totalInventory
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      {
        variables: {
          locationId,
          cursor,
        },
      }
    );

    const data: any = await response.json();

    if (data?.errors?.length) {
      throw new Error(
        `GraphQL errors: ${data.errors.map((e: any) => e.message).join(", ")}`
      );
    }

    const locationNode = data?.data?.location as any;
    if (!locationNode) {
      break;
    }

    if (!locationName) {
      locationName = locationNode.name || null;
    }

    const edges: any[] = locationNode?.inventoryLevels?.edges || [];
    edges.forEach((edge: any) => {
      let availableQuantity = 0;
      const quantitiesArr = edge?.node?.quantities;
      if (Array.isArray(quantitiesArr)) {
        const availableEntry = quantitiesArr.find(
          (entry: any) => entry?.name === "available"
        );
        if (
          availableEntry &&
          typeof availableEntry.quantity === "number" &&
          !Number.isNaN(availableEntry.quantity)
        ) {
          availableQuantity = availableEntry.quantity;
        }
      }

      const variantNode = edge?.node?.item?.variant;
      const product = variantNode?.product;

      if (!product) {
        return;
      }

      const productId = product.id;
      const variantId = variantNode?.id;
      if (!variantId) {
        return;
      }

      const existing =
        productsMap.get(productId) ||
        ({
          id: productId,
          title: product.title,
          handle: product.handle,
          totalInventory: product.totalInventory || 0,
          locationInventory: 0,
          variants: [],
        } as LocationInventoryProduct);

      existing.locationInventory += availableQuantity;
      const variantIndex = existing.variants.findIndex(
        (variant) => variant.id === variantId
      );
      if (variantIndex >= 0) {
        existing.variants[variantIndex].available = availableQuantity;
      } else {
        existing.variants.push({
          id: variantId,
          title: variantNode?.title || "Default",
          available: availableQuantity,
        });
      }
      productsMap.set(productId, existing);
    });

    const pageInfo = locationNode?.inventoryLevels?.pageInfo as any;
    hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor || null;
  }

  return {
    products: Array.from(productsMap.values()),
    locationName,
  };
}

function getVariantQuantity(variant: any): number {
  if (!variant || typeof variant !== "object") {
    return 0;
  }
  if (typeof variant.available === "number") {
    return variant.available;
  }
  if (typeof variant.availableQuantity === "number") {
    return variant.availableQuantity;
  }
  if (typeof variant.inventoryQuantity === "number") {
    return variant.inventoryQuantity;
  }
  if (typeof variant.inventory_quantity === "number") {
    return variant.inventory_quantity;
  }
  return 0;
}

function getProductInventoryValue(product: any): number {
  if (typeof product?.locationInventory === "number") {
    return product.locationInventory;
  }
  if (typeof product?.totalInventory === "number") {
    return product.totalInventory;
  }
  if (Array.isArray(product?.variants)) {
    return product.variants.reduce((sum: number, variant: any) => {
      const qty = getVariantQuantity(variant);
      return sum + (Number.isFinite(qty) ? Math.max(qty, 0) : 0);
    }, 0);
  }
  return 0;
}

function createInventorySummary(products: any[], threshold: number) {
  const summary = {
    totalProducts: products.length,
    lowStockProducts: 0,
    zeroInventoryProducts: 0,
    lowStockVariants: 0,
  };

  products.forEach((product) => {
    const inventoryValue = getProductInventoryValue(product);
    if (inventoryValue <= 0) {
      summary.zeroInventoryProducts += 1;
    } else if (inventoryValue <= threshold) {
      summary.lowStockProducts += 1;
    }

    const variants = Array.isArray(product?.variants) ? product.variants : [];
    variants.forEach((variant: any) => {
      const qty = getVariantQuantity(variant);
      if (qty > 0 && qty <= threshold) {
        summary.lowStockVariants += 1;
      }
    });
  });

  return summary;
}

function normalizeVariantId(rawId: any): string | null {
  if (rawId === null || rawId === undefined) {
    return null;
  }
  const idString = String(rawId);
  if (!idString) {
    return null;
  }
  const parts = idString.split("/");
  return parts[parts.length - 1] || idString;
}

async function syncLowStockVariantCache(
  admin: any,
  shopId: string,
  locationId: string,
  products: any[],
  threshold: number
) {
  if (!shopId || !locationId || products.length === 0) {
    return;
  }

  const MAX_VARIANTS = 1000;
  const variantEntries: Record<string, number> = {};

  for (const product of products) {
    if (Object.keys(variantEntries).length >= MAX_VARIANTS) {
      break;
    }

    const variantList = Array.isArray(product?.variants) ? product.variants : [];
    for (const variant of variantList) {
      if (Object.keys(variantEntries).length >= MAX_VARIANTS) {
        break;
      }
      const qty = getVariantQuantity(variant);
      const variantId = normalizeVariantId(variant?.id);
      if (!variantId || qty <= 0 || qty > threshold) {
        continue;
      }
      variantEntries[variantId] = qty;
    }
  }

  const payload = {
    locationId,
    threshold,
    updatedAt: new Date().toISOString(),
    variantCount: Object.keys(variantEntries).length,
    variants: variantEntries,
  };

  const response = await admin.graphql(
    `#graphql
      mutation syncStockAlertVariantCache($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "urgify",
            key: "stock_alert_variant_cache",
            value: JSON.stringify(payload),
            type: "json",
          },
        ],
      },
    }
  );

  const result = await response.json();
  const userErrors = result?.data?.metafieldsSet?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(
      `Failed to sync stock alert variant cache: ${userErrors
        .map((error: any) => error.message)
        .join(", ")}`
    );
  }
}

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
      locationId: getStr("locationId", ""),
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
      locationId,
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
      location_id: locationId,
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
      },
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "selected_location_id",
        value: settings.location_id || "",
        type: "single_line_text_field"
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

function StockAlertsForm({ data }: { data: StockAlertsSuccess }) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const { settings, products, locationName, locations, selectedLocationId, inventorySummary } = data;
  
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
  const [locationId, setLocationId] = useState(
    String(settings.location_id || selectedLocationId || "")
  );
  
  const [isDirty, setIsDirty] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const shownRef = useRef(false);        // Gate gegen erneutes Öffnen

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toastActive) {
      const timer = setTimeout(() => {
        setToastActive(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastActive]);

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
    setLocationId(String(settings.location_id || selectedLocationId || ""));
  }, [settings, selectedLocationId]);

  // Control save bar visibility programmatically
  useEffect(() => {
    const saveBar = document.getElementById('stock-alert-save-bar') as any;
    if (saveBar) {
      if (isDirty) {
        saveBar.show();
      } else {
        saveBar.hide();
      }
    }
  }, [isDirty]);

  // Responsive state for grid columns
  const [isMobile, setIsMobile] = useState(false);
  const stockAttemptsRef = useRef(0);
  
  // Check screen size on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Responsive grid layout for mobile - CSS handles most of it, this is a fallback
  useEffect(() => {
    stockAttemptsRef.current = 0; // Reset on change
    
    const updateGridLayout = () => {
      const grid = document.querySelector('.stock-alerts-grid') as HTMLElement;
      if (!grid || !grid.style) return;
      
      if (isMobile) {
        // Force single column via style
        grid.style.setProperty('grid-template-columns', '1fr', 'important');
        grid.style.setProperty('display', 'grid', 'important');
        
        // Remove the attribute that might be setting it
        grid.removeAttribute('gridTemplateColumns');
        
        // Make preview section appear first
        const sections = grid.querySelectorAll('s-section');
        if (sections.length >= 2) {
          // Find the preview section (contains the preview container)
          const previewSection = Array.from(sections).find((section: Element) => {
            return section.querySelector('.stock-alert-preview-sticky-container');
          }) as HTMLElement;
          
          if (previewSection && previewSection.style) {
            previewSection.style.setProperty('order', '-1', 'important');
            previewSection.style.setProperty('grid-column', '1', 'important');
            previewSection.style.setProperty('grid-row', '1', 'important');
          }
          
          // Ensure settings section appears second
          const settingsSection = Array.from(sections).find((section: Element) => {
            return !section.querySelector('.stock-alert-preview-sticky-container');
          }) as HTMLElement;
          
          if (settingsSection && settingsSection.style) {
            settingsSection.style.setProperty('order', '0', 'important');
            settingsSection.style.setProperty('grid-column', '1', 'important');
            settingsSection.style.setProperty('grid-row', '2', 'important');
          }
          
          // Ensure all sections take full width
          sections.forEach((section: any) => {
            if (section.style) {
              section.style.setProperty('width', '100%', 'important');
              section.style.setProperty('max-width', '100%', 'important');
            }
          });
        }
      } else {
        // Desktop: reset to default
        grid.style.setProperty('grid-template-columns', 'repeat(2, 1fr)', 'important');
        const sections = grid.querySelectorAll('s-section');
        sections.forEach((section: any) => {
          if (section.style) {
            section.style.removeProperty('order');
            section.style.removeProperty('grid-row');
          }
        });
      }
    };

    // Use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
      setTimeout(updateGridLayout, 50);
    });
    
    // Run a few times initially to catch late-rendering Web Components
    const maxAttempts = 10;
    const interval = setInterval(() => {
      updateGridLayout();
      stockAttemptsRef.current++;
      if (stockAttemptsRef.current >= maxAttempts) {
        clearInterval(interval);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isMobile]);

  const safeProducts = Array.isArray(products) ? products : [];
  const availableLocations = Array.isArray(locations) ? locations : [];
  const currentLocationLabel =
    availableLocations.find((loc: any) => loc.id === locationId)?.name ||
    locationName ||
    (locationId ? "Selected location" : "All locations");
  const parsedThresholdRaw = parseInt(globalThreshold, 10);
  const parsedThreshold = Number.isNaN(parsedThresholdRaw) ? 5 : parsedThresholdRaw;
  const getProductInventoryValue = useCallback((product: any) => {
    if (typeof product?.locationInventory === "number") {
      return product.locationInventory;
    }
    if (typeof product?.totalInventory === "number") {
      return product.totalInventory;
    }
    if (Array.isArray(product?.variants)) {
      return product.variants.reduce((sum: number, variant: any) => {
        const qty = getVariantQuantity(variant);
        return sum + (Number.isFinite(qty) ? Math.max(qty, 0) : 0);
      }, 0);
    }
    return 0;
  }, []);

  const { lowStockList, zeroInventoryCount, lowStockVariantCount } = useMemo(() => {
    const stats = {
      lowStockList: [] as any[],
      zeroInventoryCount: 0,
      lowStockVariantCount: 0,
    };

    safeProducts.forEach((product: any) => {
      const totalInventory = getProductInventoryValue(product);
      if (totalInventory <= 0) {
        stats.zeroInventoryCount += 1;
      } else if (totalInventory <= parsedThreshold) {
        stats.lowStockList.push(product);
      }

      const variants = Array.isArray(product?.variants) ? product.variants : [];
      variants.forEach((variant: any) => {
        const qty = getVariantQuantity(variant);
        if (qty > 0 && qty <= parsedThreshold) {
          stats.lowStockVariantCount += 1;
        }
      });
    });

    return stats;
  }, [safeProducts, getProductInventoryValue, parsedThreshold]);

  const lowStockProducts = lowStockList;
  const serverInventorySummary =
    inventorySummary ?? {
      totalProducts: safeProducts.length,
      lowStockProducts: lowStockProducts.length,
      zeroInventoryProducts: zeroInventoryCount,
      lowStockVariants: lowStockVariantCount,
    };

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
        locationId,
      },
      { method: "POST", action: "/app/stock-alerts", encType: "application/x-www-form-urlencoded" }
    );
  }, [globalThreshold, lowStockMessage, isEnabled, fontSize, textColor, backgroundColor, stockCounterAnimation, stockCounterPosition, stockAlertStyle, showForAllProducts, showBasedOnInventory, showOnlyBelowThreshold, customThreshold, locationId, fetcher]);

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

    const isAbove = stockCounterPosition === 'above';

    return (
      <s-stack gap="base" direction="block">
        <s-heading>Preview</s-heading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
          {isAbove && (
            <div 
              className={`urgify-stock-alert urgify-stock-alert--${stockAlertStyle}`}
              style={getPreviewStyle()}
            >
              <span className="urgify-stock-alert__text">
                {previewMessage}
              </span>
            </div>
          )}
          
          <button
            style={{
              padding: '12px 24px',
              backgroundColor: '#000000',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Add to Cart
          </button>
          
          {!isAbove && (
            <div 
              className={`urgify-stock-alert urgify-stock-alert--${stockAlertStyle}`}
              style={getPreviewStyle()}
            >
              <span className="urgify-stock-alert__text">
                {previewMessage}
              </span>
            </div>
          )}
        </div>
      </s-stack>
    );
  };

  return (
    <s-page heading="Stock Alert Settings">
      <s-grid 
        gap="base" 
        gridTemplateColumns={isMobile ? "1fr" : "repeat(2, 1fr)"}
        className="stock-alerts-grid"
      >
        <s-section heading="Stock Alert Settings">
          <s-stack gap="base" direction="block">
                    <s-checkbox
                      label="Enable Stock Alerts"
                      checked={isEnabled}
                      onChange={(e) => handleEnabledChange(e.currentTarget.checked)}
                    />

                    {availableLocations.length > 0 ? (
                      <s-select
                        label="Inventory Location"
                        value={locationId}
                        onChange={(e) => {
                          setLocationId(e.currentTarget.value);
                          setIsDirty(true);
                        }}
                      >
                        {availableLocations.map((loc: any) => (
                          <s-option key={loc.id} value={loc.id}>
                            {loc.name}
                          </s-option>
                        ))}
                      </s-select>
                    ) : (
                      <s-paragraph>
                        No locations available. Ensure the app has been granted the{" "}
                        <code>read_inventory</code> and <code>read_locations</code> scopes.
                      </s-paragraph>
                    )}
                    
                    <s-number-field
                      label="Stock Alert Threshold"
                      value={globalThreshold}
                      onChange={(e) => {
                        handleGlobalThresholdChange(e.currentTarget.value);
                      }}
                      details="Show alert when inventory is below this number"
                    />
                    
                    <s-paragraph>
                      <strong>Products Below Threshold ({lowStockProducts.length})</strong>
                      <span
                        style={{
                          display: "block",
                          color: "var(--p-color-text-subdued, #5c5f62)",
                        }}
                      >
                        Location: {currentLocationLabel}
                      </span>
                    </s-paragraph>
                    <s-text
                      tone="subdued"
                      size="small"
                      style={{ display: "block" }}
                    >
                      Zero inventory hidden: {zeroInventoryCount.toLocaleString()} · Variants ≤ threshold: {lowStockVariantCount.toLocaleString()}
                    </s-text>
                    {inventorySummary &&
                      (serverInventorySummary.lowStockProducts !== lowStockProducts.length ||
                        serverInventorySummary.zeroInventoryProducts !== zeroInventoryCount) && (
                        <s-text tone="subdued" size="small" style={{ display: "block" }}>
                          Snapshot (last sync): {serverInventorySummary.lowStockProducts.toLocaleString()} products ≤ threshold,{" "}
                          {serverInventorySummary.zeroInventoryProducts.toLocaleString()} zero inventory.
                        </s-text>
                      )}
                    
                    <s-text-field
                      label="Stock Alert Message"
                      value={lowStockMessage}
                      onChange={(e) => {
                        setLowStockMessage(e.currentTarget.value);
                        setIsDirty(true);
                      }}
                      autocomplete="off"
                      details="Use {{qty}} as placeholder for quantity"
                    />
                    
                    <s-select
                      label="Animation"
                      value={stockCounterAnimation}
                      onChange={(e) => {
                        setStockCounterAnimation(e.currentTarget.value);
                        setIsDirty(true);
                      }}
                    >
                      <s-option value="none">None</s-option>
                      <s-option value="pulse">Pulse</s-option>
                      <s-option value="shake">Shake</s-option>
                      <s-option value="bounce">Bounce</s-option>
                    </s-select>
                    
                    <s-select
                      label="Position"
                      value={stockCounterPosition}
                      onChange={(e) => {
                        setStockCounterPosition(e.currentTarget.value);
                        setIsDirty(true);
                      }}
                    >
                      <s-option value="above">Above Add to Cart</s-option>
                      <s-option value="below">Below Add to Cart</s-option>
                    </s-select>
                    
                    <s-select
                      label="Stock Alert Style"
                      value={stockAlertStyle}
                      onChange={(e) => {
                        setStockAlertStyle(e.currentTarget.value);
                        setIsDirty(true);
                      }}
                    >
                      <s-option value="spectacular">Spectacular</s-option>
                      <s-option value="christmas">Festive Christmas</s-option>
                      <s-option value="blackweek">Blackweek</s-option>
                      <s-option value="brutalist">Brutalist Bold</s-option>
                      <s-option value="glassmorphism">Glassmorphism</s-option>
                      <s-option value="neumorphism">Neumorphism</s-option>
                      <s-option value="custom">Custom</s-option>
                    </s-select>
                    
                    {stockAlertStyle === "custom" && (
                      <>
                        <s-text-field
                          label="Font Size"
                          value={fontSize}
                          onChange={(e) => {
                            setFontSize(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                          details="e.g., 18px, 1.2rem"
                        />
                        
                        <s-color-field
                          label="Text Color"
                          value={textColor}
                          onChange={(e) => {
                            setTextColor(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                          details="e.g., #ffffff, red"
                        />
                        
                        <s-color-field
                          label="Background Color"
                          value={backgroundColor}
                          onChange={(e) => {
                            setBackgroundColor(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                          details="e.g., #e74c3c, red"
                        />
                      </>
                    )}
          </s-stack>
        </s-section>
        
        <s-section>
          <div className="stock-alert-preview-sticky-container">
            <StockAlertPreview />
          </div>
        </s-section>
      </s-grid>
      
      <ui-save-bar id="stock-alert-save-bar">
        <button 
          variant="primary" 
          id="stock-alert-save-button"
          onClick={handleSaveSettings}
          disabled={fetcher.state === 'submitting'}
          {...(fetcher.state === 'submitting' ? { loading: true } : {})}
        >
          Save
        </button>
        <button 
          id="stock-alert-discard-button"
          onClick={() => {
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
            setLocationId(String(settings.location_id || selectedLocationId || ""));
            setIsDirty(false);
          }}
        >
          Discard
        </button>
      </ui-save-bar>
      
      {toastActive && (
        <div
          className="urgify-toast-container"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            animation: 'toastSlideIn 0.3s ease-out',
          }}
        >
          <s-banner 
            heading="Settings saved successfully!"
            tone="success"
            dismissible
            onDismiss={() => setToastActive(false)}
          >
          </s-banner>
        </div>
      )}
      <style>{`
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        .urgify-toast-container {
          min-width: 300px;
          max-width: 500px;
        }
        .urgify-toast-container s-banner {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </s-page>
  );
}
