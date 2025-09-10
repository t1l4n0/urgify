import { useRouteLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
} from "@shopify/polaris";

export default function Index() {
  const data = useRouteLoaderData("routes/app") as any;
  const shop = data?.shop as string;
  const hasActiveSub = Boolean(data?.hasActiveSub);

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
