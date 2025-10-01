import { z } from 'zod';

// Webhook event types
export const WEBHOOK_EVENTS = {
  // App lifecycle events
  APP_UNINSTALLED: 'app/uninstalled',
  APP_SUBSCRIPTIONS_UPDATE: 'app_subscriptions/update',
  APP_SCOPES_UPDATE: 'app_scopes/update',
  
  // Customer data events
  CUSTOMERS_DATA_REQUEST: 'customers/data_request',
  CUSTOMERS_REDACT: 'customers/redact',
  
  // Shop data events
  SHOP_REDACT: 'shop/redact',
  
  // Product events
  PRODUCTS_CREATE: 'products/create',
  PRODUCTS_UPDATE: 'products/update',
  PRODUCTS_DELETE: 'products/delete',
  
  // Inventory events
  INVENTORY_LEVELS_UPDATE: 'inventory_levels/update',
  
  // Order events
  ORDERS_CREATE: 'orders/create',
  ORDERS_UPDATED: 'orders/updated',
  ORDERS_PAID: 'orders/paid',
  ORDERS_CANCELLED: 'orders/cancelled',
  
  // Theme events
  THEMES_PUBLISH: 'themes/publish',
  THEMES_DELETE: 'themes/delete',
} as const;

// Webhook validation schemas
export const webhookPayloadSchema = z.object({
  id: z.number(),
  topic: z.string(),
  created_at: z.string(),
  shop_domain: z.string(),
  shop_id: z.number(),
  data: z.any(),
});

export const appUninstalledSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().optional(),
  domain: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const productSchema = z.object({
  id: z.number(),
  title: z.string(),
  handle: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  variants: z.array(z.object({
    id: z.number(),
    title: z.string(),
    inventory_quantity: z.number().optional(),
    inventory_management: z.string().optional(),
  })),
});

export const orderSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().optional(),
  total_price: z.string(),
  currency: z.string(),
  created_at: z.string(),
  line_items: z.array(z.object({
    id: z.number(),
    product_id: z.number(),
    variant_id: z.number(),
    title: z.string(),
    quantity: z.number(),
    price: z.string(),
  })),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type AppUninstalledData = z.infer<typeof appUninstalledSchema>;
export type ProductData = z.infer<typeof productSchema>;
export type OrderData = z.infer<typeof orderSchema>;

// Webhook processing result
export interface WebhookResult {
  success: boolean;
  processed: boolean;
  error?: string;
  retryAfter?: number;
  data?: any;
}

// Webhook retry configuration
export const WEBHOOK_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  maxRetryDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
} as const;

// Webhook processing class
export class WebhookProcessor {
  private shop: string;
  private admin: any;
  private retryCount = 0;

  constructor(shop: string, admin: any) {
    this.shop = shop;
    this.admin = admin;
  }

