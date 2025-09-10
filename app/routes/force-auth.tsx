import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect: authRedirect } = await authenticate.admin(request);
  
  // Force OAuth re-authorization by redirecting to auth
  return authRedirect;
};
