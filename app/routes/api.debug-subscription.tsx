import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { BillingManager } from "../utils/billing";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    // Get raw subscription data from API
    const rawResponse = await admin.graphql(`
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
    
    const rawData = await rawResponse.json();
    
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
    
    return json({
      subscriptionStatus,
      currentMetafield,
      shop: session.shop,
      isActive: subscriptionStatus.hasActiveSubscription || subscriptionStatus.isTrialActive,
      rawApiData: rawData,
    });
  } catch (error) {
    console.error("Error in debug subscription:", error);
    return json({ 
      error: (error as Error).message,
      stack: (error as Error).stack 
    }, { status: 500 });
  }
};
