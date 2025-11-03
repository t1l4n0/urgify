import { useRouteLoaderData, useActionData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { toMessage } from "../lib/errors";
import { Suspense, lazy } from "react";
import { ViewPlansLink } from "../components/ViewPlansLink";
import { authenticate } from "../shopify.server";

// App embedding is managed through the Theme Editor, not programmatically
export const action = async ({ request }: ActionFunctionArgs) => {
  return json({ success: false, error: "App embedding must be enabled manually through the Theme Editor" });
};

// Safe loader that never throws
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") ?? undefined;
    
    // Sync subscription status to metafield for Liquid templates
    try {
      const { admin } = await authenticate.admin(request);

      // Get shop ID for metafield sync
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
        const { syncSubscriptionStatusToMetafield } = await import("../utils/billing");
        const syncResult = await syncSubscriptionStatusToMetafield(admin, shopId);
        console.log("Metafield sync in app._index:", syncResult);
      }
    } catch (syncError) {
      console.error("Failed to sync subscription status in app._index:", syncError);
      // Continue with normal flow even if sync fails
    }
    
    return json({ shop }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("app._index loader failed", err);
    return json({ shop: undefined }, { headers: { "Cache-Control": "no-store" } });
  }
}

// Zeig Fehler im UI statt "Unexpected Server Error"
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Route error in app._index:", error);

  let title = "Error";
  let message = "Unknown error";
  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    try {
      message = typeof error.data === "string" ? error.data : JSON.stringify(error.data);
    } catch {
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = toMessage(error);
  } else if (typeof error === "string") {
    message = error;
  }

  return (
    <s-page heading={title}>
      <s-section>
        <s-banner tone="critical" heading="Error">
          <s-paragraph>An error occurred: {message}</s-paragraph>
        </s-banner>
      </s-section>
    </s-page>
  );
}

export default function Index() {
  const data = useRouteLoaderData("routes/app") as any;
  const hasActiveSub = Boolean(data?.hasActiveSub);
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Urgify – Urgency Marketing Suite">
      <s-banner
        heading={hasActiveSub ? 'Subscription active' : 'No active subscription'}
        tone={hasActiveSub ? 'success' : 'warning'}
      >
        <s-paragraph>
          {hasActiveSub
            ? 'You can use all app features: countdown timers, limited-time offers, smart stock alerts, scarcity banners, and complete customization options.'
            : 'A subscription is required to use all features.'}
        </s-paragraph>
        {!hasActiveSub && (
          <div slot="secondary-actions" style={{ marginTop: '12px' }}>
            <ViewPlansLink />
          </div>
        )}
      </s-banner>

      {/* Success/Error Messages */}
      {actionData?.error && (
        <s-section>
          <s-banner tone="critical" heading="Error">
            <s-paragraph>{toMessage(actionData.error)}</s-paragraph>
          </s-banner>
        </s-section>
      )}
      
      {actionData?.success && (
        <s-section>
          <s-banner tone="success" heading="Success">
            <s-paragraph>Operation completed successfully</s-paragraph>
          </s-banner>
        </s-section>
      )}

      <s-section heading="Welcome to Urgify">
        <s-stack gap="base">
          <s-paragraph>
            Urgify provides urgency marketing tools for Shopify stores. 
            Add countdown timers, limited-time offers, stock alerts, and scarcity banners to your product pages.
          </s-paragraph>

          <Suspense fallback={<div aria-busy="true">Loading features…</div>}>
            {(() => {
              const LazyFeatures = lazy(() => import("../components/Features"));
              return <LazyFeatures />;
            })()}
          </Suspense>
        </s-stack>
      </s-section>

      <s-section heading="Setup guide">
        <s-stack gap="base">
          <s-paragraph>
            Follow these steps to set up Urgify blocks in your theme and start creating urgency experiences for your customers.
          </s-paragraph>
          <s-ordered-list>
            <s-ordered-list-item>
              <s-paragraph><strong>Open the Theme Editor:</strong> Online Store → Themes → Customize.</s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph><strong>Add Urgify blocks:</strong> Add "Urgify Countdown", "Urgify Limited Offer", "Urgify Scarcity Banner", or "Urgify Stock Alert" to your sections.</s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph><strong>Configure settings:</strong> Set target dates, messages, and thresholds for your urgency elements.</s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph><strong>Choose styles:</strong> Select from various styles: Spectacular, Brutalist, Glassmorphism, and more.</s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph><strong>Customize appearance:</strong> Adjust colors, fonts, and layout to match your theme.</s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph><strong>Save & test:</strong> Save and test on your storefront.</s-paragraph>
            </s-ordered-list-item>
          </s-ordered-list>
          
          {hasActiveSub && (
            <s-button
              variant="primary"
              accessibilityLabel="Open the Shopify Theme Editor in a new tab"
              onClick={() => {
                window.open('https://admin.shopify.com/themes/current/editor', '_blank');
              }}
            >
              🎨 Go to Theme Editor
            </s-button>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Enjoying Urgify?">
        <s-stack gap="base" alignItems="center">
          <s-paragraph>
            If Urgify helps you create effective urgency experiences, please consider leaving a review.
          </s-paragraph>
          <s-button 
            variant="primary" 
            tone="success"
            accessibilityLabel="Leave a review for Urgify"
            onClick={() => {
              // Shopify App Bridge v4 Review API, fails gracefully if unavailable
              if (typeof window !== 'undefined' && (window as any).shopify?.reviews?.request) {
                (window as any).shopify.reviews.request().catch(() => {});
              }
            }}
          >
            ⭐ Leave a Review
          </s-button>
          <s-paragraph tone="subdued" color="subdued">
            Your feedback helps other merchants discover Urgify
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
