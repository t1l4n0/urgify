import type { LoaderFunctionArgs } from "@remix-run/node";
import { readFile } from "node:fs/promises";

export async function loader(_args: LoaderFunctionArgs) {
  const startedAt = (globalThis as any).__app_started_at || Date.now();
  (globalThis as any).__app_started_at = startedAt;
  const uptimeMs = Date.now() - startedAt;
  const version = await readFile(process.env.BUILD_ID_FILE ?? "BUILD_ID", "utf8").catch(() => "unknown");

  return new Response(JSON.stringify({ ok: true, uptimeMs, version: version.trim() }), { 
    status: 200, 
    headers: { 
      "content-type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    } 
  });
}


