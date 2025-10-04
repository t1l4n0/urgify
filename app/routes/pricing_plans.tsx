import { redirect } from "@remix-run/node";
import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Redirect to the billing page which contains the pricing plans
  return redirect("/app/billing");
};