  // Process webhook with retry logic
  async processWebhook(
    topic: string, 
    data: any, 
    retryCount = 0
  ): Promise<WebhookResult> {
    try {
      console.log(`🔗 Processing webhook: ${topic} for shop: ${this.shop}`);
      
      const result = await this.routeWebhook(topic, data);
      
      if (result.success) {
        console.log(`✅ Webhook processed successfully: ${topic}`);
        return result;
      } else {
        throw new Error(result.error || 'Webhook processing failed');
      }
    } catch (error) {
      console.error(`❌ Webhook processing failed: ${topic}`, error);
      
      if (retryCount < WEBHOOK_RETRY_CONFIG.maxRetries) {
        const delay = Math.min(
          WEBHOOK_RETRY_CONFIG.retryDelay * Math.pow(WEBHOOK_RETRY_CONFIG.backoffMultiplier, retryCount),
          WEBHOOK_RETRY_CONFIG.maxRetryDelay
        );
        
        console.log(`🔄 Retrying webhook in ${delay}ms (attempt ${retryCount + 1}/${WEBHOOK_RETRY_CONFIG.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.processWebhook(topic, data, retryCount + 1);
      }
      
      return {
        success: false,
        processed: false,
        error: `Webhook processing failed after ${WEBHOOK_RETRY_CONFIG.maxRetries} retries: ${error}`,
        retryAfter: WEBHOOK_RETRY_CONFIG.maxRetryDelay,
      };
    }
  }

  // Route webhook to appropriate handler
  private async routeWebhook(topic: string, data: any): Promise<WebhookResult> {
    switch (topic) {
      case WEBHOOK_EVENTS.APP_UNINSTALLED:
        return this.handleAppUninstalled(data);
      
      case WEBHOOK_EVENTS.APP_SUBSCRIPTIONS_UPDATE:
        return this.handleAppSubscriptionsUpdate(data);
      
      case WEBHOOK_EVENTS.APP_SCOPES_UPDATE:
        return this.handleAppScopesUpdate(data);
      
      case WEBHOOK_EVENTS.CUSTOMERS_DATA_REQUEST:
        return this.handleCustomersDataRequest(data);
      
      case WEBHOOK_EVENTS.CUSTOMERS_REDACT:
        return this.handleCustomersRedact(data);
      
      case WEBHOOK_EVENTS.SHOP_REDACT:
        return this.handleShopRedact(data);
      
      case WEBHOOK_EVENTS.PRODUCTS_CREATE:
      case WEBHOOK_EVENTS.PRODUCTS_UPDATE:
      case WEBHOOK_EVENTS.PRODUCTS_DELETE:
        return this.handleProductChange(topic, data);
      
      case WEBHOOK_EVENTS.INVENTORY_LEVELS_UPDATE:
        return this.handleInventoryUpdate(data);
      
      case WEBHOOK_EVENTS.ORDERS_CREATE:
      case WEBHOOK_EVENTS.ORDERS_UPDATED:
      case WEBHOOK_EVENTS.ORDERS_PAID:
      case WEBHOOK_EVENTS.ORDERS_CANCELLED:
        return this.handleOrderChange(topic, data);
      
      case WEBHOOK_EVENTS.THEMES_PUBLISH:
      case WEBHOOK_EVENTS.THEMES_DELETE:
        return this.handleThemeChange(topic, data);
      
      default:
        console.log(`⚠️ Unknown webhook topic: ${topic}`);
        return {
          success: true,
          processed: false,
          data: { topic, message: 'Unknown topic, skipped' }
        };
    }
  }

  // App lifecycle handlers
  private async handleAppUninstalled(data: any): Promise<WebhookResult> {
    try {
      const validatedData = appUninstalledSchema.parse(data);
      
      console.log(`📱 App uninstalled for shop: ${validatedData.domain}`);
      
      // Clean up app data
      // This would typically involve:
      // - Deleting app-specific data
      // - Revoking API access
      // - Sending notifications
      // - Updating analytics
      
      return {
        success: true,
        processed: true,
        data: { shop: validatedData.domain, action: 'uninstalled' }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `App uninstalled validation failed: ${error}`
      };
    }
  }

  private async handleAppSubscriptionsUpdate(data: any): Promise<WebhookResult> {
    try {
      console.log(`💳 App subscription updated for shop: ${this.shop}`);
      
      // Handle subscription changes
      // This would typically involve:
      // - Updating subscription status
      // - Enabling/disabling features
      // - Sending notifications
      
      return {
        success: true,
        processed: true,
        data: { shop: this.shop, action: 'subscription_updated' }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Subscription update failed: ${error}`
      };
    }
  }

  private async handleAppScopesUpdate(data: any): Promise<WebhookResult> {
    try {
      console.log(`🔐 App scopes updated for shop: ${this.shop}`);
      
      // Handle scope changes
      // This would typically involve:
      // - Updating permissions
      // - Re-requesting access if needed
      // - Notifying users of changes
      
      return {
        success: true,
        processed: true,
        data: { shop: this.shop, action: 'scopes_updated' }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Scopes update failed: ${error}`
      };
    }
  }

  // Customer data handlers
  private async handleCustomersDataRequest(data: any): Promise<WebhookResult> {
    try {
      console.log(`📋 Customer data request for shop: ${this.shop}`);
      
      // Handle GDPR data request
      // This would typically involve:
      // - Collecting customer data
      // - Preparing data export
      // - Sending to customer
      
      return {
        success: true,
        processed: true,
        data: { shop: this.shop, action: 'data_request' }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Data request failed: ${error}`
      };
    }
  }

  private async handleCustomersRedact(data: any): Promise<WebhookResult> {
    try {
      console.log(`🗑️ Customer data redaction for shop: ${this.shop}`);
      
      // Handle GDPR data deletion
      // This would typically involve:
      // - Deleting customer data
      // - Confirming deletion
      // - Updating records
      
      return {
        success: true,
        processed: true,
        data: { shop: this.shop, action: 'data_redacted' }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Data redaction failed: ${error}`
      };
    }
  }

  private async handleShopRedact(data: any): Promise<WebhookResult> {
    try {
      console.log(`🏪 Shop data redaction for shop: ${this.shop}`);
      
      // Handle shop data deletion
      // This would typically involve:
      // - Deleting shop data
      // - Confirming deletion
      // - Updating records
      
      return {
        success: true,
        processed: true,
        data: { shop: this.shop, action: 'shop_redacted' }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Shop redaction failed: ${error}`
      };
    }
  }

  // Product handlers
  private async handleProductChange(topic: string, data: any): Promise<WebhookResult> {
    try {
      const validatedData = productSchema.parse(data);
      
      console.log(`📦 Product ${topic.split('/')[1]} for shop: ${this.shop}`, {
        productId: validatedData.id,
        title: validatedData.title
      });
      
      // Handle product changes
      // This would typically involve:
      // - Updating product cache
      // - Refreshing stock alerts
      // - Updating analytics
      
      return {
        success: true,
        processed: true,
        data: { 
          shop: this.shop, 
          action: `product_${topic.split('/')[1]}`,
          productId: validatedData.id
        }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Product change failed: ${error}`
      };
    }
  }

  // Inventory handlers
  private async handleInventoryUpdate(data: any): Promise<WebhookResult> {
    try {
      console.log(`📊 Inventory updated for shop: ${this.shop}`);
      
      // Handle inventory changes
      // This would typically involve:
      // - Updating stock levels
      // - Refreshing stock alerts
      // - Updating analytics
      
      return {
        success: true,
        processed: true,
        data: { shop: this.shop, action: 'inventory_updated' }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Inventory update failed: ${error}`
      };
    }
  }

  // Order handlers
  private async handleOrderChange(topic: string, data: any): Promise<WebhookResult> {
    try {
      const validatedData = orderSchema.parse(data);
      
      console.log(`🛒 Order ${topic.split('/')[1]} for shop: ${this.shop}`, {
        orderId: validatedData.id,
        orderName: validatedData.name
      });
      
      // Handle order changes
      // This would typically involve:
      // - Updating order status
      // - Processing payments
      // - Updating analytics
      
      return {
        success: true,
        processed: true,
        data: { 
          shop: this.shop, 
          action: `order_${topic.split('/')[1]}`,
          orderId: validatedData.id
        }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Order change failed: ${error}`
      };
    }
  }

  // Theme handlers
  private async handleThemeChange(topic: string, data: any): Promise<WebhookResult> {
    try {
      console.log(`🎨 Theme ${topic.split('/')[1]} for shop: ${this.shop}`);
      
      // Handle theme changes
      // This would typically involve:
      // - Updating theme cache
      // - Refreshing app embeds
      // - Updating analytics
      
      return {
        success: true,
        processed: true,
        data: { 
          shop: this.shop, 
          action: `theme_${topic.split('/')[1]}`
        }
      };
    } catch (error) {
      return {
        success: false,
        processed: false,
        error: `Theme change failed: ${error}`
      };
    }
  }
}

// Utility functions
export function validateWebhookPayload(payload: any): WebhookPayload | null {
  try {
    return webhookPayloadSchema.parse(payload);
  } catch (error) {
    console.error('Webhook payload validation failed:', error);
    return null;
  }
}

export function getWebhookTopicFromUrl(url: string): string | null {
  const match = url.match(/\/webhooks\/([^\/]+)/);
  return match ? match[1] : null;
}

export function shouldRetryWebhook(error: any): boolean {
  // Retry on network errors, timeouts, and 5xx status codes
  if (error.code === 'ECONNRESET' || 
      error.code === 'ETIMEDOUT' || 
      error.status >= 500) {
    return true;
  }
  return false;
}

export function getRetryDelay(attempt: number): number {
  return Math.min(
    WEBHOOK_RETRY_CONFIG.retryDelay * Math.pow(WEBHOOK_RETRY_CONFIG.backoffMultiplier, attempt),
    WEBHOOK_RETRY_CONFIG.maxRetryDelay
  );
}
