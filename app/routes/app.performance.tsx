import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { getPerformanceDashboard } from "../utils/performance";
import {
  Page,
  Layout,
  Card,
  Text,
  DataTable,
  Badge,
  BlockStack,
  InlineStack,
  ProgressBar,
  Divider,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Get performance dashboard data
  const dashboard = getPerformanceDashboard();
  
  return json({
    dashboard,
    shop: session.shop,
  });
};

export default function PerformanceDashboard() {
  const { dashboard, shop } = useLoaderData<typeof loader>();
  const { summary, totalRequests, recentMetrics, performanceScore } = dashboard;

  // Format performance score color
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'critical';
  };

  // Format time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Recent metrics table data
  const recentMetricsData = recentMetrics.map((metric, index) => [
    index + 1,
    metric.route,
    formatTime(metric.loadTime),
    metric.apiCalls,
    formatTime(metric.apiResponseTime),
    new Date(metric.timestamp).toLocaleTimeString(),
  ]);

  // Slowest routes table data
  const slowestRoutesData = summary.slowestRoutes.map((route, index) => [
    index + 1,
    route.route,
    formatTime(route.loadTime),
    route.loadTime > 2000 ? 'Slow' : route.loadTime > 1000 ? 'Moderate' : 'Fast',
  ]);

  return (
    <Page title="Performance Dashboard" subtitle={`Shop: ${shop}`}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Performance Score */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Performance Score</Text>
                <InlineStack gap="400" align="space-between">
                  <Text variant="bodyMd">Overall Performance</Text>
                  <Badge status={getScoreColor(performanceScore)}>
                    {performanceScore}/100
                  </Badge>
                </InlineStack>
                <ProgressBar progress={performanceScore} size="small" />
              </BlockStack>
            </Card>

            {/* Key Metrics */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Key Metrics</Text>
                <InlineStack gap="800">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Average Load Time</Text>
                    <Text variant="headingLg">{formatTime(summary.averageLoadTime)}</Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Total API Calls</Text>
                    <Text variant="headingLg">{summary.totalApiCalls}</Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Avg API Response</Text>
                    <Text variant="headingLg">{formatTime(summary.averageApiResponseTime)}</Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Total Requests</Text>
                    <Text variant="headingLg">{totalRequests}</Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Slowest Routes */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Slowest Routes</Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text']}
                  headings={['#', 'Route', 'Load Time', 'Status']}
                  rows={slowestRoutesData}
                />
              </BlockStack>
            </Card>

            {/* Recent Metrics */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Recent Requests</Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['#', 'Route', 'Load Time', 'API Calls', 'API Time', 'Timestamp']}
                  rows={recentMetricsData}
                />
              </BlockStack>
            </Card>

            {/* Performance Tips */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Performance Tips</Text>
                <BlockStack gap="200">
                  {summary.averageLoadTime > 1000 && (
                    <Text variant="bodyMd" color="critical">
                      ⚠️ Average load time is high. Consider optimizing bundle size or implementing code splitting.
                    </Text>
                  )}
                  {summary.averageApiResponseTime > 500 && (
                    <Text variant="bodyMd" color="warning">
                      ⚠️ API response times are slow. Check Shopify API rate limits and optimize queries.
                    </Text>
                  )}
                  {summary.averageLoadTime <= 500 && summary.averageApiResponseTime <= 200 && (
                    <Text variant="bodyMd" color="success">
                      ✅ Performance looks good! Keep monitoring for any regressions.
                    </Text>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
