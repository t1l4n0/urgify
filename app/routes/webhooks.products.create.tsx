import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { shouldRateLimit } from "../utils/rateLimiting";
import { WebhookProcessor, WEBHOOK_EVENTS } from "../utils/webhooks";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Check rate limiting for webhooks
  const rateLimitCheck = await shouldRateLimit(request, 'webhook');
  if (rateLimitCheck.limited) {
    console.warn(`Webhook rate limited: ${rateLimitCheck.error}`);
    return new Response('Rate limited', { 
      status: 429, 
      headers: { 
        'Retry-After': rateLimitCheck.retryAfter?.toString() || '60' 
      } 
    });
  }

  const { shop, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    console.warn(`❌ Product create webhook failed: No admin context for shop ${shop}`);
    throw new Response();
  }

  console.log(`📦 Product Create Webhook empfangen für Shop: ${shop}`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    // Use WebhookProcessor for robust handling
    const webhookProcessor = new WebhookProcessor(shop, admin);
    const result = await webhookProcessor.processWebhook(WEBHOOK_EVENTS.PRODUCTS_CREATE, payload);
    
    if (result.success) {
      console.log("✅ Product create processed successfully");
      return new Response("OK", { status: 200 });
    } else {
      console.error("❌ Product create processing failed:", result.error);
      return new Response("Error processing webhook", { 
        status: 500,
        headers: {
          'Retry-After': result.retryAfter?.toString() || '60'
        }
      });
    }
  } catch (error) {
    console.error("❌ Product create webhook error:", error);
    return new Response("Internal server error", { 
      status: 500,
      headers: {
        'Retry-After': '60'
      }
    });
  }
};
