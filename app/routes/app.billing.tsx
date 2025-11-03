import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager, BILLING_CONFIG, formatPrice } from "../utils/billing";
// Polaris Web Components - no imports needed, components are global
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
  if ((fetcher.data as any)?.success && (fetcher.data as any)?.confirmationUrl) {
    window.location.href = (fetcher.data as any).confirmationUrl as string;
  }

  // Handle subscription cancellation
  if ((fetcher.data as any)?.success && (fetcher.data as any)?.action === "cancel_subscription") {
    revalidator.revalidate();
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
    <s-page heading="Billing Dashboard">
      <s-section>
        <s-stack gap="base" direction="block">
          {/* Current Subscription Status */}
          <s-section heading="Current Subscription">
            {subscriptionStatus.hasActiveSubscription && subscriptionStatus.subscription ? (
              <s-stack gap="base" direction="block">
                <s-stack gap="base" direction="inline" justifyContent="space-between">
                  <s-paragraph type="strong">
                    {subscriptionStatus.subscription.name}
                  </s-paragraph>
                  <s-badge tone={getStatusColor(subscriptionStatus.subscription.status) as any}>
                    {getStatusText(subscriptionStatus.subscription.status)}
                  </s-badge>
                </s-stack>
                
                <s-stack gap="base" direction="inline" justifyContent="space-between">
                  <s-paragraph>
                    {formatPrice(subscriptionStatus.subscription.price, subscriptionStatus.subscription.currency)}
                    /{subscriptionStatus.subscription.interval}
                  </s-paragraph>
                  <s-paragraph color="subdued">
                    Next billing: {new Date(subscriptionStatus.subscription.currentPeriodEnd).toLocaleDateString()}
                  </s-paragraph>
                </s-stack>

                {/* Trial Status */}
                {subscriptionStatus.isTrialActive && subscriptionStatus.daysUntilTrialEnds && (
                  <s-stack gap="base" direction="block">
                    <s-paragraph tone="caution">
                      Trial ends in {subscriptionStatus.daysUntilTrialEnds} days
                    </s-paragraph>
                    {/* ProgressBar wird durch s-box mit CSS ersetzt */}
                    <s-box 
                      background="subdued" 
                      padding="base"
                      style={{
                        width: `${Math.max(0, 100 - (subscriptionStatus.daysUntilTrialEnds / BILLING_CONFIG.TRIAL_DAYS) * 100)}%`,
                        height: '8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--p-color-bg-success)'
                      }}
                    />
                  </s-stack>
                )}

                {/* Cancel Button */}
                <s-button 
                  variant="tertiary" 
                  tone="critical"
                  commandFor="cancel-subscription-modal"
                  command="--show"
                  onClick={() => setShowCancelModal(true)}
                >
                  Cancel Subscription
                </s-button>
              </s-stack>
            ) : (
              <s-stack gap="base" direction="block">
                <s-paragraph color="subdued">
                  No active subscription
                </s-paragraph>
                
                {isEligibleForTrial && (
                  <s-banner tone="info" heading="Trial Available">
                    You're eligible for a {BILLING_CONFIG.TRIAL_DAYS}-day free trial!
                  </s-banner>
                )}
                
                <s-button 
                  variant="primary" 
                  commandFor="plan-selection-modal"
                  command="--show"
                  onClick={() => setShowPlanModal(true)}
                >
                  Choose a Plan
                </s-button>
              </s-stack>
            )}
          </s-section>

          {/* Available Plans */}
          <s-section heading="Available Plans">
            <s-stack gap="base" direction="block">
              {Object.values(plans).map((plan) => (
                <s-section key={plan.id} heading={plan.name}>
                  <s-stack gap="base" direction="block">
                    <s-stack gap="base" direction="inline" justifyContent="space-between">
                      <s-stack gap="base" direction="block">
                        <s-heading level="2">{plan.name}</s-heading>
                        <s-heading level="1">
                          {formatPrice(plan.price, plan.currency)}
                          <s-text color="subdued">/{plan.interval}</s-text>
                        </s-heading>
                      </s-stack>
                      
                      {!subscriptionStatus.hasActiveSubscription && (
                  <s-button 
                  variant="primary" 
                  commandFor="plan-selection-modal"
                  command="--show"
                  onClick={() => {
                    setSelectedPlan(plan.id);
                    setShowPlanModal(true);
                  }}
                >
                  Select Plan
                </s-button>
                      )}
                    </s-stack>
                    
                    <s-unordered-list>
                      {plan.features.map((feature, index) => (
                        <s-unordered-list-item key={index}>{feature}</s-unordered-list-item>
                      ))}
                    </s-unordered-list>
                  </s-stack>
                </s-section>
              ))}
            </s-stack>
          </s-section>

          {/* Error Banner */}
          {(fetcher.data as any)?.error && (
            <s-banner tone="critical" heading="Error">
              {(fetcher.data as any).error}
            </s-banner>
          )}
        </s-stack>
      </s-section>

      {/* Plan Selection Modal */}
      {showPlanModal && (
        <s-modal 
          id="plan-selection-modal"
          heading="Select a Plan"
        >
          <s-choice-list
            label="Select a Plan"
            values={selectedPlan ? [selectedPlan] : []}
            onChange={(e) => {
              const values = (e.currentTarget as any).values || [];
              if (values.length > 0) {
                handlePlanSelect(values[0]);
              }
            }}
          >
            {Object.values(plans).map((plan) => (
              <s-choice key={plan.id} value={plan.id} selected={selectedPlan === plan.id}>
                {plan.name} - {formatPrice(plan.price, plan.currency)}/{plan.interval}
              </s-choice>
            ))}
          </s-choice-list>
          <s-button 
            variant="primary" 
            onClick={async () => {
              await handleSubscribe();
              setShowPlanModal(false);
            }}
            disabled={!selectedPlan || fetcher.state === "submitting"}
            slot="primary-action"
            commandFor="plan-selection-modal"
            command="--hide"
          >
            Subscribe
          </s-button>
          <s-button 
            onClick={() => setShowPlanModal(false)}
            slot="secondary-actions"
            commandFor="plan-selection-modal"
            command="--hide"
          >
            Cancel
          </s-button>
        </s-modal>
      )}

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <s-modal 
          id="cancel-subscription-modal"
          heading="Cancel Subscription"
        >
          <s-paragraph>
            Are you sure you want to cancel your subscription? You'll lose access to all premium features.
          </s-paragraph>
          <s-button 
            variant="primary" 
            tone="critical"
            onClick={async () => {
              await handleCancel();
              setShowCancelModal(false);
            }}
            disabled={fetcher.state === "submitting"}
            slot="primary-action"
            commandFor="cancel-subscription-modal"
            command="--hide"
          >
            Yes, Cancel
          </s-button>
          <s-button 
            onClick={() => setShowCancelModal(false)}
            slot="secondary-actions"
            commandFor="cancel-subscription-modal"
            command="--hide"
          >
            Keep Subscription
          </s-button>
        </s-modal>
      )}
    </s-page>
  );
}
