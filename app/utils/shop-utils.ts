export function normalizeShop(input: string) {
  const s = (input || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const m = s.match(/([a-z0-9-]+)\.myshopify\.com/i) || s.match(/store\/([a-z0-9-]+)/i);
  const handle = m ? m[1] : s.replace(/\..*$/, "");
  return `${handle.toLowerCase()}.myshopify.com`;
}
