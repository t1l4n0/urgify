import { useRouteLoaderData, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  Toast,
} from "@shopify/polaris";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import QuickstartChecklist from "../components/QuickstartChecklist";
import { useState, useEffect } from "react";

// App embedding is managed through the Theme Editor, not programmatically
export const action = async ({ request }: ActionFunctionArgs) => {
  return json({ success: false, error: "App embedding must be enabled manually through the Theme Editor" });
};

// Safe loader that never throws
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") ?? undefined;
    // ⚠️ hier KEINE externen Calls, KEIN Throw
    return json({ shop }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("app._index loader failed", err);
    return json({ shop: undefined }, { headers: { "Cache-Control": "no-store" } });
  }
}

// Zeig Fehler im UI statt "Unexpected Server Error"
export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <Page title="Error">
      <Layout>
        <Layout.Section>
          <Banner status="critical">
            <p>An error occurred: {error.message}</p>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


export default function Index() {
  const data = useRouteLoaderData("routes/app") as any;
  const shop = data?.shop as string;
  const hasActiveSub = Boolean(data?.hasActiveSub);
  const isAppEmbeddingEnabled = Boolean(data?.isAppEmbeddingEnabled);
  const actionData = useActionData<typeof action>();
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const goToAdmin = (adminPath: string) => {
    const adminUrl = `https://${shop}/admin${adminPath}`;
    try {
      if (window.top) {
        window.top.location.href = adminUrl;
        return;
      }
    } catch (_e) {}
    window.location.href = adminUrl;
  };


  return (
    <Page title="Urgify – Countdown Timer">
      <Layout>
        <Layout.Section>
          <Banner
            title={hasActiveSub ? 'Subscription active' : 'No active subscription'}
            tone={hasActiveSub ? 'success' : 'warning'}
            action={hasActiveSub ? {
              content: '🎨 Go to Theme Editor',
              onAction: () => goToAdmin('/themes/current/editor'),
            } : {
              content: '📋 View Plans',
              onAction: () => goToAdmin('/charges/urgify-app/pricing_plans'),
            }}
          >
            <p>
              {hasActiveSub
                ? 'You can use all app features.'
                : 'A subscription is required to use all features.'}
            </p>
          </Banner>
        </Layout.Section>

        {/* Quickstart Checklist */}
        <Layout.Section>
          <QuickstartChecklist shop={shop} />
        </Layout.Section>

        {/* Success/Error Messages */}
        {actionData?.error && (
          <Layout.Section>
            <Banner status="critical">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}
        
        {actionData?.success && (
          <Layout.Section>
            <Banner status="success">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <div style={{ padding: "1rem" }}>
              <Text as="h3" variant="headingMd">Welcome to Urgify</Text>
              <div style={{ marginTop: "1rem" }}>
                <Text as="p" variant="bodyMd">
                  Urgify is an advanced countdown timer app for Shopify stores. 
                  Create beautiful, customizable countdown timers with multiple display formats and animations.
                </Text>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <Button variant="primary" onClick={() => goToAdmin('/themes/current/editor')}>
                  🎨 Go to Theme Editor
                </Button>
              </div>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: "1rem" }}>
              <Text as="h3" variant="headingMd">Key Features</Text>
              <div style={{ marginTop: "1rem" }}>
                <div style={{ marginBottom: "1rem" }}>
                  <Text as="h4" variant="headingSm">⏰ Advanced Countdown</Text>
                  <Text as="p" variant="bodyMd">Beautiful, customizable countdown timers with multiple display formats and animations.</Text>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <Text as="h4" variant="headingSm">🎨 Multiple Styles</Text>
                  <Text as="p" variant="bodyMd">Choose from various countdown styles: digital clocks, flip cards, circular progress, and more.</Text>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <Text as="h4" variant="headingSm">📅 Event Management</Text>
                  <Text as="p" variant="bodyMd">Create countdowns for sales, product launches, events, and special promotions.</Text>
                </div>
              </div>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: "1rem" }}>
              <Text as="h3" variant="headingMd">Setup guide</Text>
              <ol style={{ marginLeft: '1.5rem' }}>
                <li><Text as="span" variant="bodyMd"><strong>Open the Theme Editor:</strong> Online Store → Themes → Customize.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Add Countdown block:</strong> Add "Urgify Countdown" to your section.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Configure target date:</strong> Set the target date and time for your countdown.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Choose style:</strong> Select from various countdown styles and animations.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Customize appearance:</strong> Adjust colors, fonts, and layout to match your theme.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Save & test:</strong> Save and test on your storefront.</Text></li>
              </ol>
            </div>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <div style={{ padding: "1rem", textAlign: "center" }}>
              <Text as="h3" variant="headingMd">Enjoying Urgify?</Text>
              <div style={{ marginBottom: "1rem" }}>
                <Text as="p" variant="bodyMd">
                  If Urgify is helping you create beautiful countdown timers, please consider leaving a review!
                </Text>
              </div>
              <Button 
                variant="primary" 
                tone="success"
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
      
      {/* Success Toast */}
      {showSuccessToast && (
        <Toast
          content="✅ Urgify is now active! Your app embedding is enabled and working."
          onDismiss={() => setShowSuccessToast(false)}
        />
      )}
    </Page>
  );
}
