import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";
import { authenticate } from "../shopify.server";

// GraphQL Query to check if app embedding is enabled in the current theme
const CHECK_EMBED_STATUS_QUERY = `
  query getAppEmbedStatus {
    shop {
      id
      name
    }
    themes(first: 1, role: MAIN) {
      edges {
        node {
          id
          name
          role
          themeAppExtensions {
            id
            title
            type
            enabled
          }
        }
      }
    }
  }
`;

// Alternative query to check all themes (for debugging)
const CHECK_ALL_THEMES_QUERY = `
  query getAllThemes {
    themes(first: 10) {
      edges {
        node {
          id
          name
          role
          themeAppExtensions {
            id
            title
            type
            enabled
          }
        }
      }
    }
  }
`;

async function checkEmbedStatusFromShopify(shop: string, request: Request): Promise<boolean> {
  try {
    console.log("🔍 Checking embed status from Shopify for shop:", shop);
    
    // Get session for the shop
    const session = await prisma.session.findFirst({
      where: { shop },
      orderBy: { id: 'desc' }
    });
    
    if (!session) {
      console.warn("❌ No session found for shop:", shop);
      return false;
    }
    
    console.log("🔍 Session found:", {
      id: session.id,
      shop: session.shop,
      isOnline: session.isOnline,
      scope: session.scope,
      expires: session.expires
    });
    
    // Use authenticate to get admin client
    const { admin } = await authenticate.admin(request);
    
    console.log("🔍 Admin client created successfully");
    
    // Execute GraphQL query
    const response = await admin.graphql(CHECK_EMBED_STATUS_QUERY);
    const data = await response.json();
    
    console.log("📊 Shopify GraphQL response:", JSON.stringify(data, null, 2));
    
    // Additional debugging for the main theme
    if (themes.length > 0) {
      console.log("🔍 Main theme details:", {
        id: mainTheme?.id,
        name: mainTheme?.name,
        role: mainTheme?.role,
        extensionsCount: themeAppExtensions.length,
        extensions: themeAppExtensions.map((ext: any) => ({
          id: ext.id,
          title: ext.title,
          type: ext.type,
          enabled: ext.enabled
        }))
      });
    } else {
      console.log("❌ No themes found with role MAIN");
    }
    
    // Debug: Check the structure of the response
    const shop = data.data?.shop;
    const themes = data.data?.themes?.edges || [];
    const mainTheme = themes[0]?.node;
    const themeAppExtensions = mainTheme?.themeAppExtensions || [];
    
    console.log("🔍 Debug - shop:", shop);
    console.log("🔍 Debug - themes count:", themes.length);
    console.log("🔍 Debug - mainTheme:", mainTheme);
    console.log("🔍 Debug - themeAppExtensions:", themeAppExtensions);
    console.log("🔍 Debug - themeAppExtensions count:", themeAppExtensions.length);
    
    // Log each extension for debugging
    themeAppExtensions.forEach((extension: any, index: number) => {
      console.log(`🔍 Extension ${index}:`, {
        id: extension.id,
        title: extension.title,
        type: extension.type,
        enabled: extension.enabled
      });
    });
    
    // Check if any theme app extension is enabled
    // Theme App Extensions have type "THEME_APP_EXTENSION" not "APP_EMBED"
    const isEnabled = themeAppExtensions.some((extension: any) => {
      const matches = (extension.type === "THEME_APP_EXTENSION" || extension.type === "APP_EMBED") && extension.enabled === true;
      console.log(`🔍 Extension "${extension.title}" (${extension.type}): enabled=${extension.enabled}, matches=${matches}`);
      return matches;
    });
    
    console.log("✅ Embed status from Shopify:", isEnabled);
    console.log("✅ Main theme ID:", mainTheme?.id);
    console.log("✅ Main theme name:", mainTheme?.name);
    console.log("✅ Main theme role:", mainTheme?.role);
    
    // If no extensions found in main theme, try all themes for debugging
    if (themeAppExtensions.length === 0) {
      console.log("🔍 No extensions found in main theme, checking all themes...");
      try {
        const allThemesResponse = await admin.graphql(CHECK_ALL_THEMES_QUERY);
        const allThemesData = await allThemesResponse.json();
        
        console.log("📊 All themes response:", JSON.stringify(allThemesData, null, 2));
        
        const themes = allThemesData.data?.themes?.edges || [];
        console.log("🔍 Found themes:", themes.length);
        
        themes.forEach((themeEdge: any, index: number) => {
          const theme = themeEdge.node;
          console.log(`🔍 Theme ${index}:`, {
            id: theme.id,
            name: theme.name,
            role: theme.role,
            extensionsCount: theme.themeAppExtensions?.length || 0
          });
          
          if (theme.themeAppExtensions) {
            theme.themeAppExtensions.forEach((extension: any, extIndex: number) => {
              console.log(`  🔍 Extension ${extIndex}:`, {
                id: extension.id,
                title: extension.title,
                type: extension.type,
                enabled: extension.enabled
              });
            });
          }
        });
      } catch (allThemesError) {
        console.error("❌ Error checking all themes:", allThemesError);
      }
    }
    
    return isEnabled;
    
  } catch (error) {
    console.error("❌ Error checking embed status from Shopify:", error);
    return false;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shop = normalizeShop(url.searchParams.get("shop") || "");
    
    if (!shop) {
      console.warn("❌ No shop parameter provided");
      return json(
        { embedActive: false, themeId: null, lastActivated: null, reason: "missing_shop" },
        { status: 200, headers: { "Cache-Control": "no-store" } } // 200 statt 400 für bessere UX
      );
    }
    
    console.log("🔍 Checking quickstart status for shop:", shop);
    
    // Check embed status from Shopify (real-time)
    const embedActiveFromShopify = await checkEmbedStatusFromShopify(shop, request);
    console.log("✅ Embed active status from Shopify:", embedActiveFromShopify);
    
    // Database check for reference only (not used for live status)
    const row = await prisma.quickstartProgress.findUnique({ where: { shop } });
    console.log("📊 Database row found (reference only):", row);
    
    // Use ONLY Shopify status - no database fallback for live display
    const embedActive = embedActiveFromShopify;
    console.log("✅ Final embed active status (Shopify only):", embedActive);
    console.log("⚠️  Database fallback removed - using only real-time Shopify status");

    // Immer gültige JSON-Daten zurückgeben
    return json(
      {
        embedActive,
        themeId: null, // Not stored in new model
        lastActivated: row?.updatedAt ?? null,
        source: embedActiveFromShopify ? "shopify" : "database"
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("❌ quickstart-status error", e);
    // Immer gültige JSON-Daten zurückgeben, auch bei Fehlern
    return json(
      { embedActive: false, themeId: null, lastActivated: null, reason: "server_error" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
