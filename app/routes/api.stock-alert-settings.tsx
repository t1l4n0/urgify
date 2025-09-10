import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, redirect: authRedirect } = await authenticate.admin(request);

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

    return json({ 
      success: true, 
      message: "Stock alert settings saved successfully to shop metafields" 
    });
  } catch (error) {
    console.error("Error saving stock alert settings:", error);
    return json({ 
      error: "Failed to save settings: " + (error as Error).message 
    }, { status: 500 });
  }
};

