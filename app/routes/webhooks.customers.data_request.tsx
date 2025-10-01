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
    throw new Response();
  }

  console.log(`📋 Customer Data Request Webhook empfangen für Shop: ${shop}`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  // Use WebhookProcessor for robust handling
  const webhookProcessor = new WebhookProcessor(shop, admin);
  const result = await webhookProcessor.processWebhook(WEBHOOK_EVENTS.CUSTOMERS_DATA_REQUEST, payload);
  
  if (result.success) {
    console.log("✅ Customer data request processed successfully");
    return new Response("OK", { status: 200 });
  } else {
    console.error("❌ Customer data request processing failed:", result.error);
    return new Response("Error processing webhook", { 
      status: 500,
      headers: {
        'Retry-After': result.retryAfter?.toString() || '60'
      }
    });
  }
};
