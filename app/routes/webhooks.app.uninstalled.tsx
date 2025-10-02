import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "@remix-run/node";
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

  const { topic, shop, admin, payload } = await authenticate.webhook(request);

  if (!topic) {
    return new Response("Missing topic", { status: 400 });
  }

  if (topic === "APP_UNINSTALLED") {
    try {
      console.log("App uninstalled:", payload);
      
      // Use WebhookProcessor for robust handling
      const webhookProcessor = new WebhookProcessor(shop, admin);
      const result = await webhookProcessor.processWebhook(WEBHOOK_EVENTS.APP_UNINSTALLED, payload);
      
      if (result.success) {
        console.log("✅ App uninstall processed successfully");
        return new Response("OK", { status: 200 });
      } else {
        console.error("❌ App uninstall processing failed:", result.error);
        return new Response("Error processing webhook", { 
          status: 500,
          headers: {
            'Retry-After': result.retryAfter?.toString() || '60'
          }
        });
      }
    } catch (error) {
      console.error("Error processing app uninstall:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }

  return new Response("Unhandled webhook topic", { status: 400 });
};
