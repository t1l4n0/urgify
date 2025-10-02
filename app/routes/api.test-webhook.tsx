import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { WebhookProcessor, WEBHOOK_EVENTS } from "../utils/webhooks";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { webhookType, testData } = await request.json();

  if (!webhookType) {
    return json({ error: "webhookType is required" }, { status: 400 });
  }

  try {
    // Create mock admin context for testing
    const mockAdmin = {
      graphql: async () => ({ data: {}, errors: [] }),
      rest: {
        get: async () => ({ data: {}, errors: [] }),
        post: async () => ({ data: {}, errors: [] }),
        put: async () => ({ data: {}, errors: [] }),
        delete: async () => ({ data: {}, errors: [] }),
      }
    };

    const webhookProcessor = new WebhookProcessor(session.shop, mockAdmin);
    
    // Use test data or create default test data
    const defaultTestData = {
      id: 12345,
      email: "test@example.com",
      phone: "+1234567890",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      first_name: "Test",
      last_name: "Customer",
      orders_count: 0,
      total_spent: "0.00",
      state: "enabled",
      note: "Test customer for webhook testing",
      verified_email: true,
      multipass_identifier: null,
      tax_exempt: false,
      tags: "test,webhook",
      last_order_id: null,
      last_order_name: null,
      currency: "USD",
      addresses: [],
      accepts_marketing: false,
      accepts_marketing_updated_at: new Date().toISOString(),
      marketing_opt_in_level: "single_opt_in",
      tax_exemptions: [],
      admin_graphql_api_id: "gid://shopify/Customer/12345",
      default_address: null
    };

    const testPayload = testData || defaultTestData;
    
    console.log(`🧪 Testing webhook: ${webhookType} for shop: ${session.shop}`);
    console.log("Test payload:", JSON.stringify(testPayload, null, 2));

    const result = await webhookProcessor.processWebhook(webhookType, testPayload);

    return json({
      success: true,
      webhookType,
      result,
      message: `Webhook ${webhookType} tested successfully`
    });

  } catch (error) {
    console.error(`❌ Webhook test failed: ${webhookType}`, error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      webhookType
    }, { status: 500 });
  }
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  return json({
    message: "Webhook Test API",
    shop: session.shop,
    availableWebhooks: Object.values(WEBHOOK_EVENTS),
    usage: {
      method: "POST",
      body: {
        webhookType: "customers/redact",
        testData: "optional - custom test data"
      }
    }
  });
};
