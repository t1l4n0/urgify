// AdminApi type - matches the admin object returned from authenticate.admin()
// Using any to match the pattern in billing.ts until we can determine the exact type
type AdminApi = any;

type DefinitionConfig = {
  key: string;
  name: string;
  type: string;
  description: string;
};

const SHOP_DEFINITIONS: DefinitionConfig[] = [
  {
    key: "subscription_active",
    name: "Urgify subscription active",
    type: "boolean",
    description: "Indicates whether the Urgify subscription (or trial) is active for storefront gating.",
  },
  {
    key: "popup_config",
    name: "Urgify popup configuration",
    type: "json",
    description: "Serialized popup configuration generated from the Urgify admin.",
  },
  {
    key: "cart_upsell_enabled",
    name: "Urgify cart upsell enabled",
    type: "boolean",
    description: "Indicates whether the cart upsell feature is enabled for the storefront.",
  },
];

const PRODUCT_DEFINITIONS: DefinitionConfig[] = [
  {
    key: "cart_upsells",
    name: "Urgify cart upsell products",
    type: "list.product_reference",
    description: "List of recommended upsell products to display in the cart drawer for this product.",
  },
  {
    key: "product_badge",
    name: "Urgify product badge",
    type: "json",
    description: "Custom badge configuration for product cards (text, colors, position).",
  },
];

const URGIFY_NAMESPACE = "urgify";

const DEFINITION_QUERY = `#graphql
  query getUrgifyShopDefinitions($namespace: String!) {
    metafieldDefinitions(first: 50, namespace: $namespace, ownerType: SHOP) {
      nodes {
        id
        key
        access {
          admin
          storefront
        }
      }
    }
  }
`;

const PRODUCT_DEFINITION_QUERY = `#graphql
  query getUrgifyProductDefinitions($namespace: String!) {
    metafieldDefinitions(first: 50, namespace: $namespace, ownerType: PRODUCT) {
      nodes {
        id
        key
        pinnedPosition
        access {
          admin
          storefront
        }
      }
    }
  }
`;

