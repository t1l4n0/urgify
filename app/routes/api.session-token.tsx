import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { validateSessionToken } from "../utils/sessionToken";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);

    console.log("Session token API called:", {
      hasSession: !!session,
      // Token kommt aus App-Bridge Authorization Header, nicht aus serverseitiger Session
      hasToken: !!validateSessionToken(request),
      shop: session?.shop,
      isOnline: session?.isOnline
    });

    // Session Token aus Authorization Header lesen
    const sessionToken = validateSessionToken(request);
    if (!sessionToken) {
      return json({ error: "Session token required" }, { status: 401 });
    }

    return json({
      sessionToken: sessionToken,
      shop: session?.shop || 'unknown',
      isOnline: session?.isOnline || false,
    });
  } catch (error) {
    console.error("Session token error:", error);
    return json({ error: "Authentication failed" }, { status: 401 });
  }
};
