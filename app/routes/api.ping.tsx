import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    
    return json({
      success: true,
      shop: session.shop,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      { 
        success: false, 
        error: "Authentication failed",
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    );
  }
};
