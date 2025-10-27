import { useRouteLoaderData, useActionData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { toMessage } from "../lib/errors";
import { Suspense, lazy } from "react";
import { ViewPlansLink } from "../components/ViewPlansLink";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
    <Page title={title}>
      <Layout>
        <Layout.Section>
          <Banner tone="critical">
            <p>An error occurred: {message}</p>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default function Index() {
  const data = useRouteLoaderData("routes/app") as any;
  const shop = data?.shop as string ?? "";
  const hasActiveSub = Boolean(data?.hasActiveSub);
  const actionData = useActionData<typeof action>();

  return (
    <Page title="Urgify – Urgency Marketing Suite">
      <Layout>
        <Layout.Section>
          <Banner
            title={hasActiveSub ? 'Subscription active' : 'No active subscription'}
            tone={hasActiveSub ? 'success' : 'warning'}
          >
            <p>
              {hasActiveSub
                ? 'You can use all app features: countdown timers, limited-time offers, smart stock alerts, scarcity banners, and complete customization options.'
                : 'A subscription is required to use all features.'}
            </p>
            {!hasActiveSub && (
              <div style={{ marginTop: '12px' }}>
                <ViewPlansLink />
              </div>
            )}
          </Banner>
        </Layout.Section>

        
        
        {/* Success/Error Messages */}
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">
              <p>{toMessage(actionData.error)}</p>
            </Banner>
          </Layout.Section>
        )}
        
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success">
              <p>Operation completed successfully</p>
            </Banner>
          </Layout.Section>
        )}



        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <div style={{ padding: "1rem" }}>
                <Text as="h3" variant="headingMd">Welcome to Urgify</Text>
                <div style={{ marginTop: "1rem" }}>
                  <Text as="p" variant="bodyMd">
                    Urgify provides urgency marketing tools for Shopify stores. 
                    Add countdown timers, limited-time offers, stock alerts, and scarcity banners to your product pages.
                  </Text>
                </div>

                <Suspense fallback={<div aria-busy="true">Loading features…</div>}>
                  {(() => {
                    const LazyFeatures = lazy(() => import("../components/Features"));
                    return <LazyFeatures />;
                  })()}
                </Suspense>
              </div>
            </Card>

            <Card>
              <div style={{ padding: "1rem" }}>
                <Text as="h3" variant="headingMd">Quick Access</Text>
                <div style={{ marginTop: "1rem" }}>
                  <InlineStack gap="400" wrap>
                    <Button 
                      url="/app/stock-alerts" 
                      variant="primary"
                      size="large"
                    >
                      📊 Stock Alerts
                    </Button>
                    <Button 
                      url="/app/pricing" 
                      variant="secondary"
                      size="large"
                    >
                      💰 Pricing
                    </Button>
                  </InlineStack>
                </div>
              </div>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: "1rem" }}>
              <Text as="h3" variant="headingMd">Setup guide</Text>
              <ol style={{ marginLeft: '1.5rem' }}>
                <li><Text as="span" variant="bodyMd"><strong>Open the Theme Editor:</strong> Online Store → Themes → Customize.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Add Urgify blocks:</strong> Add "Urgify Countdown", "Urgify Limited Offer", "Urgify Scarcity Banner", or "Urgify Stock Alert" to your sections.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Configure settings:</strong> Set target dates, messages, and thresholds for your urgency elements.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Choose styles:</strong> Select from various styles: Spectacular, Brutalist, Glassmorphism, and more.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Customize appearance:</strong> Adjust colors, fonts, and layout to match your theme.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Save & test:</strong> Save and test on your storefront.</Text></li>
              </ol>
              
              {hasActiveSub && (
                <div style={{ marginTop: "2rem", textAlign: "left" }}>
                  <Button
                    variant="primary"
                    accessibilityLabel="Open the Shopify Theme Editor in a new tab"
                    onClick={() => {
                      window.open('https://admin.shopify.com/themes/current/editor', '_blank');
                    }}
                  >
                    🎨 Go to Theme Editor
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: "1rem", textAlign: "center" }}>
              <Text as="h3" variant="headingMd">Enjoying Urgify?</Text>
              <div style={{ marginBottom: "1rem" }}>
                <Text as="p" variant="bodyMd">
                  If Urgify helps you create effective urgency experiences, please consider leaving a review.
                </Text>
              </div>
              <Button 
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
              </Button>
              <div style={{ marginTop: "0.5rem", color: "#6d7175" }}>
                <Text as="p" variant="bodySm">
                  Your feedback helps other merchants discover Urgify
                </Text>
              </div>
            </div>
          </Card>
        </Layout.Section>

        
      </Layout>
    </Page>
  );
}
