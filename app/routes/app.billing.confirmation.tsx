import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useNavigate } from "@remix-run/react";
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
import { adminPlansPath } from "../lib/adminPaths";

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
  const data = useLoaderData<typeof loader>();
  const success = 'success' in data ? data.success : false;
  const subscription = 'subscription' in data ? data.subscription : null;
  const error = 'error' in data ? data.error : null;
  const shop = 'shop' in data ? data.shop : '';
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const goToPricingPlans = () => {
    // Use App Bridge v4 to navigate to pricing plans
    navigate(adminPlansPath('urgify'));
  };

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
                    
                    <InlineStack gap="300">
                      <Button 
                        variant="primary"
                        onClick={goToPricingPlans}
                      >
                        View Pricing Plans
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
                      {error || "There was an error processing your subscription."}
                    </Text>
                    
                    <Text as="p" variant="bodyMd">
                      Please try again or contact support if the problem persists.
                    </Text>
                    
                    <InlineStack gap="300">
                      <Button 
                        variant="primary"
                        onClick={goToPricingPlans}
                      >
                        View Pricing Plans
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
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
