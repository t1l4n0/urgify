import { z } from 'zod';

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
  price: z.number(),
  currency: z.string(),
  interval: z.string(),
});

export type BillingStatus = z.infer<typeof billingStatusSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;

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
              trialEndsAt
              lineItems {
                id
                plan {
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
      `);

      const { data } = await response.json();
      const subscriptions = data?.currentAppInstallation?.activeSubscriptions || [];
      
      if (subscriptions.length === 0) {
        return {
          hasActiveSubscription: false,
          subscription: null,
          isTrialActive: false,
          daysUntilTrialEnds: null,
          daysUntilSubscriptionEnds: null,
        };
      }

      const activeSubscription = subscriptions.find((sub: any) => 
        sub.status === 'ACTIVE' && new Date(sub.currentPeriodEnd) > new Date()
      );

      if (!activeSubscription) {
        return {
          hasActiveSubscription: false,
          subscription: null,
          isTrialActive: false,
          daysUntilTrialEnds: null,
          daysUntilSubscriptionEnds: null,
        };
      }

      const subscription: Subscription = {
        id: activeSubscription.id,
        name: activeSubscription.name,
        status: activeSubscription.status.toLowerCase(),
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        trialEndsAt: activeSubscription.trialEndsAt,
        planId: activeSubscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount ? 'urgify_pro' : 'urgify_basic',
        price: activeSubscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || 0,
        currency: activeSubscription.lineItems?.[0]?.plan?.pricingDetails?.price?.currencyCode || 'USD',
        interval: activeSubscription.lineItems?.[0]?.plan?.pricingDetails?.interval || 'monthly',
      };

      const isTrialActive = activeSubscription.trialEndsAt && 
        new Date(activeSubscription.trialEndsAt) > new Date();
      
      const daysUntilTrialEnds = isTrialActive ? 
        Math.ceil((new Date(activeSubscription.trialEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 
        null;
      
      const daysUntilSubscriptionEnds = Math.ceil(
        (new Date(activeSubscription.currentPeriodEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        hasActiveSubscription: true,
        subscription,
        isTrialActive: !!isTrialActive,
        daysUntilTrialEnds,
        daysUntilSubscriptionEnds,
      };
    } catch (error) {
      console.error('Error fetching subscription status:', error);
      return {
        hasActiveSubscription: false,
        subscription: null,
        isTrialActive: false,
        daysUntilTrialEnds: null,
        daysUntilSubscriptionEnds: null,
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

      const { data } = await response.json();
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
