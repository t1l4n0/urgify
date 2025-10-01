import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager, BILLING_CONFIG, formatPrice, getPlanFeatures } from "../utils/billing";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Badge,
  BlockStack,
  InlineStack,
  List,
  Banner,
  Divider,
  ProgressBar,
  Modal,
  FormLayout,
  RadioButton,
  ButtonGroup,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  const billingManager = new BillingManager(session.shop, admin);
  const subscriptionStatus = await billingManager.getSubscriptionStatus();
  const isEligibleForTrial = await billingManager.isEligibleForTrial();
  
  return json({
    subscriptionStatus,
    isEligibleForTrial,
    plans: BILLING_CONFIG.PLANS,
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const billingManager = new BillingManager(session.shop, admin);
  
  const formData = await request.formData();
  const action = formData.get("action") as string;
  
  try {
    switch (action) {
      case "create_subscription": {
        const planId = formData.get("planId") as string;
        const result = await billingManager.createSubscription(planId);
        
        if (result.success && result.confirmationUrl) {
          return json({ 
            success: true, 
            confirmationUrl: result.confirmationUrl 
          });
        } else {
          return json({ 
            success: false, 
            error: result.error || "Failed to create subscription" 
          });
        }
      }
      
      case "cancel_subscription": {
        const subscriptionId = formData.get("subscriptionId") as string;
        const result = await billingManager.cancelSubscription(subscriptionId);
        
        return json({ 
          success: result.success, 
          error: result.error 
        });
      }
      
      default:
        return json({ success: false, error: "Invalid action" });
    }
  } catch (error) {
    console.error("Billing action error:", error);
    return json({ 
      success: false, 
      error: "An error occurred while processing your request" 
    });
  }
};

export default function BillingDashboard() {
  const { subscriptionStatus, isEligibleForTrial, plans, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const handlePlanSelect = useCallback((planId: string) => {
    setSelectedPlan(planId);
  }, []);

  const handleSubscribe = useCallback(() => {
    if (!selectedPlan) return;
    
    fetcher.submit(
      { action: "create_subscription", planId: selectedPlan },
      { method: "post" }
    );
  }, [selectedPlan, fetcher]);

  const handleCancel = useCallback(() => {
    if (!subscriptionStatus.subscription) return;
    
    fetcher.submit(
      { 
        action: "cancel_subscription", 
        subscriptionId: subscriptionStatus.subscription.id 
      },
      { method: "post" }
    );
  }, [subscriptionStatus.subscription, fetcher]);

  // Handle subscription creation response
  if (fetcher.data?.success && fetcher.data?.confirmationUrl) {
    window.location.href = fetcher.data.confirmationUrl;
  }

  // Handle subscription cancellation
  if (fetcher.data?.success && fetcher.data?.action === "cancel_subscription") {
    revalidator.reload();
    setShowCancelModal(false);
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'trial': return 'info';
      case 'past_due': return 'warning';
      case 'cancelled': return 'critical';
      default: return 'subdued';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'trial': return 'Trial';
      case 'past_due': return 'Past Due';
      case 'cancelled': return 'Cancelled';
      default: return 'Unknown';
    }
  };

  return (
    <Page title="Billing Dashboard" subtitle={`Shop: ${shop}`}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Current Subscription Status */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Current Subscription</Text>
                
                {subscriptionStatus.hasActiveSubscription && subscriptionStatus.subscription ? (
                  <BlockStack gap="300">
                    <InlineStack gap="400" align="space-between">
                      <Text variant="bodyMd" fontWeight="semibold">
                        {subscriptionStatus.subscription.name}
                      </Text>
                      <Badge status={getStatusColor(subscriptionStatus.subscription.status)}>
                        {getStatusText(subscriptionStatus.subscription.status)}
                      </Badge>
                    </InlineStack>
                    
                    <InlineStack gap="400" align="space-between">
                      <Text variant="bodyMd">
                        {formatPrice(subscriptionStatus.subscription.price, subscriptionStatus.subscription.currency)}
                        /{subscriptionStatus.subscription.interval}
                      </Text>
                      <Text variant="bodyMd" color="subdued">
                        Next billing: {new Date(subscriptionStatus.subscription.currentPeriodEnd).toLocaleDateString()}
                      </Text>
                    </InlineStack>

                    {/* Trial Status */}
                    {subscriptionStatus.isTrialActive && subscriptionStatus.daysUntilTrialEnds && (
                      <BlockStack gap="200">
                        <Text variant="bodyMd" color="warning">
                          Trial ends in {subscriptionStatus.daysUntilTrialEnds} days
                        </Text>
                        <ProgressBar 
                          progress={Math.max(0, 100 - (subscriptionStatus.daysUntilTrialEnds / BILLING_CONFIG.TRIAL_DAYS) * 100)} 
                          size="small" 
                        />
                      </BlockStack>
                    )}

                    {/* Cancel Button */}
                    <Button 
                      variant="tertiary" 
                      tone="critical"
                      onClick={() => setShowCancelModal(true)}
                    >
                      Cancel Subscription
                    </Button>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    <Text variant="bodyMd" color="subdued">
                      No active subscription
                    </Text>
                    
                    {isEligibleForTrial && (
                      <Banner status="info">
                        You're eligible for a {BILLING_CONFIG.TRIAL_DAYS}-day free trial!
                      </Banner>
                    )}
                    
                    <Button 
                      variant="primary" 
                      onClick={() => setShowPlanModal(true)}
                    >
                      Choose a Plan
                    </Button>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Available Plans */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Available Plans</Text>
                
                <BlockStack gap="300">
                  {Object.values(plans).map((plan) => (
                    <Card key={plan.id} sectioned>
                      <BlockStack gap="300">
                        <InlineStack gap="400" align="space-between">
                          <BlockStack gap="100">
                            <Text variant="headingSm">{plan.name}</Text>
                            <Text variant="headingLg">
                              {formatPrice(plan.price, plan.currency)}
                              <Text variant="bodyMd" color="subdued">/{plan.interval}</Text>
                            </Text>
                          </BlockStack>
                          
                          {!subscriptionStatus.hasActiveSubscription && (
                            <Button 
                              variant="primary" 
                              onClick={() => {
                                setSelectedPlan(plan.id);
                                setShowPlanModal(true);
                              }}
                            >
                              Select Plan
                            </Button>
                          )}
                        </InlineStack>
                        
                        <List>
                          {plan.features.map((feature, index) => (
                            <List.Item key={index}>{feature}</List.Item>
                          ))}
                        </List>
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Error Banner */}
            {fetcher.data?.error && (
              <Banner status="critical">
                {fetcher.data.error}
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Plan Selection Modal */}
      <Modal
        open={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        title="Select a Plan"
        primaryAction={{
          content: "Subscribe",
          onAction: handleSubscribe,
          disabled: !selectedPlan || fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowPlanModal(false)
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            {Object.values(plans).map((plan) => (
              <RadioButton
                key={plan.id}
                label={`${plan.name} - ${formatPrice(plan.price, plan.currency)}/${plan.interval}`}
                checked={selectedPlan === plan.id}
                onChange={() => handlePlanSelect(plan.id)}
              />
            ))}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Cancel Subscription Modal */}
      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Subscription"
        primaryAction={{
          content: "Yes, Cancel",
          onAction: handleCancel,
          tone: "critical",
          disabled: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: "Keep Subscription",
            onAction: () => setShowCancelModal(false)
          }
        ]}
      >
        <Modal.Section>
          <Text variant="bodyMd">
            Are you sure you want to cancel your subscription? You'll lose access to all premium features.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
