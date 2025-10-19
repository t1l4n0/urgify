import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: { request: Request }) => {
  try {
    const { admin } = await authenticate.admin(request);

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

    // Import and call sync function
    const { syncSubscriptionStatusToMetafield } = await import("../utils/billing");
    const result = await syncSubscriptionStatusToMetafield(admin, shopId);

    return json({ 
      success: true, 
      message: "Metafield synced successfully",
      result 
    });

  } catch (error) {
    console.error("Force sync metafield error:", error);
    return json({ 
      error: "Failed to sync metafield", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
};

export const loader = async ({ request }: { request: Request }) => {
  return json({ message: "Use POST to force sync metafield" });
};
