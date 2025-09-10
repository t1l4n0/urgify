import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { addDocumentResponseHeaders } from "../shopify.server";

export const headers = addDocumentResponseHeaders;

export async function loader(_args: LoaderFunctionArgs) {
  return json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}


