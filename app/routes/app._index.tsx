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
            ? 'You can use all app features: countdown timers, limited-time offers, smart stock alerts, scarcity banners, smart popups, and complete customization options.'
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
            Add countdown timers, limited-time offers, stock alerts, scarcity banners, and smart popups to your product pages.
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
          
          <s-paragraph>
            <strong>Step 1: Enable Urgify Core</strong><br />
            Before adding any Urgify blocks, you need to enable the core Urgify functionality. Go to <strong>Online Store → Themes</strong> in your Shopify admin, click <strong>"Customize"</strong> on your active theme, scroll down to <strong>"App embeds"</strong> or <strong>"Theme app extensions"</strong> in the left sidebar, find and enable the <strong>"Urgify"</strong> app embed (this activates all Urgify functions), and click <strong>"Save"</strong> in the top right corner.
          </s-paragraph>

          <s-paragraph>
            <strong>Step 2: Add Urgify Blocks to Your Pages</strong><br />
            Now you can add specific Urgify blocks to your product pages, collection pages, or homepage. While in the Theme Editor, navigate to a <strong>Product page</strong> (or any page where you want to add urgency elements), click <strong>"Add block"</strong> or <strong>"Add section"</strong> in the left sidebar, search for and select one of these Urgify blocks: <strong>Urgify – Countdown</strong> (displays a countdown timer for time-limited offers), <strong>Urgify – Limited Offer</strong> (shows limited-time deals with expiration countdown), or <strong>Urgify – Scarcity Banner</strong> (displays low stock alerts based on inventory levels), and drag the block to your desired position on the page (e.g., above the "Add to cart" button, below product images, or in the product description area).
          </s-paragraph>

          <s-paragraph>
            <strong>Step 3: Configure Your Urgify Blocks</strong><br />
            Each block has specific settings you can customize. For <strong>Countdown Timer</strong>, set the target date and time, choose a display format (days/hours/minutes/seconds), and customize the message text. For <strong>Limited Offer</strong>, configure the offer expiration date, discount percentage, and promotional text. For <strong>Scarcity Banner</strong>, set the inventory threshold (e.g., show when stock is below 10 items), customize the warning message, and choose when to display it.
          </s-paragraph>

          <s-paragraph>
            <strong>Step 4: Style Your Blocks</strong><br />
            Make your urgency elements match your brand. Choose from pre-built styles: <strong>Spectacular</strong> (bold gradients), <strong>Brutalist</strong> (minimalist), <strong>Glassmorphism</strong> (modern glass effect), and more. Customize colors by setting background colors, text colors, and accent colors to match your theme. Adjust typography by choosing font sizes, weights, and alignments (left, center, right). Fine-tune spacing by controlling padding and margins for optimal placement.
          </s-paragraph>

          <s-paragraph>
            <strong>Step 5: Test and Publish</strong><br />
            Click <strong>"Save"</strong> after configuring each block. Use the <strong>"Preview"</strong> button to see how your blocks look on different devices (desktop, tablet, mobile). Visit your storefront to verify the blocks are displaying correctly and countdown timers are working. Once satisfied, click <strong>"Publish"</strong> to make your changes live.
          </s-paragraph>

          <s-paragraph>
            <strong>Pro Tips:</strong> Countdown timers work best above the "Add to cart" button or near the product price. Stock alerts automatically appear when inventory falls below your threshold (no manual block needed). You can add multiple Urgify blocks to the same page for different urgency messages. Some blocks can be set to show only on specific product types or collections.
          </s-paragraph>
          
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
