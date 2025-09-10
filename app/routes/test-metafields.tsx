import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { Card, Page, Layout, Text, Button, BlockStack, FormLayout, TextField } from "@shopify/polaris";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Fetch shop metafields for stock alert settings
    const metafieldsResponse = await admin.graphql(`
      query getShopMetafields {
        shop {
          metafields(first: 50, namespace: "urgify") {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `);

    const metafieldsData = await metafieldsResponse.json();
    const metafields = metafieldsData.data?.shop?.metafields?.edges?.map((edge: any) => edge.node) || [];
    
    return json({ metafields, rawData: metafieldsData });
  } catch (error) {
    console.error("Error fetching metafields:", error);
    return json({ error: error.message, metafields: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const testValue = formData.get("testValue") as string;

    // Get shop ID
    const shopResponse = await admin.graphql(`
      query getShop {
        shop {
          id
        }
      }
    `);

    const shopData = await shopResponse.json();
    const shopId = shopData.data?.shop?.id;

    if (!shopId) {
      throw new Error("Could not retrieve shop ID");
    }

    // Save test metafield
    const response = await admin.graphql(`#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `, { 
      variables: { 
        metafields: [{
          ownerId: shopId,
          namespace: "urgify",
          key: "test_persistence",
          value: testValue,
          type: "single_line_text_field"
        }]
      } 
    });

    const data = await response.json();
    const userErrors = data?.data?.metafieldsSet?.userErrors || [];
    
    if (userErrors.length > 0) {
      console.error("Metafield error:", userErrors);
      throw new Error(`Failed to save metafield: ${userErrors[0]?.message || 'Unknown error'}`);
    }

    return json({ 
      success: true, 
      message: "Test metafield saved successfully",
      savedValue: testValue,
      metafield: data?.data?.metafieldsSet?.metafields?.[0]
    });
  } catch (error) {
    console.error("Error saving test metafield:", error);
    return json({ 
      error: "Failed to save test metafield: " + (error as Error).message 
    }, { status: 500 });
  }
};

export default function TestMetafields() {
  const { metafields, rawData, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [testValue, setTestValue] = useState("");

  const testMetafield = metafields.find(m => m.key === "test_persistence");

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Metafields Persistence Test
              </Text>
              
              {error && (
                <Text variant="bodyMd" as="p" tone="critical">
                  Error: {error}
                </Text>
              )}
              
              <Text variant="bodyMd" as="p">
                Found {metafields.length} metafields in urgify namespace
              </Text>
              
              <FormLayout>
                <TextField
                  label="Test Value"
                  value={testValue}
                  onChange={setTestValue}
                  placeholder="Enter test value"
                />
                <Button
                  onClick={() => {
                    fetcher.submit(
                      { testValue },
                      { method: "POST" }
                    );
                  }}
                  loading={fetcher.state === "submitting"}
                >
                  Save Test Metafield
                </Button>
              </FormLayout>
              
              {fetcher.data?.success && (
                <Text variant="bodyMd" as="p" tone="success">
                  ✅ Success: {fetcher.data.message} - Value: {fetcher.data.savedValue}
                </Text>
              )}
              
              {fetcher.data?.error && (
                <Text variant="bodyMd" as="p" tone="critical">
                  ❌ Error: {fetcher.data.error}
                </Text>
              )}
              
              <div>
                <Text variant="headingSm" as="h3">Current Test Metafield:</Text>
                <pre style={{ background: '#f6f6f7', padding: '16px', borderRadius: '4px', overflow: 'auto' }}>
                  {testMetafield ? JSON.stringify(testMetafield, null, 2) : "No test metafield found"}
                </pre>
              </div>
              
              <div>
                <Text variant="headingSm" as="h3">All Urgify Metafields:</Text>
                <pre style={{ background: '#f6f6f7', padding: '16px', borderRadius: '4px', overflow: 'auto', maxHeight: '400px' }}>
                  {JSON.stringify(metafields, null, 2)}
                </pre>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
