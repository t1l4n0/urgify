import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
// Polaris Web Components - no imports needed, components are global
import { useState } from "react";
import { toMessage } from "../lib/errors";

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
    return json({ error: toMessage(error), metafields: [] });
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
      error: "Failed to save test metafield: " + toMessage(error) 
    }, { status: 500 });
  }
};

export default function TestMetafields() {
  const data = useLoaderData<typeof loader>() as any;
  const metafields = (data?.metafields as any[]) || [];
  const error = data?.error as string | undefined;
  const fetcher = useFetcher();
  const [testValue, setTestValue] = useState("");

  const testMetafield = metafields.find((m: any) => m.key === "test_persistence");

  return (
    <s-page heading="Metafields Persistence Test">
      <s-section>
        <s-stack gap="base" direction="block">
          <s-heading>Metafields Persistence Test</s-heading>
          
          {error && (
            <s-banner tone="critical" heading="Error">
              {error}
            </s-banner>
          )}
          
          <s-paragraph>
            Found {metafields.length} metafields in urgify namespace
          </s-paragraph>
          
          <s-stack gap="base" direction="block">
            <s-text-field
              label="Test Value"
              value={testValue}
              onChange={(e) => setTestValue(e.currentTarget.value)}
              placeholder="Enter test value"
              autocomplete="off"
            />
            <s-button
              onClick={() => {
                fetcher.submit(
                  { testValue },
                  { method: "POST" }
                );
              }}
              loading={fetcher.state === "submitting"}
              variant="primary"
            >
              Save Test Metafield
            </s-button>
          </s-stack>
          
          {(fetcher.data as any)?.success && (
            <s-banner tone="success">
              ✅ Success: {(fetcher.data as any).message} - Value: {(fetcher.data as any).savedValue}
            </s-banner>
          )}
          
          {(fetcher.data as any)?.error && (
            <s-banner tone="critical" heading="Error">
              ❌ Error: {(fetcher.data as any).error}
            </s-banner>
          )}
          
          <s-section heading="Current Test Metafield">
            <s-box padding="base" background="subdued" borderRadius="base">
              <pre style={{ margin: 0, overflow: 'auto' }}>
                {testMetafield ? JSON.stringify(testMetafield, null, 2) : "No test metafield found"}
              </pre>
            </s-box>
          </s-section>
          
          <s-section heading="All Urgify Metafields">
            <s-box padding="base" background="subdued" borderRadius="base" style={{ maxHeight: '400px', overflow: 'auto' }}>
              <pre style={{ margin: 0 }}>
                {JSON.stringify(metafields, null, 2)}
              </pre>
            </s-box>
          </s-section>
        </s-stack>
      </s-section>
    </s-page>
  );
}
