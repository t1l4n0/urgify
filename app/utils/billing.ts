import { z } from 'zod';
import { ensureShopMetafieldDefinitions, ensureProductMetafieldDefinitions } from './metafieldDefinitions';

// Billing configuration
export const BILLING_CONFIG = {
  // Trial period in days
  TRIAL_DAYS: 14,
  
  // Pricing plans
  PLANS: {
    BASIC: {
      id: 'urgify_basic',
      name: 'Urgify Basic',
      price: 9.99,
      currency: 'USD',
      interval: 'monthly',
      features: [
        'Up to 100 products',
        'Stock alerts with custom messages',
        'Email support',
        'Basic countdown timers'
      ]
    },
    PRO: {
      id: 'urgify_pro',
      name: 'Urgify Pro',
      price: 19.99,
      currency: 'USD',
      interval: 'monthly',
      features: [
        'Unlimited products',
        'Advanced stock alerts with animations',
        'Priority support',
        'All countdown timer styles',
        'Limited offer banners'
      ]
    },
    ENTERPRISE: {
      id: 'urgify_enterprise',
      name: 'Urgify Enterprise',
      price: 49.99,
      currency: 'USD',
      interval: 'monthly',
      features: [
        'Everything in Pro',
        'Scarcity banners',
        'Custom urgency notifications',
        'Dedicated support',
        'Priority feature requests'
      ]
    }
  },
  
  // Billing statuses
  STATUS: {
    TRIAL: 'trial',
    ACTIVE: 'active',
    PAST_DUE: 'past_due',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
  }
} as const;

const PLAN_METADATA = {
  basic: {
    id: BILLING_CONFIG.PLANS.BASIC.id,
    price: BILLING_CONFIG.PLANS.BASIC.price,
  },
  pro: {
    id: BILLING_CONFIG.PLANS.PRO.id,
    price: BILLING_CONFIG.PLANS.PRO.price,
  },
  enterprise: {
    id: BILLING_CONFIG.PLANS.ENTERPRISE.id,
    price: BILLING_CONFIG.PLANS.ENTERPRISE.price,
  },
} as const;

type PlanHandle = keyof typeof PLAN_METADATA;

const PLAN_NAME_ALIASES: Record<string, PlanHandle> = {
  basic: "basic",
  starter: "basic",
  pro: "pro",
  "pro-plan": "pro",
  advanced: "pro",
  enterprise: "enterprise",
  premium: "enterprise",
  plus: "enterprise",
  "plus-plan": "enterprise",
};

const PLAN_PRICE_ALIASES: Array<{ handle: PlanHandle; amount: number }> = [
  { handle: "enterprise", amount: PLAN_METADATA.enterprise.price },
  { handle: "enterprise", amount: 19.99 }, // Plus monthly
  { handle: "enterprise", amount: 199 }, // Plus yearly
  { handle: "pro", amount: PLAN_METADATA.pro.price },
  { handle: "pro", amount: 7.99 }, // Updated Pro monthly
  { handle: "pro", amount: 79 }, // Pro yearly
  { handle: "basic", amount: PLAN_METADATA.basic.price },
  { handle: "basic", amount: 0 },
];

const PRICE_MATCH_TOLERANCE = 0.5;

// Validation schemas
export const billingStatusSchema = z.enum([
  'trial',
  'active', 
  'past_due',
  'cancelled',
  'expired'
]);

export const subscriptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: billingStatusSchema,
  currentPeriodEnd: z.string(),
  trialEndsAt: z.string().optional(),
  planId: z.string(),
  planHandle: z.string().optional(),
  price: z.number(),
  currency: z.string(),
  interval: z.string(),
});

export type BillingStatus = z.infer<typeof billingStatusSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;

function derivePlanHandleFromName(name: string | null | undefined): PlanHandle | null {
  if (!name) return null;

  const normalized = name.toLowerCase();
  for (const [alias, handle] of Object.entries(PLAN_NAME_ALIASES)) {
    if (normalized.includes(alias)) {
      return handle;
    }
  }
  return null;
}

function approximatelyEquals(value: number, target: number): boolean {
  return Math.abs(value - target) <= PRICE_MATCH_TOLERANCE;
}

function derivePlanHandleFromPrice(price: number): PlanHandle | null {
  for (const { handle, amount } of PLAN_PRICE_ALIASES) {
    if (approximatelyEquals(price, amount)) {
      return handle;
    }
  }
  if (price > 0) return "basic";
  return null;
}

