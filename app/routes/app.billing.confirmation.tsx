import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useLocation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager } from "../utils/billing";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Spinner,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { toMessage } from "../lib/errors";
import { ViewPlansLink } from "../components/ViewPlansLink";
import { useFetcher } from "@remix-run/react";

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
  const shop = data?.shop ?? '';
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const { search } = useLocation(); // enthält ?host=...&shop=...
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
    if (fetcher.data) {
      if (fetcher.data.success) {
        setSyncStatus("✅ Metafield synced successfully! Theme blocks should now work.");
      } else {
        setSyncStatus(`❌ Sync failed: ${fetcher.data.error || "Unknown error"}`);
      }
    }
  }, [fetcher.data]);

  if (isLoading) {
    return (
      <Page title="Processing Subscription">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400" align="center">
                <Spinner size="large" />
                <Text as="p" variant="bodyMd">Processing your subscription...</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Subscription Confirmation">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {success ? (
              <Card>
                <BlockStack gap="400">
                  <Banner tone="success">
                    <Text as="h2" variant="headingMd">Subscription Activated Successfully!</Text>
                  </Banner>
                  
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      Your subscription to <strong>{subscription?.name}</strong> has been activated.
                    </Text>
                    
                    <Text as="p" variant="bodyMd">
                      You now have access to all premium features. You can manage your subscription 
                      anytime from the billing dashboard.
                    </Text>

                    {syncStatus && (
                      <Banner tone={syncStatus.includes("✅") ? "success" : "critical"}>
                        <Text as="p" variant="bodyMd">{syncStatus}</Text>
                      </Banner>
                    )}
                    
                    <InlineStack gap="300">
                        <ViewPlansLink>
                          View Pricing Plans
                        </ViewPlansLink>
                      
                      <Button 
                        onClick={handleSyncMetafield}
                        loading={fetcher.state === "submitting"}
                        disabled={fetcher.state === "submitting"}
                      >
                        Sync Theme Blocks
                      </Button>
                      
                      <Link to="/app">
                        <Button variant="secondary">
                          Back to App
                        </Button>
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <BlockStack gap="400">
                  <Banner tone="critical">
                    <Text as="h2" variant="headingMd">Subscription Failed</Text>
                  </Banner>
                  
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      {error ? toMessage(error) : "There was an error processing your subscription."}
                    </Text>
                    
                    <Text as="p" variant="bodyMd">
                      Please try again or contact support if the problem persists.
                    </Text>
                    
                    <InlineStack gap="300">
                        <ViewPlansLink>
                          View Pricing Plans
                        </ViewPlansLink>
                      
                      <Link to="/app">
                        <Button variant="secondary">
                          Back to App
                        </Button>
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
