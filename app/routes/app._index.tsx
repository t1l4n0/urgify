import { useRouteLoaderData, useActionData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
} from "@shopify/polaris";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
// QuickstartChecklist intentionally hidden for now
// import QuickstartChecklist from "../components/QuickstartChecklist";

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
    message = error.message || message;
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
  const shop = data?.shop as string;
  const hasActiveSub = Boolean(data?.hasActiveSub);
  const actionData = useActionData<typeof action>();

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
    <Page title="Urgify – Urgency Marketing Suite">
      <Layout>
        {/* Quickstart Checklist hidden */}

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

        {/* Success/Error Messages */}
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">
              <p>{actionData.error}</p>
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
          <Card>
            <div style={{ padding: "1rem" }}>
              <Text as="h3" variant="headingMd">Welcome to Urgify</Text>
              <div style={{ marginTop: "1rem" }}>
              <Text as="p" variant="bodyMd">
                Urgify is a comprehensive urgency marketing suite for Shopify stores. 
                Create countdown timers, limited-time offers, stock alerts, scarcity banners, and urgency notifications to create urgency and engage customers.
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
                  <Text as="h4" variant="headingSm">⏰ Advanced Countdown Timers</Text>
                  <Text as="p" variant="bodyMd">Create stunning countdown timers with 4 different styles: Digital Clock, Flip Cards, Circular Progress, and Minimal. Fully customizable colors, animations, and responsive layouts.</Text>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <Text as="h4" variant="headingSm">🎯 Limited Time Offers</Text>
                  <Text as="p" variant="bodyMd">Design spectacular limited-time offers with 4 unique styles: Spectacular (animated), Brutalist Bold, Glassmorphism, and Neumorphism. Perfect for flash sales and special promotions.</Text>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <Text as="h4" variant="headingSm">📦 Smart Stock Alerts</Text>
                  <Text as="p" variant="bodyMd">Automatically display low stock warnings when inventory falls below your threshold. Customizable messages, colors, and animations to create urgency and inform customers.</Text>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <Text as="h4" variant="headingSm">⚠️ Scarcity Banners</Text>
                  <Text as="p" variant="bodyMd">Add scarcity messaging with customizable banners featuring 3 unique styles: Spectacular (animated), Brutalist Bold, and Glassmorphism. Perfect for creating urgency and highlighting product scarcity.</Text>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <Text as="h4" variant="headingSm">🎨 Complete Customization</Text>
                  <Text as="p" variant="bodyMd">Every element is fully customizable: colors, fonts, animations, positioning, and responsive behavior. Match your brand perfectly with our extensive styling options.</Text>
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
                <li><Text as="span" variant="bodyMd"><strong>Add Urgify blocks:</strong> Add "Urgify Countdown", "Urgify Limited Offer", "Urgify Scarcity Banner", or "Urgify Stock Alert" to your sections.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Configure settings:</strong> Set target dates, messages, and thresholds for your urgency elements.</Text></li>
                <li><Text as="span" variant="bodyMd"><strong>Choose styles:</strong> Select from various styles: Spectacular, Brutalist, Glassmorphism, and more.</Text></li>
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
                  If Urgify is helping you create urgency and boost sales, please consider leaving a review!
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
    </Page>
  );
}
