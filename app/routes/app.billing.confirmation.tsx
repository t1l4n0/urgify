import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
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
  const { success, subscription, error, shop } = useLoaderData<typeof loader>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading time for better UX
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <Page title="Processing Subscription">
        <Layout>
          <Layout.Section>
            <Card sectioned>
              <BlockStack gap="400" align="center">
                <Spinner size="large" />
                <Text variant="bodyMd">Processing your subscription...</Text>
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
                  <Banner status="success">
                    <Text variant="headingMd">Subscription Activated Successfully!</Text>
                  </Banner>
                  
                  <BlockStack gap="300">
                    <Text variant="bodyMd">
                      Your subscription to <strong>{subscription?.name}</strong> has been activated.
                    </Text>
                    
                    <Text variant="bodyMd">
                      You now have access to all premium features. You can manage your subscription 
                      anytime from the billing dashboard.
                    </Text>
                    
                    <InlineStack gap="300">
                      <Link to="/app/billing">
                        <Button variant="primary">
                          Go to Billing Dashboard
                        </Button>
                      </Link>
                      
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
                  <Banner status="critical">
                    <Text variant="headingMd">Subscription Failed</Text>
                  </Banner>
                  
                  <BlockStack gap="300">
                    <Text variant="bodyMd">
                      {error || "There was an error processing your subscription."}
                    </Text>
                    
                    <Text variant="bodyMd">
                      Please try again or contact support if the problem persists.
                    </Text>
                    
                    <InlineStack gap="300">
                      <Link to="/app/billing">
                        <Button variant="primary">
                          Try Again
                        </Button>
                      </Link>
                      
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
