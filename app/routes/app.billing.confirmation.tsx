import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager } from "../utils/billing";
// Polaris Web Components - no imports needed, components are global
import { useEffect, useState } from "react";
import { toMessage } from "../lib/errors";
import { ViewPlansLink } from "../components/ViewPlansLink";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  
  if (!chargeId) {
    return json({
      success: false,
      error: "No charge ID provided"
    });
  }

  try {
    // Verify the subscription was created successfully
    const billingManager = new BillingManager(session.shop, admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    // Sync subscription status to metafield for Liquid templates
    const shopResponse = await admin.graphql(`
      query getShop {
        shop {
          id
        }
      }
    `);

    const shopData = await shopResponse.json();
    const shopId = shopData.data?.shop?.id;

    if (shopId) {
      try {
        const { syncSubscriptionStatusToMetafield } = await import("../utils/billing");
        const syncResult = await syncSubscriptionStatusToMetafield(admin, shopId);
        console.log("Metafield sync result:", syncResult);
      } catch (syncError) {
        console.error("Failed to sync metafield in billing confirmation:", syncError);
        // Continue even if sync fails
      }
    }
    
    return json({
      success: subscriptionStatus.hasActiveSubscription,
      subscription: subscriptionStatus.subscription,
      shop: session.shop,
    });
  } catch (error) {
    console.error("Error verifying subscription:", error);
    return json({
      success: false,
      error: "Failed to verify subscription"
    });
  }
};

export default function BillingConfirmation() {
  const data = useLoaderData<any>() as any;
  const success = !!data?.success;
  const subscription = data?.subscription ?? null;
  const error = data?.error ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const fetcher = useFetcher();

  useEffect(() => {
    // Simulate loading time for better UX
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleSyncMetafield = () => {
    setSyncStatus("Syncing...");
    fetcher.submit({}, { method: "POST", action: "/api/trigger-metafield-sync" });
  };

  useEffect(() => {
    if (fetcher.data && typeof fetcher.data === 'object') {
      const data = fetcher.data as { success?: boolean; error?: string };
      if (data.success) {
        setSyncStatus("✅ Metafield synced successfully! Theme blocks should now work.");
      } else {
        setSyncStatus(`❌ Sync failed: ${data.error || "Unknown error"}`);
      }
    }
  }, [fetcher.data]);

  if (isLoading) {
    return (
      <s-page heading="Processing Subscription">
        <s-section>
          <s-stack gap="base" direction="block" alignItems="center">
            <s-spinner size="large" />
            <s-paragraph>Processing your subscription...</s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Subscription Confirmation">
      <s-section>
        <s-stack gap="base" direction="block">
          {success ? (
            <s-section>
              <s-stack gap="base" direction="block">
                <s-banner tone="success" heading="Subscription Activated Successfully!">
                  <s-paragraph>
                    Your subscription to <strong>{subscription?.name}</strong> has been activated.
                  </s-paragraph>
                </s-banner>
                
                <s-paragraph>
                  You now have access to all premium features. You can manage your subscription 
                  anytime from the billing dashboard.
                </s-paragraph>

                {syncStatus && (
                  <s-banner tone={syncStatus.includes("✅") ? "success" : "critical"}>
                    <s-paragraph>{syncStatus}</s-paragraph>
                  </s-banner>
                )}
                
                <s-stack gap="base" direction="inline">
                  <ViewPlansLink>
                    View Pricing Plans
                  </ViewPlansLink>
                  
                  <s-button 
                    onClick={handleSyncMetafield}
                    loading={fetcher.state === "submitting"}
                    disabled={fetcher.state === "submitting"}
                  >
                    Sync Theme Blocks
                  </s-button>
                  
                  <Link to="/app">
                    <s-button variant="secondary">
                      Back to App
                    </s-button>
                  </Link>
                </s-stack>
              </s-stack>
            </s-section>
          ) : (
            <s-section>
              <s-stack gap="base" direction="block">
                <s-banner tone="critical" heading="Subscription Failed">
                  <s-paragraph>
                    {error ? toMessage(error) : "There was an error processing your subscription."}
                  </s-paragraph>
                </s-banner>
                
                <s-paragraph>
                  Please try again or contact support if the problem persists.
                </s-paragraph>
                
                <s-stack gap="base" direction="inline">
                  <ViewPlansLink>
                    View Pricing Plans
                  </ViewPlansLink>
                  
                  <Link to="/app">
                    <s-button variant="secondary">
                      Back to App
                    </s-button>
                  </Link>
                </s-stack>
              </s-stack>
            </s-section>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
