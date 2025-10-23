import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { validateSessionToken } from "../utils/sessionToken";

/**
 * GraphQL API endpoint with session token authentication
 * Provides secure GraphQL access for frontend requests
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Enforce session token on GET as well
    const sessionToken = validateSessionToken(request);
    if (!sessionToken) {
      return json({ error: "Session token required" }, { status: 401 });
    }

    const { admin } = await authenticate.admin(request);

    const url = new URL(request.url);
    const query = url.searchParams.get('query');
    const variablesRaw = url.searchParams.get('variables');
    const first = url.searchParams.get('first');
    const after = url.searchParams.get('after');

    if (!query) {
      return json({ error: "GraphQL query required" }, { status: 400 });
    }

    let variables: Record<string, any> | undefined = undefined;
    if (variablesRaw) {
      try {
        variables = JSON.parse(variablesRaw);
      } catch {
        return json({ error: "Invalid variables JSON" }, { status: 400 });
      }
    }

    if (first) {
      variables = { ...(variables || {}), first: Number(first) };
    }
    if (after) {
      variables = { ...(variables || {}), after };
    }

    const response = await admin.graphql(query, { variables });
    const data = await response.json();
    return json({ success: true, data });
  } catch (error) {
    console.error("GraphQL API error:", error);
    return json({ error: "GraphQL request failed" }, { status: 500 });
  }
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Validate session token from Authorization header
    const sessionToken = validateSessionToken(request);
    if (!sessionToken) {
      return json(
        { error: "Session token required" },
        { status: 401 }
      );
    }

    // Authenticate the request using Shopify's session token
    const { admin, session } = await authenticate.admin(request);
    
    // Get GraphQL query from form data
    const formData = await request.formData();
    const query = formData.get('query') as string;
    const variables = formData.get('variables') as string;
    
    if (!query) {
      return json(
        { error: "GraphQL query required" },
        { status: 400 }
      );
    }

    // Parse variables if provided
    let parsedVariables = {};
    if (variables) {
      try {
        parsedVariables = JSON.parse(variables);
      } catch (error) {
        return json(
          { error: "Invalid variables JSON" },
          { status: 400 }
        );
      }
    }

    // Execute GraphQL query
    const response = await admin.graphql(query, {
      variables: parsedVariables,
    });
    
    const data = await response.json();

    return json({
      success: true,
      data,
      session: {
        shop: session.shop,
        isOnline: session.isOnline,
      }
    });

  } catch (error) {
    console.error("GraphQL API error:", error);
    return json(
      { 
        error: "GraphQL request failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
};
