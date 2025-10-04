export function adminPlansPath(appHandle = 'urgify') {
  const url = new URL(window.location.href);
  const shop = url.searchParams.get('shop')!;            // z.B. t1l4n0d3v.myshopify.com
  const host = url.searchParams.get('host')!;            // base64 host
  const storeSlug = shop.replace('.myshopify.com', '');  // z.B. t1l4n0d3v

  return `/store/${storeSlug}/apps/${appHandle}/pricing_plans?shop=${shop}&host=${host}`;
}
