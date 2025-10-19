import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { BillingManager } from "../utils/billing";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    // Get subscription status
    const billingManager = new BillingManager(session.shop, admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    // Get current metafield value
    const metafieldResponse = await admin.graphql(`
      query getShopMetafield {
        shop {
          metafield(namespace: "urgify", key: "subscription_active") {
            value
            type
          }
        }
      }
    `);
    
    const metafieldData = await metafieldResponse.json();
    const currentMetafield = metafieldData.data?.shop?.metafield;
    
    // Get all subscriptions
    const allSubscriptionsResponse = await admin.graphql(`
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
    
    const allSubscriptionsData = await allSubscriptionsResponse.json();
    const allSubscriptions = allSubscriptionsData.data?.currentAppInstallation?.activeSubscriptions || [];
    
    return json({
      subscriptionStatus,
      currentMetafield,
      allSubscriptions,
      shop: session.shop,
      isActive: subscriptionStatus.hasActiveSubscription || subscriptionStatus.isTrialActive,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error in test subscription:", error);
    return json({ 
      error: (error as Error).message,
      stack: (error as Error).stack 
    }, { status: 500 });
  }
};
