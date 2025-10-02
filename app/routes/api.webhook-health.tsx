import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { WEBHOOK_EVENTS } from "../utils/webhooks";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // In a real implementation, this would query a database for webhook statistics
  // For now, we'll return mock data that simulates the current webhook health
  const webhookHealth = {
    overallHealth: "healthy",
    successRate: 95,
    totalWebhooks: 16,
    activeWebhooks: 14,
    failedWebhooks: 2,
    lastProcessed: new Date().toISOString(),
    webhookStats: Object.values(WEBHOOK_EVENTS).map((event, index) => ({
      event,
      successRate: Math.floor(Math.random() * 20) + 80, // 80-100%
      status: Math.random() > 0.15 ? 'active' : 'failed',
      lastProcessed: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      errorCount: Math.floor(Math.random() * 5),
      avgProcessingTime: Math.floor(Math.random() * 200) + 50, // 50-250ms
    })),
    recentErrors: [
      {
        id: 1,
        event: 'customers/redact',
        error: 'Validation failed: Invalid customer data',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        retryCount: 2
      },
      {
        id: 2,
        event: 'products/create',
        error: 'Database connection timeout',
        timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        retryCount: 3
      }
    ],
    performanceMetrics: {
      avgResponseTime: 120,
      p95ResponseTime: 300,
      p99ResponseTime: 500,
      totalRequests: 1250,
      errorRate: 5.2
    }
  };
  
  return json({
    webhookHealth,
    shop: session.shop,
    timestamp: new Date().toISOString()
  });
};