// Billing utility class
export class BillingManager {
  private shop: string;
  private admin: any;

  constructor(shop: string, admin: any) {
    this.shop = shop;
    this.admin = admin;
  }

  // Get current subscription status
  async getSubscriptionStatus(): Promise<{
    hasActiveSubscription: boolean;
    subscription: Subscription | null;
    isTrialActive: boolean;
    daysUntilTrialEnds: number | null;
    daysUntilSubscriptionEnds: number | null;
    planHandle: string | null;
  }> {
    try {
      const response = await this.admin.graphql(`
        query getCurrentAppInstallation {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              currentPeriodEnd
              lineItems {
                id
                plan {
                  ... on AppPlanV2 {
                    pricingDetails {
                      ... on AppRecurringPricing {
                        price {
                          amount
                          currencyCode
                        }
                        interval
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const { data } = await response.json();
      const subscriptions = data?.currentAppInstallation?.activeSubscriptions || [];
      
      console.log('[BillingManager] Raw subscriptions data:', JSON.stringify(subscriptions, null, 2));
      
      if (subscriptions.length === 0) {
        console.log('[BillingManager] No subscriptions found');
        return {
          hasActiveSubscription: false,
          subscription: null,
          isTrialActive: false,
          daysUntilTrialEnds: null,
          daysUntilSubscriptionEnds: null,
          planHandle: null,
        };
      }

      // Check all subscriptions and log their status
      subscriptions.forEach((sub: any) => {
        const statusUpper = sub.status?.toUpperCase();
        const periodEnd = new Date(sub.currentPeriodEnd);
        const now = new Date();
        const isActive = (statusUpper === 'ACTIVE' || statusUpper === 'TRIAL') && periodEnd > now;
        console.log(`[BillingManager] Subscription ${sub.id}:`, {
          status: sub.status,
          statusUpper,
          currentPeriodEnd: sub.currentPeriodEnd,
          periodEnd: periodEnd.toISOString(),
          now: now.toISOString(),
          isActive,
        });
      });

      // Case-insensitive status check and also check if period hasn't ended
      const activeSubscription = subscriptions.find((sub: any) => {
        const statusUpper = sub.status?.toUpperCase();
        const periodEnd = new Date(sub.currentPeriodEnd);
        const now = new Date();
        const isValidStatus = statusUpper === 'ACTIVE' || statusUpper === 'TRIAL';
        const isNotExpired = periodEnd > now;
        return isValidStatus && isNotExpired;
      });

      if (!activeSubscription) {
        console.log('[BillingManager] No active subscription found');
        return {
          hasActiveSubscription: false,
          subscription: null,
          isTrialActive: false,
          daysUntilTrialEnds: null,
          daysUntilSubscriptionEnds: null,
          planHandle: null,
        };
      }

      console.log('[BillingManager] Found active subscription:', {
        id: activeSubscription.id,
        name: activeSubscription.name,
        status: activeSubscription.status,
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
      });

      // Extract plan information from subscription line items
      // AppPlanV2 only has pricingDetails, no id or handle
      const plan = activeSubscription.lineItems?.[0]?.plan;
      const price = parseFloat(plan?.pricingDetails?.price?.amount || '0');
      const subscriptionName = activeSubscription.name || '';
      
      console.log('[BillingManager] Plan information:', {
        subscriptionName,
        price,
        plan,
        lineItems: activeSubscription.lineItems,
      });
      
      // Derive plan handle from subscription name or price
      // Subscription names typically contain the plan name (e.g., "Urgify Pro")
      let planHandle = derivePlanHandleFromName(subscriptionName);

      if (!planHandle) {
        planHandle = derivePlanHandleFromPrice(price);
      }

      if (planHandle) {
        console.log(
          "[BillingManager] Derived plan handle:",
          planHandle,
          "from name:",
          subscriptionName,
          "price:",
          price,
        );
      } else {
        console.warn(
          "[BillingManager] Could not determine plan handle from name or price",
          { subscriptionName, price },
        );
      }

      const subscription: Subscription = {
        id: activeSubscription.id,
        name: activeSubscription.name,
        status: activeSubscription.status.toLowerCase(),
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        trialEndsAt: undefined, // Field not available in API 2025-04
        planId: planHandle ? PLAN_METADATA[planHandle].id : BILLING_CONFIG.PLANS.BASIC.id,
        planHandle: planHandle ?? undefined,
        price: price,
        currency: plan?.pricingDetails?.price?.currencyCode || 'USD',
        interval: plan?.pricingDetails?.interval || 'monthly',
      };

      const statusUpper = activeSubscription.status?.toUpperCase();
      const isTrialActive = statusUpper === 'TRIAL' && 
        new Date(activeSubscription.currentPeriodEnd) > new Date();
      
      const daysUntilTrialEnds = isTrialActive ? 
        Math.ceil((new Date(activeSubscription.currentPeriodEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 
        null;
      
      const daysUntilSubscriptionEnds = Math.ceil(
        (new Date(activeSubscription.currentPeriodEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      const result = {
        hasActiveSubscription: true,
        subscription,
        isTrialActive: !!isTrialActive,
        daysUntilTrialEnds,
        daysUntilSubscriptionEnds,
        planHandle: planHandle ?? null,
      };

      console.log('[BillingManager] Final subscription status result:', {
        hasActiveSubscription: result.hasActiveSubscription,
        planHandle: result.planHandle,
        subscriptionPlanHandle: subscription.planHandle,
        subscriptionStatus: subscription.status,
        subscriptionName: subscription.name,
      });

      return result;
    } catch (error) {
      console.error('Error fetching subscription status:', error);
      return {
        hasActiveSubscription: false,
        subscription: null,
        isTrialActive: false,
        daysUntilTrialEnds: null,
        daysUntilSubscriptionEnds: null,
        planHandle: null,
      };
    }
  }

  // Create a new subscription
  async createSubscription(planId: string): Promise<{
    success: boolean;
    confirmationUrl?: string;
    error?: string;
  }> {
    try {
      const plan = Object.values(BILLING_CONFIG.PLANS).find(p => p.id === planId);
      if (!plan) {
        return { success: false, error: 'Invalid plan ID' };
      }

      const response = await this.admin.graphql(`
        mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int) {
          appSubscriptionCreate(
            name: $name
            lineItems: $lineItems
            returnUrl: $returnUrl
            trialDays: $trialDays
          ) {
            appSubscription {
              id
              status
              currentPeriodEnd
              trialEndsAt
            }
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }
      `, {
        headers: { 'Idempotency-Key': `appSub_${Date.now()}_${Math.random().toString(36).slice(2)}` },
        variables: {
          name: plan.name,
          lineItems: [{
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: plan.price,
                  currencyCode: plan.currency
                },
                interval: plan.interval.toUpperCase()
              }
            }
          }],
          returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/confirmation`,
          trialDays: BILLING_CONFIG.TRIAL_DAYS
        }
      });

