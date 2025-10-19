import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncSubscriptionStatusToMetafield } from "../utils/billing";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
    
    if (hmac) {
      console.log("APP_SUBSCRIPTIONS/UPDATE: webhook received with HMAC");
      
      // Authenticate the webhook request
      const { admin, session } = await authenticate.admin(request);
      
      // Get shop ID for metafield sync
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
        // Sync subscription status to metafield
        const syncResult = await syncSubscriptionStatusToMetafield(admin, shopId);
        if (syncResult.success) {
          console.log("Subscription status synced successfully");
        } else {
          console.error("Failed to sync subscription status:", syncResult.error);
        }
      } else {
        console.error("Could not retrieve shop ID for subscription sync");
      }
    } else {
      console.log("APP_SUBSCRIPTIONS/UPDATE: test request without HMAC");
    }

    // Immer 200 OK zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("APP_SUBSCRIPTIONS/UPDATE: webhook error:", err);
    // Auch bei Fehler 200 zurückgeben
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
