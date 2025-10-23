import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { shouldRateLimit } from "../utils/rateLimiting";
import { WebhookProcessor, WEBHOOK_EVENTS } from "../utils/webhooks";
import { checkEmbedStatusFromShopify } from "../utils/embedStatus";
import prisma from "../db.server";

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
      
      // Check if app embedding is now active after theme publish
      try {
        console.log("🔍 Checking app embed status after theme publish...");
        const embedActive = await checkEmbedStatusFromShopify(shop, admin);
        
        if (embedActive) {
          console.log("🎉 App embedding is active! Updating database...");
          
          // Update Quickstart status in database
          await prisma.quickstart.upsert({
            where: { shop },
            update: { 
              embedActive: true, 
              lastActivated: new Date(),
              updatedAt: new Date()
            },
            create: { 
              shop, 
              embedActive: true, 
              lastActivated: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
          
          console.log("✅ Database updated with embed active status");
        } else {
          console.log("ℹ️ App embedding not yet active");
        }
      } catch (embedError) {
        console.error("❌ Error checking embed status:", embedError);
        // Don't fail the webhook if embed check fails
      }
      
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
