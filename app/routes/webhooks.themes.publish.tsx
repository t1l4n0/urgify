import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { shouldRateLimitByShop } from "../utils/rateLimiting";
import { WebhookProcessor, WEBHOOK_EVENTS } from "../utils/webhooks";
// Quickstart entfernt: kein Embed-Status-Check mehr nötig

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);
  
  // Check rate limiting for webhooks by shop (after authentication)
  const rateLimitCheck = await shouldRateLimitByShop(shop, 'webhook');
  if (rateLimitCheck.limited) {
    console.warn(`Webhook rate limited for shop ${shop}: ${rateLimitCheck.error}`);
    return new Response('Rate limited', { 
      status: 429, 
      headers: { 
        'Retry-After': rateLimitCheck.retryAfter?.toString() || '60' 
      } 
    });
  }

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    console.warn(`❌ Theme publish webhook failed: No admin context for shop ${shop}`);
    throw new Response();
  }

  console.log(`🎨 Theme Publish Webhook empfangen für Shop: ${shop}`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    // Use WebhookProcessor for robust handling
    const webhookProcessor = new WebhookProcessor(shop, admin);
    const result = await webhookProcessor.processWebhook(WEBHOOK_EVENTS.THEMES_PUBLISH, payload);
    
    if (result.success) {
      console.log("✅ Theme publish processed successfully");
      
      // Quickstart entfernt: keine DB-Aktualisierung mehr nötig
      
      return new Response("OK", { status: 200 });
    } else {
      console.error("❌ Theme publish processing failed:", result.error);
      return new Response("Error processing webhook", { 
        status: 500,
        headers: {
          'Retry-After': result.retryAfter?.toString() || '60'
        }
      });
    }
  } catch (error) {
    console.error("❌ Theme publish webhook error:", error);
    return new Response("Internal server error", { 
      status: 500,
      headers: {
        'Retry-After': '60'
      }
    });
  }
};
