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
];

const PRODUCT_DEFINITIONS: DefinitionConfig[] = [
  {
    key: "cart_upsells",
    name: "Urgify cart upsell products",
    type: "list.product_reference",
    description: "List of recommended upsell products to display in the cart drawer for this product.",
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

    for (const definition of PRODUCT_DEFINITIONS) {
      const match = existing[definition.key];
      if (!match) {
        await createProductDefinition(admin, definition);
        continue;
      }

      const hasStorefrontAccess =
        match.access?.storefront && match.access.storefront !== "NONE";

      if (!hasStorefrontAccess) {
        await updateProductDefinitionAccess(admin, definition);
      }
    }
  } catch (error) {
    console.error("Failed to ensure Urgify product metafield definitions:", error);
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
      console.error("Failed to create Urgify product metafield definition:", userErrors);
    }
  } catch (error) {
    console.error("Error creating Urgify product metafield definition:", error);
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

