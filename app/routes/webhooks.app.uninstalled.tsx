import { authenticate } from "../shopify.server";
import { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin } = await authenticate.webhook(request);

  if (!topic) {
    return new Response("Missing topic", { status: 400 });
  }

  if (topic === "APP_UNINSTALLED") {
    try {
      const payload = await request.json();
      console.log("App uninstalled:", payload);
      
      // Hier können Sie Cleanup-Logik implementieren
      // z.B. Datenbank-Bereinigung, externe API-Aufrufe, etc.
      
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing app uninstall:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }

  return new Response("Unhandled webhook topic", { status: 400 });
};
