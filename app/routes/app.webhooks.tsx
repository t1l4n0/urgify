import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { WEBHOOK_EVENTS } from "../utils/webhooks";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  DataTable,
  Banner,
  Divider,
  List,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Mock webhook status data - in production, this would come from a database
  const webhookStatus = {
    totalWebhooks: 12,
    activeWebhooks: 10,
    failedWebhooks: 2,
    lastProcessed: new Date().toISOString(),
    webhookEvents: Object.values(WEBHOOK_EVENTS).map((event, index) => ({
      id: index + 1,
      event,
      status: Math.random() > 0.2 ? 'active' : 'failed',
      lastProcessed: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      successRate: Math.floor(Math.random() * 40) + 60, // 60-100%
    })),
    recentActivity: [
      {
        id: 1,
        event: 'app/uninstalled',
        shop: session.shop,
        status: 'success',
        timestamp: new Date(Date.now() - 300000).toISOString(),
      },
      {
        id: 2,
        event: 'products/create',
        shop: session.shop,
        status: 'success',
        timestamp: new Date(Date.now() - 600000).toISOString(),
      },
      {
        id: 3,
        event: 'orders/create',
        shop: session.shop,
        status: 'failed',
        timestamp: new Date(Date.now() - 900000).toISOString(),
      },
    ],
  };
  
  return json({
    webhookStatus,
    shop: session.shop,
  });
};

export default function WebhookDashboard() {
  const { webhookStatus, shop } = useLoaderData<typeof loader>();
  const { totalWebhooks, activeWebhooks, failedWebhooks, lastProcessed, webhookEvents, recentActivity } = webhookStatus;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'failed': return 'critical';
      case 'success': return 'success';
      default: return 'subdued';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'failed': return 'Failed';
      case 'success': return 'Success';
      default: return 'Unknown';
    }
  };

  // Webhook events table data
  const webhookEventsData = webhookEvents.map((webhook) => [
    webhook.id,
    webhook.event,
    `${webhook.successRate}%`,
    getStatusText(webhook.status),
    new Date(webhook.lastProcessed).toLocaleString(),
  ]);

  // Recent activity table data
  const recentActivityData = recentActivity.map((activity) => [
    activity.id,
    activity.event,
    activity.shop,
    getStatusText(activity.status),
    new Date(activity.timestamp).toLocaleString(),
  ]);

  return (
    <Page title="Webhook Dashboard" subtitle={`Shop: ${shop}`}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Webhook Status Overview */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Webhook Status Overview</Text>
                
                <InlineStack gap="800">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Total Webhooks</Text>
                    <Text variant="headingLg">{totalWebhooks}</Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Active</Text>
                    <Text variant="headingLg" color="success">{activeWebhooks}</Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Failed</Text>
                    <Text variant="headingLg" color="critical">{failedWebhooks}</Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Last Processed</Text>
                    <Text variant="bodyMd">{new Date(lastProcessed).toLocaleString()}</Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Webhook Events Status */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Webhook Events Status</Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['#', 'Event', 'Success Rate', 'Status', 'Last Processed']}
                  rows={webhookEventsData}
                />
              </BlockStack>
            </Card>

            {/* Recent Activity */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Recent Activity</Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['#', 'Event', 'Shop', 'Status', 'Timestamp']}
                  rows={recentActivityData}
                />
              </BlockStack>
            </Card>

            {/* Webhook Configuration */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Webhook Configuration</Text>
                
                <BlockStack gap="300">
                  <Text variant="bodyMd" fontWeight="semibold">Configured Events:</Text>
                  <List>
                    {Object.values(WEBHOOK_EVENTS).map((event) => (
                      <List.Item key={event}>{event}</List.Item>
                    ))}
                  </List>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text variant="bodyMd" fontWeight="semibold">Webhook Endpoints:</Text>
                  <List>
                    <List.Item>App Lifecycle: /webhooks/app/*</List.Item>
                    <List.Item>Customer Data: /webhooks/customers/*</List.Item>
                    <List.Item>Shop Data: /webhooks/shop/*</List.Item>
                  </List>
                </BlockStack>

                <Divider />

                <Banner status="info">
                  <Text variant="bodyMd">
                    Webhooks are automatically configured when the app is installed. 
                    They handle real-time updates from Shopify and ensure data consistency.
                  </Text>
                </Banner>
              </BlockStack>
            </Card>

            {/* Webhook Health Status */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Webhook Health Status</Text>
                
                <BlockStack gap="300">
                  <InlineStack gap="400" align="space-between">
                    <Text variant="bodyMd">Overall Health</Text>
                    <Badge status={failedWebhooks === 0 ? 'success' : 'warning'}>
                      {failedWebhooks === 0 ? 'Healthy' : 'Issues Detected'}
                    </Badge>
                  </InlineStack>
                  
                  <InlineStack gap="400" align="space-between">
                    <Text variant="bodyMd">Success Rate</Text>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {Math.round((activeWebhooks / totalWebhooks) * 100)}%
                    </Text>
                  </InlineStack>
                  
                  <InlineStack gap="400" align="space-between">
                    <Text variant="bodyMd">Last Error</Text>
                    <Text variant="bodyMd" color="subdued">
                      {failedWebhooks > 0 ? '2 hours ago' : 'No recent errors'}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
