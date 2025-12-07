// Simple in-memory rate limiting implementation
// In production, use Redis for distributed rate limiting
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class SimpleRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.resetTime) {
          this.store.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  async consume(key: string, points: number, duration: number): Promise<{ success: boolean; msBeforeNext?: number }> {
    const now = Date.now();
    const resetTime = now + (duration * 1000);
    
    const entry = this.store.get(key);
    
    if (!entry || now > entry.resetTime) {
      // First request or expired entry
      this.store.set(key, { count: 1, resetTime });
      return { success: true };
    }
    
    if (entry.count >= points) {
      // Rate limit exceeded
      return { 
        success: false, 
        msBeforeNext: entry.resetTime - now 
      };
    }
    
    // Increment counter
    entry.count++;
    this.store.set(key, entry);
    return { success: true };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Rate limiting configurations for different endpoints
export const rateLimitConfigs = {
  // API endpoints - more restrictive
  api: {
    points: 10, // Number of requests
    duration: 60, // Per 60 seconds
  },
  
  // Webhook endpoints - less restrictive (Shopify sends many)
  // Per shop: 500 requests per minute (Shopify's limit is ~1000/min globally)
  webhook: {
    points: 500, // Number of requests
    duration: 60, // Per 60 seconds
  },
  
  // Admin endpoints - moderate restriction
  admin: {
    points: 30, // Number of requests
    duration: 60, // Per 60 seconds
  },
  
  // Public endpoints - very restrictive
  public: {
    points: 5, // Number of requests
    duration: 60, // Per 60 seconds
  },
} as const;

// Create rate limiters
export const rateLimiters = {
  api: new SimpleRateLimiter(),
  webhook: new SimpleRateLimiter(),
  admin: new SimpleRateLimiter(),
  public: new SimpleRateLimiter(),
};

// Rate limiting middleware factory
export function createRateLimiter(type: keyof typeof rateLimiters) {
  return async (key: string) => {
    const config = rateLimitConfigs[type];
    const result = await rateLimiters[type].consume(key, config.points, config.duration);
    
    if (result.success) {
      return { success: true };
    } else {
      const secs = Math.round((result.msBeforeNext || 1000) / 1000);
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${secs} seconds.`,
        retryAfter: secs,
      };
    }
  };
}

// Get client identifier (IP + User-Agent for better accuracy)
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Create a hash-like identifier (in production, use proper hashing)
  return `${ip}-${userAgent.slice(0, 50)}`;
}

// Shopify-specific rate limiting (respects Shopify's limits)
export const shopifyRateLimits = {
  // GraphQL Admin API: 50 points per second, 1000 points per 10 seconds
  graphql: {
    points: 50,
    duration: 1, // 1 second
  },
  
  // REST Admin API: 40 requests per second
  rest: {
    points: 40,
    duration: 1, // 1 second
  },
  
  // Webhooks: 1000 requests per minute
  webhook: {
    points: 1000,
    duration: 60, // 1 minute
  },
} as const;

// Shopify rate limiters
export const shopifyRateLimiters = {
  graphql: new SimpleRateLimiter(),
  rest: new SimpleRateLimiter(),
  webhook: new SimpleRateLimiter(),
};

// Shopify rate limiting middleware
export async function checkShopifyRateLimit(
  type: 'graphql' | 'rest' | 'webhook',
  shop: string
): Promise<{ success: boolean; error?: string; retryAfter?: number }> {
  const config = shopifyRateLimits[type];
  const result = await shopifyRateLimiters[type].consume(shop, config.points, config.duration);
  
  if (result.success) {
    return { success: true };
  } else {
    const secs = Math.round((result.msBeforeNext || 1000) / 1000);
    return {
      success: false,
      error: `Shopify ${type} rate limit exceeded. Try again in ${secs} seconds.`,
      retryAfter: secs,
    };
  }
}

// Utility to check if request should be rate limited
export async function shouldRateLimit(
  request: Request,
  type: keyof typeof rateLimiters = 'api'
): Promise<{ limited: boolean; error?: string; retryAfter?: number }> {
  const key = getClientIdentifier(request);
  const rateLimiter = createRateLimiter(type);
  const result = await rateLimiter(key);
  
  return {
    limited: !result.success,
    error: result.error,
    retryAfter: result.retryAfter,
  };
}

// Shop-based rate limiting for webhooks (after authentication)
export async function shouldRateLimitByShop(
  shop: string,
  type: keyof typeof rateLimiters = 'webhook'
): Promise<{ limited: boolean; error?: string; retryAfter?: number }> {
  const rateLimiter = createRateLimiter(type);
  const result = await rateLimiter(shop);
  
  return {
    limited: !result.success,
    error: result.error,
    retryAfter: result.retryAfter,
  };
}

// Cleanup function for graceful shutdown
export function cleanupRateLimiters() {
  Object.values(rateLimiters).forEach(limiter => limiter.destroy());
  Object.values(shopifyRateLimiters).forEach(limiter => limiter.destroy());
}