      // Retry on 429 with minimal backoff
      let parsed = await response.json();
      if ((response as any).status === 429) {
        await new Promise(r => setTimeout(r, 1000));
        const retry = await this.admin.graphql(`
        mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int) {
          appSubscriptionCreate(
            name: $name
            lineItems: $lineItems
            returnUrl: $returnUrl
            trialDays: $trialDays
          ) {
            appSubscription {
              id
              status
              currentPeriodEnd
              trialEndsAt
            }
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }
      `, {
          headers: { 'Idempotency-Key': `appSub_${Date.now()}_${Math.random().toString(36).slice(2)}` },
          variables: {
            name: plan.name,
            lineItems: [{
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount: plan.price,
                    currencyCode: plan.currency
                  },
                  interval: plan.interval.toUpperCase()
                }
              }
            }],
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/confirmation`,
            trialDays: BILLING_CONFIG.TRIAL_DAYS
          }
        });
        parsed = await retry.json();
      }

      const { data } = parsed;
      const { appSubscriptionCreate } = data;

      if (appSubscriptionCreate.userErrors.length > 0) {
        return {
          success: false,
          error: appSubscriptionCreate.userErrors[0].message
        };
      }

      return {
        success: true,
        confirmationUrl: appSubscriptionCreate.confirmationUrl
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      return {
        success: false,
        error: 'Failed to create subscription'
      };
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await this.admin.graphql(`
        mutation appSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          id: subscriptionId
        }
      });

      const { data } = await response.json();
      const { appSubscriptionCancel } = data;

      if (appSubscriptionCancel.userErrors.length > 0) {
        return {
          success: false,
          error: appSubscriptionCancel.userErrors[0].message
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      return {
        success: false,
        error: 'Failed to cancel subscription'
      };
    }
  }

  // Get billing history
  async getBillingHistory(): Promise<{
    invoices: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      createdAt: string;
      dueAt: string;
    }>;
  }> {
    try {
      // This would typically fetch from Shopify's billing API
      // For now, return mock data
      return {
        invoices: []
      };
    } catch (error) {
      console.error('Error fetching billing history:', error);
      return { invoices: [] };
    }
  }

  // Check if shop is eligible for trial
  async isEligibleForTrial(): Promise<boolean> {
    try {
      const response = await this.admin.graphql(`
        query getCurrentAppInstallation {
          currentAppInstallation {
            activeSubscriptions {
              id
              status
              createdAt
            }
          }
        }
      `);

      const { data } = await response.json();
      const subscriptions = data?.currentAppInstallation?.activeSubscriptions || [];
      
      // Shop is eligible for trial if they have no previous subscriptions
      return subscriptions.length === 0;
    } catch (error) {
      console.error('Error checking trial eligibility:', error);
      return false;
    }
  }
}

