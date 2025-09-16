import { useRouteLoaderData, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
} from "@shopify/polaris";
import { json, type ActionFunctionArgs } from "@remix-run/node";

// App embedding is managed through the Theme Editor, not programmatically
export const action = async ({ request }: ActionFunctionArgs) => {
  return json({ success: false, error: "App embedding must be enabled manually through the Theme Editor" });
};


export default function Index() {
  const data = useRouteLoaderData("routes/app") as any;
  const shop = data?.shop as string;
  const hasActiveSub = Boolean(data?.hasActiveSub);
  const isAppEmbeddingEnabled = Boolean(data?.isAppEmbeddingEnabled);
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

        {/* Quickstart Card */}
        <Layout.Section>
          <Card>
            <div style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <Text as="h2" variant="headingMd">Quickstart</Text>
                <div style={{ minWidth: "200px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Text as="span" variant="bodySm" tone="subdued">0 of 1 completed</Text>
                    <div style={{ flex: 1, height: "8px", backgroundColor: "#e1e3e5", borderRadius: "4px" }}>
                      <div style={{ width: "0%", height: "100%", backgroundColor: "#008060", borderRadius: "4px" }}></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <Card sectioned>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Activate App</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Activate Urgify in your theme to enable all countdown timer functions.
                    </Text>
                  </div>
                  <a 
                    href={`/activate-embed?shop=${shop}`}
                    target="_top"
                    rel="noopener"
                    style={{ 
                      display: "inline-block",
                      padding: "8px 16px",
                      backgroundColor: "#008060",
                      color: "white",
                      textDecoration: "none",
                      borderRadius: "4px",
                      fontSize: "14px",
                      fontWeight: "500",
                      textAlign: "center",
                      minWidth: "80px"
                    }}
                  >
                    Activate
                  </a>
                </div>
              </Card>
            </div>
          </Card>
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
    </Page>
  );
}
