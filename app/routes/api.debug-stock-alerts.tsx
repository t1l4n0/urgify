import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const locationId = url.searchParams.get("location") || null;
  
  try {
    // Fetch locations
    const locationsResponse = await admin.graphql(`
      query getLocations {
        locations(first: 250) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `);
    
    const locationsData = await locationsResponse.json();
    const parsedLocations = locationsData.data?.locations?.edges?.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
    })) || [];
    
    const selectedLocationId = locationId || parsedLocations[0]?.id || null;
    const selectedLocation = parsedLocations.find((loc: any) => loc.id === selectedLocationId);
    
    if (!selectedLocationId) {
      return json({
        error: "No location found",
        locations: parsedLocations,
      });
    }
    
    // Fetch inventory for the selected location
    const productsMap = new Map<string, any>();
    let cursor: string | null = null;
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = 10; // Limit to prevent infinite loops
    
    while (hasNextPage && pageCount < maxPages) {
      pageCount++;
      const response = await admin.graphql(
        `#graphql
          query inventoryLevelsByLocation($locationId: ID!, $cursor: String) {
            location(id: $locationId) {
              id
              name
              inventoryLevels(first: 250, after: $cursor) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  cursor
                  node {
                    quantities(names: ["available"]) {
                      name
                      quantity
                    }
                    item {
                      variant {
                        id
                        title
                        product {
                          id
                          title
                          handle
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        {
          variables: {
            locationId: selectedLocationId,
            cursor,
          },
        }
      );
      
      const data = await response.json();
      
      if (data.errors) {
        return json({
          error: "GraphQL errors",
          errors: data.errors,
          locationId: selectedLocationId,
          locationName: selectedLocation?.name,
        });
      }
      
      const location = data.data?.location;
      if (!location) {
        return json({
          error: "Location not found",
          locationId: selectedLocationId,
          locationName: selectedLocation?.name,
        });
      }
      
      const inventoryLevels = location.inventoryLevels?.edges || [];
      
      for (const edge of inventoryLevels) {
        const node = edge.node;
        const productId = node.item?.variant?.product?.id;
        const productTitle = node.item?.variant?.product?.title || "Unknown";
        const variantTitle = node.item?.variant?.title || "Default";
        
        if (!productId) continue;
        
        // Try multiple sources for available quantity
        let availableQty = 0;
        if (Array.isArray(node.quantities)) {
          const availableEntry = node.quantities.find((qty: any) => qty?.name === "available");
          if (availableEntry && typeof availableEntry.quantity === "number") {
            availableQty = availableEntry.quantity;
          }
        }
        
        if (productsMap.has(productId)) {
          const existing = productsMap.get(productId);
          existing.locationInventory += availableQty;
          existing.variants.push({
            id: node.item?.variant?.id,
            title: variantTitle,
            available: availableQty,
          });
        } else {
          productsMap.set(productId, {
            id: productId,
            title: productTitle,
            handle: node.item?.variant?.product?.handle || "",
            locationInventory: availableQty,
            variants: [
              {
                id: node.item?.variant?.id,
                title: variantTitle,
                available: availableQty,
              },
            ],
          });
        }
      }
      
      const pageInfo = location.inventoryLevels?.pageInfo;
      hasNextPage = pageInfo?.hasNextPage || false;
      cursor = pageInfo?.endCursor || null;
    }
    
    const products = Array.from(productsMap.values());
    const thresholdParam = Number(url.searchParams.get("threshold"));
    const threshold = Number.isFinite(thresholdParam) && thresholdParam > 0 ? thresholdParam : 10;
    const lowStockProducts = products.filter((p) =>
      Array.isArray(p.variants) &&
      p.variants.some((variant: any) => variant.available > 0 && variant.available <= threshold)
    );
    
    return json({
      locationId: selectedLocationId,
      locationName: selectedLocation?.name,
      threshold,
      totalProducts: products.length,
      productsWithInventory: products.filter((p) => p.locationInventory > 0).length,
      lowStockCount: lowStockProducts.length,
      sampleProducts: products.slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        locationInventory: p.locationInventory,
        lowStock:
          Array.isArray(p.variants) &&
          p.variants.some((variant: any) => variant.available > 0 && variant.available <= threshold),
        variants: p.variants.slice(0, 3),
      })),
      lowStockSample: lowStockProducts.slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        locationInventory: p.locationInventory,
        variants: p.variants.filter((v: any) => v.available > 0 && v.available <= threshold),
      })),
      allLocations: parsedLocations,
    });
  } catch (error) {
    return json({
      error: "Failed to fetch inventory",
      message: (error as Error).message,
      stack: (error as Error).stack,
    }, { status: 500 });
  }
};



