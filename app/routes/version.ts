import { readFile } from "node:fs/promises";

export async function loader() {
  const id = await readFile(process.env.BUILD_ID_FILE ?? "BUILD_ID", "utf8").catch(() => "unknown");
  return new Response(id.trim(), {
    headers: {
      "content-type": "text/plain",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