const CREATE_DEFINITION_MUTATION = `#graphql
  mutation createUrgifyDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const UPDATE_DEFINITION_MUTATION = `#graphql
  mutation updateUrgifyDefinition($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition {
        id
        key
        access {
          admin
          storefront
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const PIN_DEFINITION_MUTATION = `#graphql
  mutation pinUrgifyDefinition($identifier: MetafieldDefinitionIdentifierInput!) {
    metafieldDefinitionPin(identifier: $identifier) {
      pinnedDefinition {
        id
        key
        pinnedPosition
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export async function ensureShopMetafieldDefinitions(admin: AdminApi) {
  try {
    const response = await admin.graphql(DEFINITION_QUERY, {
      variables: { namespace: URGIFY_NAMESPACE },
    });
    const data = await response.json();

    const existing: Record<
      string,
      { id: string; access?: { storefront?: string | null; admin?: string | null } }
    > = {};

    const nodes = data?.data?.metafieldDefinitions?.nodes ?? [];
    nodes.forEach((node: any) => {
      if (node?.key) {
        existing[node.key] = {
          id: node.id,
          access: node.access,
        };
      }
    });

    for (const definition of SHOP_DEFINITIONS) {
      const match = existing[definition.key];
      if (!match) {
        await createShopDefinition(admin, definition);
        continue;
      }

      const hasStorefrontAccess =
        match.access?.storefront && match.access.storefront !== "NONE";

      if (!hasStorefrontAccess) {
        await updateShopDefinitionAccess(admin, definition);
      }
    }
  } catch (error) {
    console.error("Failed to ensure Urgify metafield definitions:", error);
  }
}

async function createShopDefinition(admin: AdminApi, definition: DefinitionConfig) {
  try {
    const result = await admin.graphql(CREATE_DEFINITION_MUTATION, {
      variables: {
        definition: {
          name: definition.name,
          namespace: URGIFY_NAMESPACE,
          key: definition.key,
          description: definition.description,
          type: definition.type,
          ownerType: "SHOP",
          access: {
            admin: "MERCHANT_READ_WRITE",
            storefront: "PUBLIC_READ",
          },
        },
      },
    });

    const data = await result.json();
    const userErrors = data?.data?.metafieldDefinitionCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error("Failed to create Urgify metafield definition:", userErrors);
    }
  } catch (error) {
    console.error("Error creating Urgify metafield definition:", error);
  }
}

async function updateShopDefinitionAccess(admin: AdminApi, definition: DefinitionConfig) {
  try {
    const result = await admin.graphql(UPDATE_DEFINITION_MUTATION, {
      variables: {
        definition: {
          namespace: URGIFY_NAMESPACE,
          key: definition.key,
          ownerType: "SHOP",
          access: {
            admin: "MERCHANT_READ_WRITE",
            storefront: "PUBLIC_READ",
          },
        },
      },
    });

    const data = await result.json();
    const userErrors = data?.data?.metafieldDefinitionUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error("Failed to update Urgify metafield definition access:", userErrors);
    }
  } catch (error) {
    console.error("Error updating Urgify metafield definition:", error);
  }
}

export async function ensureProductMetafieldDefinitions(admin: AdminApi) {
  try {
    const response = await admin.graphql(PRODUCT_DEFINITION_QUERY, {
      variables: { namespace: URGIFY_NAMESPACE },
    });
    const data = await response.json();

    const existing: Record<
      string,
      { id: string; pinnedPosition?: number | null; access?: { storefront?: string | null; admin?: string | null } }
    > = {};

    const nodes = data?.data?.metafieldDefinitions?.nodes ?? [];
    nodes.forEach((node: any) => {
      if (node?.key) {
        existing[node.key] = {
          id: node.id,
          pinnedPosition: node.pinnedPosition,
          access: node.access,
        };
      }
    });

    for (const definition of PRODUCT_DEFINITIONS) {
      const match = existing[definition.key];
      if (!match) {
        try {
          await createProductDefinition(admin, definition);
          // Pin the definition after creation
          await pinProductDefinition(admin, definition);
        } catch (createError) {
          console.error(`Failed to create/pin definition ${definition.key}:`, createError);
          throw createError; // Re-throw to let caller handle it
        }
        continue;
      }

      const hasStorefrontAccess =
        match.access?.storefront && match.access.storefront !== "NONE";

      if (!hasStorefrontAccess) {
        await updateProductDefinitionAccess(admin, definition);
      }

      // Pin the definition if it's not already pinned
      if (match.pinnedPosition === null || match.pinnedPosition === undefined) {
        try {
          await pinProductDefinition(admin, definition);
        } catch (pinError) {
          console.error(`Failed to pin definition ${definition.key}:`, pinError);
          // Don't throw here - definition exists, just not pinned
        }
      }
    }
  } catch (error) {
    console.error("Failed to ensure Urgify product metafield definitions:", error);
    throw error; // Re-throw to let caller handle it
  }
}

async function createProductDefinition(admin: AdminApi, definition: DefinitionConfig) {
  try {
    const result = await admin.graphql(CREATE_DEFINITION_MUTATION, {
      variables: {
        definition: {
          name: definition.name,
          namespace: URGIFY_NAMESPACE,
          key: definition.key,
          description: definition.description,
          type: definition.type,
          ownerType: "PRODUCT",
          // Don't set access - Shopify will set it automatically
        },
      },
    });

    const data = await result.json();
    
    // Check for GraphQL errors
    if (data.errors) {
      console.error("GraphQL errors when creating metafield definition:", data.errors);
      throw new Error(`GraphQL errors: ${data.errors.map((e: any) => e.message).join(", ")}`);
    }
    
    const userErrors = data?.data?.metafieldDefinitionCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      const errorMessages = userErrors.map((e: any) => `${e.field}: ${e.message} (${e.code})`).join(", ");
      console.error("Failed to create Urgify product metafield definition:", userErrors);
      throw new Error(`User errors: ${errorMessages}`);
    }
    
    return true;
  } catch (error) {
    console.error("Error creating Urgify product metafield definition:", error);
    throw error; // Re-throw to let caller handle it
  }
}

async function pinProductDefinition(admin: AdminApi, definition: DefinitionConfig) {
  try {
    const result = await admin.graphql(PIN_DEFINITION_MUTATION, {
      variables: {
        identifier: {
          namespace: URGIFY_NAMESPACE,
          key: definition.key,
          ownerType: "PRODUCT",
        },
      },
    });

    const data = await result.json();
    const userErrors = data?.data?.metafieldDefinitionPin?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error("Failed to pin Urgify product metafield definition:", userErrors);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error pinning Urgify product metafield definition:", error);
    return false;
  }
}

async function updateProductDefinitionAccess(admin: AdminApi, definition: DefinitionConfig) {
  try {
    const result = await admin.graphql(UPDATE_DEFINITION_MUTATION, {
      variables: {
        definition: {
          namespace: URGIFY_NAMESPACE,
          key: definition.key,
          ownerType: "PRODUCT",
          access: {
            admin: "MERCHANT_READ_WRITE",
            storefront: "PUBLIC_READ",
          },
        },
      },
    });

    const data = await result.json();
    const userErrors = data?.data?.metafieldDefinitionUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error("Failed to update Urgify product metafield definition access:", userErrors);
    }
  } catch (error) {
    console.error("Error updating Urgify product metafield definition access:", error);
  }
}

