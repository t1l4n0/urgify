import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { validateSessionToken } from "../utils/sessionToken";
import { shouldRateLimit, checkShopifyRateLimit } from "../utils/rateLimiting";

// CORS headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Vary": "Origin",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Max-Age": "600",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { ...CORS_HEADERS } });
  }

  try {
    // Validate session token first
    const sessionToken = validateSessionToken(request);
    if (!sessionToken) {
      return json(
        { error: "Session token required" },
        { status: 401, headers: { ...CORS_HEADERS } }
      );
    }

    // Authenticate the request using Shopify's session token
    const { admin, session } = await authenticate.admin(request);
    
    // Check rate limiting
    const rateLimitCheck = await shouldRateLimit(request, 'admin');
    if (rateLimitCheck.limited) {
      return json(
        { error: rateLimitCheck.error },
        { 
          status: 429, 
          headers: { 
            ...CORS_HEADERS,
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '60' 
          } 
        }
      );
    }

    // Check Shopify GraphQL rate limits
    const shopifyRateLimit = await checkShopifyRateLimit('graphql', session.shop);
    if (!shopifyRateLimit.success) {
      return json(
        { error: shopifyRateLimit.error },
        { 
          status: 429, 
          headers: { 
            ...CORS_HEADERS,
            'Retry-After': shopifyRateLimit.retryAfter?.toString() || '60' 
          } 
        }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return json({ error: "No file provided" }, { status: 400, headers: { ...CORS_HEADERS } });
    }

    // Validate file type (only images)
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validImageTypes.includes(file.type)) {
      return json(
        { error: "Invalid file type. Only images are allowed." },
        { status: 400, headers: { ...CORS_HEADERS } }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return json(
        { error: "File size exceeds maximum limit of 10MB" },
        { status: 400, headers: { ...CORS_HEADERS } }
      );
    }

    // Step 1: Create staged upload target
    const stagedUploadResponse = await admin.graphql(`
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: [
          {
            filename: file.name,
            mimeType: file.type,
            httpMethod: "POST",
            resource: "FILE",
          },
        ],
      },
    });

    const stagedUploadData = await stagedUploadResponse.json();
    
    if (stagedUploadData.errors) {
      console.error("GraphQL errors:", stagedUploadData.errors);
      return json(
        { error: "Failed to create upload target: " + JSON.stringify(stagedUploadData.errors) },
        { status: 500, headers: { ...CORS_HEADERS } }
      );
    }

    const userErrors = stagedUploadData.data?.stagedUploadsCreate?.userErrors || [];
    if (userErrors.length > 0) {
      return json(
        { error: "Upload target creation failed: " + userErrors[0]?.message },
        { status: 400, headers: { ...CORS_HEADERS } }
      );
    }

    const stagedTarget = stagedUploadData.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!stagedTarget) {
      return json(
        { error: "No staged target returned" },
        { status: 500, headers: { ...CORS_HEADERS } }
      );
    }

    // Step 2: Upload file to staged URL
    const uploadFormData = new FormData();
    stagedTarget.parameters.forEach((param: { name: string; value: string }) => {
      uploadFormData.append(param.name, param.value);
    });
    uploadFormData.append("file", file);

    const uploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      return json(
        { error: `Upload failed: ${uploadResponse.statusText}` },
        { status: 500, headers: { ...CORS_HEADERS } }
      );
    }

    // Step 3: Create file in Shopify
    const fileCreateResponse = await admin.graphql(`
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            ... on MediaImage {
              image {
                url
                width
                height
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        files: [
          {
            contentType: "IMAGE",
            originalSource: stagedTarget.resourceUrl,
            alt: file.name,
          },
        ],
      },
    });

    const fileCreateData = await fileCreateResponse.json();
    
    if (fileCreateData.errors) {
      console.error("GraphQL errors:", fileCreateData.errors);
      return json(
        { error: "Failed to create file: " + JSON.stringify(fileCreateData.errors) },
        { status: 500, headers: { ...CORS_HEADERS } }
      );
    }

    const createUserErrors = fileCreateData.data?.fileCreate?.userErrors || [];
    if (createUserErrors.length > 0) {
      return json(
        { error: "File creation failed: " + createUserErrors[0]?.message },
        { status: 400, headers: { ...CORS_HEADERS } }
      );
    }

    const createdFile = fileCreateData.data?.fileCreate?.files?.[0];
    if (!createdFile) {
      return json(
        { error: "File was not created" },
        { status: 500, headers: { ...CORS_HEADERS } }
      );
    }

    // Get the image URL - check if it's a MediaImage
    let imageUrl = '';
    if ('image' in createdFile && createdFile.image?.url) {
      imageUrl = createdFile.image.url;
    } else {
      // Fallback: if fileStatus is READY, we might need to query the file again
      // For now, return the resourceUrl as fallback
      imageUrl = stagedTarget.resourceUrl;
    }

    return json({ 
      success: true, 
      imageUrl,
      fileId: createdFile.id 
    }, { headers: { ...CORS_HEADERS } });

  } catch (error) {
    console.error("Error uploading image:", error);
    
    // Handle authentication errors
    if (error instanceof Response && error.status === 401) {
      const headers = new Headers(error.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
      return new Response(error.body, { status: 401, headers });
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('Session token') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('Invalid session')
    ) {
      return json(
        { error: "Authentication failed" },
        { status: 401, headers: { ...CORS_HEADERS } }
      );
    }
    
    return json({
      error: "Failed to upload image: " + errorMessage
    }, { status: 500, headers: { ...CORS_HEADERS } });
  }
};
