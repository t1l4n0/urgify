import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncSubscriptionStatusToMetafield } from "../utils/billing";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
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
    
    if (!shopId) {
      return json({ 
        success: false, 
        error: "Could not retrieve shop ID" 
      }, { status: 500 });
    }
    
    console.log("Syncing subscription status for shop:", session.shop);
    const syncResult = await syncSubscriptionStatusToMetafield(admin, shopId);
    
    if (syncResult.success) {
      console.log("Subscription status synced successfully");
      return json({ 
        success: true, 
        message: "Subscription status synced successfully" 
      });
    } else {
      console.error("Failed to sync subscription status:", syncResult.error);
      return json({ 
        success: false, 
        error: syncResult.error || "Failed to sync subscription status" 
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Error syncing subscription status:", error);
    return json({ 
      success: false, 
      error: "Internal server error" 
    }, { status: 500 });
  }
};

export const action = async ({ request, params, context }: LoaderFunctionArgs) => {
  // Mirror loader signature to satisfy types
  return loader({ request, params, context } as LoaderFunctionArgs);
};
