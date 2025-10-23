import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);

    console.log("Session token API called:", {
      hasSession: !!session,
      hasToken: !!session?.token,
      shop: session?.shop,
      isOnline: session?.isOnline
    });

    // Do not generate fallback tokens; require real App Bridge session token
    const sessionToken = session?.token;
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