// Utility functions
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function getPlanFeatures(planId: string): string[] {
  const plan = Object.values(BILLING_CONFIG.PLANS).find(p => p.id === planId);
  return plan?.features ? [...plan.features] : [];
}

export function calculateTrialEndDate(): Date {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + BILLING_CONFIG.TRIAL_DAYS);
  return trialEnd;
}

export function isSubscriptionActive(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  
  const now = new Date();
  const endDate = new Date(subscription.currentPeriodEnd);
  
  return subscription.status === 'active' && endDate > now;
}

export function isTrialActive(subscription: Subscription | null): boolean {
  if (!subscription || !subscription.trialEndsAt) return false;
  
  const now = new Date();
  const trialEnd = new Date(subscription.trialEndsAt);
  
  return trialEnd > now;
}

// Sync subscription status to shop metafield for Liquid templates
export async function syncSubscriptionStatusToMetafield(admin: any, shopId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await ensureShopMetafieldDefinitions(admin);
    await ensureProductMetafieldDefinitions(admin);
    const billingManager = new BillingManager(shopId.replace('.myshopify.com', ''), admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    console.log("Subscription status:", subscriptionStatus);
    
    // Consider both active subscription and trial as "active"
    const isActive = subscriptionStatus.hasActiveSubscription || subscriptionStatus.isTrialActive;
    
    console.log("Setting subscription_active to:", isActive);
    
    const response = await admin.graphql(`#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: "urgify",
          key: "subscription_active",
          value: isActive.toString(),
          type: "boolean"
        }]
      }
    });

        const data = await response.json();
        console.log("Metafield response:", data);
        
        const userErrors = data?.data?.metafieldsSet?.userErrors || [];
        
        if (userErrors.length > 0) {
          console.error("Error syncing subscription status:", userErrors);
          return {
            success: false,
            error: userErrors[0]?.message || 'Failed to sync subscription status'
          };
        }

        console.log(`Subscription status synced: ${isActive ? 'active' : 'inactive'}`);
        return { success: true };
  } catch (error) {
    console.error("Error syncing subscription status to metafield:", error);
    return {
      success: false,
      error: 'Failed to sync subscription status'
    };
  }
}

// Feature gating functions
export function hasAccessToFeature(
  planHandle: string | null | undefined,
  requiredPlan: PlanHandle
): boolean {
  if (!planHandle) return false;

  // Plan hierarchy: basic < pro < enterprise
  const planHierarchy: Record<PlanHandle, number> = {
    basic: 1,
    pro: 2,
    enterprise: 3,
  };

  const normalizedHandle =
    PLAN_NAME_ALIASES[planHandle.toLowerCase()] ??
    (["basic", "pro", "enterprise"].includes(planHandle.toLowerCase())
      ? (planHandle.toLowerCase() as PlanHandle)
      : null);

  if (!normalizedHandle) return false;

  const userPlanLevel = planHierarchy[normalizedHandle];
  const requiredPlanLevel = planHierarchy[requiredPlan];

  return userPlanLevel >= requiredPlanLevel;
}

export function hasAccessToStockAlerts(planHandle: string | null | undefined): boolean {
  return hasAccessToFeature(planHandle, 'basic');
}

export function hasAccessToAppBlocks(planHandle: string | null | undefined): boolean {
  return hasAccessToFeature(planHandle, 'pro');
}

export function hasAccessToPopups(planHandle: string | null | undefined): boolean {
  return hasAccessToFeature(planHandle, 'enterprise');
}
