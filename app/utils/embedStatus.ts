import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

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
          appEmbeds {
            id
            title
            enabled
          }
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

/**
 * Checks if the app embedding is enabled in the current theme using Shopify's GraphQL API
 * @param shop - The shop domain
 * @param admin - Shopify Admin API context
 * @returns Promise<boolean> - true if app embedding is enabled, false otherwise
 */
export async function checkEmbedStatusFromShopify(
  shop: string,
  admin: AdminApiContext
): Promise<boolean> {
  try {
    console.log("🔍 Checking embed status from Shopify for shop:", shop);
    
    // Execute GraphQL query
    const response = await admin.graphql(CHECK_EMBED_STATUS_QUERY);
    const data = await response.json();
    
    console.log("📊 Shopify GraphQL response:", JSON.stringify(data, null, 2));
    
    // Debug: Check the structure of the response
    const shopData = data.data?.shop;
    const themes = data.data?.themes?.edges || [];
    const mainTheme = themes[0]?.node;
    const appEmbeds = mainTheme?.appEmbeds || [];
    const themeAppExtensions = mainTheme?.themeAppExtensions || [];
    
    // Additional debugging for the main theme
    if (process.env.NODE_ENV === 'development') {
      if (themes.length > 0) {
        console.log("🔍 Main theme details:", {
          id: mainTheme?.id,
          name: mainTheme?.name,
          role: mainTheme?.role,
          appEmbedsCount: appEmbeds.length,
          appEmbeds: appEmbeds.map((embed: any) => ({
            id: embed.id,
            title: embed.title,
            enabled: embed.enabled
          })),
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
    }
    
    // Log each app embed for debugging
    if (process.env.NODE_ENV === 'development') {
      appEmbeds.forEach((embed: any, index: number) => {
        console.log(`🔍 App Embed ${index}:`, {
          id: embed.id,
          title: embed.title,
          enabled: embed.enabled
        });
      });
    }
    
    // Log each extension for debugging
    if (process.env.NODE_ENV === 'development') {
      themeAppExtensions.forEach((extension: any, index: number) => {
        console.log(`🔍 Extension ${index}:`, {
          id: extension.id,
          title: extension.title,
          type: extension.type,
          enabled: extension.enabled
        });
      });
    }
    
    // Check if any app embed is enabled
    const appEmbedEnabled = appEmbeds.some((embed: any) => {
      const matches = embed.enabled === true;
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 App Embed "${embed.title}": enabled=${embed.enabled}, matches=${matches}`);
      }
      return matches;
    });
    
    // Check if any theme app extension is enabled
    const extensionEnabled = themeAppExtensions.some((extension: any) => {
      const matches = (extension.type === "THEME_APP_EXTENSION" || extension.type === "APP_EMBED") && extension.enabled === true;
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Extension "${extension.title}" (${extension.type}): enabled=${extension.enabled}, matches=${matches}`);
      }
      return matches;
    });
    
    // App is considered enabled if either app embeds or extensions are enabled
    const isEnabled = appEmbedEnabled || extensionEnabled;
    
    if (process.env.NODE_ENV === 'development') {
      console.log("✅ Embed status from Shopify:", isEnabled);
      console.log("✅ App Embed enabled:", appEmbedEnabled);
      console.log("✅ Extension enabled:", extensionEnabled);
      console.log("✅ Main theme ID:", mainTheme?.id);
      console.log("✅ Main theme name:", mainTheme?.name);
      console.log("✅ Main theme role:", mainTheme?.role);
    }
    
    return isEnabled;
    
  } catch (error) {
    console.error("❌ Error checking embed status from Shopify:", error);
    return false;
  }
}
