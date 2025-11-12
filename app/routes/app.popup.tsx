import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type SerializeFrom,
} from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager, hasAccessToPopups } from "../utils/billing";
import { z } from "zod";
import { shouldRateLimit, checkShopifyRateLimit } from "../utils/rateLimiting";
import { validateSessionToken } from "../utils/sessionToken";
import { ViewPlansLink } from "../components/ViewPlansLink";
// Polaris Web Components - no imports needed, components are global
import { useState, useCallback, useEffect, useRef, useMemo, Fragment } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import popupPreviewStyles from "../styles/popup-preview.css?url";
import { authenticatedFetch } from "../utils/authenticatedFetch";

// CORS headers (lenient: allow any origin; request is same-origin in iframe)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Vary": "Origin",
};

export const links = () => [
  { rel: "stylesheet", href: popupPreviewStyles }
];

// Validation schema for popup settings
const popupSettingsSchema = z.object({
  enabled: z.string().default('false'),
  title: z.string().default(''),
  description: z.string().default(''),
  ctaText: z.string().default(''),
  ctaUrl: z.string().default(''),
  imageUrl: z.string().default(''),
  imageFit: z.string().default('cover'),
  imageAlt: z.string().default(''),
  imagePosition: z.string().default('top'),
  style: z.string().default('spectacular'),
  titleFontSize: z.string().default('24px'),
  descriptionFontSize: z.string().default('16px'),
  ctaFontSize: z.string().default('16px'),
  backgroundColor: z.string().default('#ffffff'),
  textColor: z.string().default('#000000'),
  ctaBackgroundColor: z.string().default('#007bff'),
  ctaTextColor: z.string().default('#ffffff'),
  overlayColor: z.string().default('rgba(0, 0, 0, 0.5)'),
  placement: z.string().default('all'),
  position: z.string().default('middle-center'),
  triggerType: z.string().default('delay'),
  delaySeconds: z.string().refine((val) => {
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= 0;
  }, { message: "Delay must be 0 or greater" }).default('3'),
  cookieDays: z.string().refine((val) => {
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= 1;
  }, { message: "Cookie duration must be 1 or greater" }).default('7'),
  ignoreCookie: z.string().default('false'),
  enableNewsletter: z.string().default('false'),
  discountCodeId: z.string().default(''),
  discountCode: z.string().default(''),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Sync subscription status to metafield first
  try {
    const shopResponse = await admin.graphql(`
      query getShop {
        shop {
          id
        }
      }
    `);
    
    const shopData = await shopResponse.json();
    const shopId = shopData.data?.shop?.id;
    
    if (shopId) {
      const { syncSubscriptionStatusToMetafield } = await import("../utils/billing");
      await syncSubscriptionStatusToMetafield(admin, shopId);
    }
  } catch (syncError) {
    console.error("Failed to sync subscription status:", syncError);
  }

  // Check subscription status and feature access
  let hasActiveSubscription = false;
  let isTrialActive = false;
  let planHandle: string | null = null;
  let hasAccess = false;
  
  try {
    const billingManager = new BillingManager(session.shop, admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    hasActiveSubscription = subscriptionStatus.hasActiveSubscription;
    isTrialActive = subscriptionStatus.isTrialActive;
    planHandle = subscriptionStatus.planHandle;
    hasAccess = hasAccessToPopups(planHandle);
  } catch (error) {
    console.error("Error checking subscription status:", error);
  }
  
  // If user doesn't have access, return early with error message
  if (!hasAccess) {
    return json({
      error: "PopUps feature requires a Plus plan. Please upgrade your subscription to access this feature.",
      hasAccess: false,
      planHandle,
    }, { 
      headers: { 
        "Cache-Control": "no-store" 
      } 
    });
  }

  try {
    // Fetch discount codes for selection
    let discountCodes: Array<{ id: string; code: string; title: string }> = [];
    try {
      const discountResponse = await admin.graphql(`
        query getDiscountCodes {
          codeDiscountNodes(first: 50, query: "status:active") {
            nodes {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  codes(first: 1) {
                    nodes {
                      code
                    }
                  }
                }
                ... on DiscountCodeBxgy {
                  title
                  codes(first: 1) {
                    nodes {
                      code
                    }
                  }
                }
                ... on DiscountCodeFreeShipping {
                  title
                  codes(first: 1) {
                    nodes {
                      code
                    }
                  }
                }
                ... on DiscountCodeApp {
                  title
                  codes(first: 1) {
                    nodes {
                      code
                    }
                  }
                }
              }
            }
          }
        }
      `);
      
      const discountData = await discountResponse.json();
      
      // Log response for debugging
      if ((discountData as any).errors) {
        console.error("GraphQL errors fetching discount codes:", (discountData as any).errors);
      }
      
      const nodes = discountData.data?.codeDiscountNodes?.nodes || [];
      
      console.log(`Found ${nodes.length} discount code nodes`);
      
      discountCodes = nodes.map((node: any) => {
        const discount = node.codeDiscount;
        if (!discount) {
          console.warn("Node without codeDiscount:", node);
          return null;
        }
        
        const firstCode = discount?.codes?.nodes?.[0]?.code || '';
        if (!firstCode) {
          console.warn("Discount without code:", discount);
        }
        
        return {
          id: node.id,
          code: firstCode,
          title: discount?.title || firstCode || 'Untitled Discount',
        };
      }).filter((dc: any) => dc && dc.code); // Only include discounts with codes
      
      console.log(`Mapped to ${discountCodes.length} valid discount codes`);
    } catch (discountError) {
      console.error("Error fetching discount codes:", discountError);
      // Include the full error details
      if (discountError instanceof Error) {
        console.error("Error message:", discountError.message);
        console.error("Error stack:", discountError.stack);
      }
    }

    // Fetch shop metafield for popup settings
    const metafieldResponse = await admin.graphql(`
      query getShopMetafield {
        shop {
          metafield(namespace: "urgify", key: "popup_config") {
            value
            type
          }
        }
      }
    `);

    const metafieldData = await metafieldResponse.json();
    const configValue = metafieldData.data?.shop?.metafield?.value;
    
    // Parse JSON metafield or use defaults (convert snake_case to camelCase for React)
    let rawSettings: any = {
      enabled: false,
      title: 'Special Offer - Limited Time Only!',
      description: 'Don\'t miss out on our exclusive deal. Get 20% off your first order when you sign up today.',
      cta_text: 'Get Started',
      cta_url: '/',
      image_url: '',
      image_fit: 'cover',
      image_alt: '',
      style: 'spectacular',
      title_font_size: '24px',
      description_font_size: '16px',
      cta_font_size: '16px',
      background_color: '#ffffff',
      text_color: '#000000',
      cta_background_color: '#007bff',
      cta_text_color: '#ffffff',
      overlay_color: 'rgba(0, 0, 0, 0.5)',
      placement: 'all',
      position: 'middle-center',
      trigger_type: 'delay',
      delay_seconds: 3,
      cookie_days: 7,
      ignore_cookie: false,
      enable_newsletter: false,
      discount_code_id: '',
      discount_code: '',
    };

    if (configValue) {
      try {
        const parsedConfig = JSON.parse(configValue);
        rawSettings = { ...rawSettings, ...parsedConfig };
      } catch (error) {
        console.error("Error parsing popup config:", error);
      }
    }

    // Convert to camelCase for React components
    const ctaUrl = rawSettings.cta_url || rawSettings.ctaUrl || '/';
    
    // Fetch resource information if URL points to a product or collection
    let selectedResource: { id: string; title: string; handle: string } | null = null;
    if (ctaUrl.startsWith('/products/')) {
      const handle = ctaUrl.replace('/products/', '').split('?')[0].split('#')[0];
      try {
        const productResponse = await admin.graphql(`
          query getProduct($handle: String!) {
            product(handle: $handle) {
              id
              title
              handle
            }
          }
        `, { variables: { handle } });
        
        const productData = await productResponse.json();
        const product = productData.data?.product;
        if (product) {
          selectedResource = {
            id: product.id,
            title: product.title,
            handle: product.handle,
          };
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      }
    } else if (ctaUrl.startsWith('/collections/')) {
      const handle = ctaUrl.replace('/collections/', '').split('?')[0].split('#')[0];
      try {
        const collectionResponse = await admin.graphql(`
          query getCollection($handle: String!) {
            collection(handle: $handle) {
              id
              title
              handle
            }
          }
        `, { variables: { handle } });
        
        const collectionData = await collectionResponse.json();
        const collection = collectionData.data?.collection;
        if (collection) {
          selectedResource = {
            id: collection.id,
            title: collection.title,
            handle: collection.handle,
          };
        }
      } catch (error) {
        console.error('Error fetching collection:', error);
      }
    }
    
    const settings = {
      enabled: rawSettings.enabled,
      title: rawSettings.title,
      description: rawSettings.description,
      ctaText: rawSettings.cta_text || rawSettings.ctaText || 'Get Started',
      ctaUrl,
      imageUrl: rawSettings.image_url || rawSettings.imageUrl || '',
      imageFit: rawSettings.image_fit || rawSettings.imageFit || 'cover',
      imageAlt: rawSettings.image_alt || rawSettings.imageAlt || '',
      imagePosition: rawSettings.image_position || rawSettings.imagePosition || 'top',
      style: rawSettings.style,
      titleFontSize: rawSettings.title_font_size || rawSettings.titleFontSize || '24px',
      descriptionFontSize: rawSettings.description_font_size || rawSettings.descriptionFontSize || '16px',
      ctaFontSize: rawSettings.cta_font_size || rawSettings.ctaFontSize || '16px',
      backgroundColor: rawSettings.background_color || rawSettings.backgroundColor || '#ffffff',
      textColor: rawSettings.text_color || rawSettings.textColor || '#000000',
      ctaBackgroundColor: rawSettings.cta_background_color || rawSettings.ctaBackgroundColor || '#007bff',
      ctaTextColor: rawSettings.cta_text_color || rawSettings.ctaTextColor || '#ffffff',
      overlayColor: rawSettings.overlay_color || rawSettings.overlayColor || 'rgba(0, 0, 0, 0.5)',
      placement: rawSettings.placement,
      position: rawSettings.position,
      triggerType: rawSettings.trigger_type || rawSettings.triggerType || 'delay',
      delaySeconds: rawSettings.delay_seconds || rawSettings.delaySeconds || 3,
      cookieDays: rawSettings.cookie_days || rawSettings.cookieDays || 7,
      ignoreCookie: rawSettings.ignore_cookie === true || 
                    rawSettings.ignoreCookie === true || 
                    rawSettings.ignore_cookie === 'true' || 
                    rawSettings.ignoreCookie === 'true' || 
                    false,
      enableNewsletter: rawSettings.enable_newsletter === true || 
                        rawSettings.enable_newsletter === 'true' || 
                        rawSettings.enableNewsletter === true || 
                        rawSettings.enableNewsletter === 'true' || 
                        false,
      discountCodeId: rawSettings.discount_code_id || rawSettings.discountCodeId || '',
      discountCode: rawSettings.discount_code || rawSettings.discountCode || '',
    };

    return json({
      settings,
      selectedResource,
      discountCodes,
      hasActiveSubscription,
      isTrialActive,
      hasAccess: true,
    }, { 
      headers: { 
        "Cache-Control": "no-store" 
      } 
    });
  } catch (error) {
    console.error("Error fetching popup settings:", error);
      // Return defaults in camelCase format
      return json({ 
        settings: {
          enabled: false,
          title: 'Special Offer - Limited Time Only!',
          description: 'Don\'t miss out on our exclusive deal. Get 20% off your first order when you sign up today.',
          ctaText: 'Get Started',
          ctaUrl: 'https://',
          imageUrl: '',
          imageFit: 'cover',
          imageAlt: '',
          imagePosition: 'top',
          style: 'spectacular',
          titleFontSize: '24px',
          descriptionFontSize: '16px',
          ctaFontSize: '16px',
          backgroundColor: '#ffffff',
          textColor: '#000000',
          ctaBackgroundColor: '#007bff',
          ctaTextColor: '#ffffff',
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          placement: 'all',
          position: 'middle-center',
          triggerType: 'delay',
          delaySeconds: 3,
          cookieDays: 7,
          ignoreCookie: Boolean(false),
          enableNewsletter: Boolean(false),
          discountCodeId: '',
          discountCode: '',
        },
        selectedResource: null,
        discountCodes: [],
        hasActiveSubscription,
        isTrialActive,
        hasAccess: false,
    }, { 
      headers: { 
        "Cache-Control": "no-store" 
      } 
    });
  }
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
    // Debug: log whether Authorization header is present (no token value)
    try {
      const hasAuth = !!request.headers.get('Authorization');
      console.log("/app/popup: has Authorization header:", hasAuth);
    } catch {}
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
    const getStr = (key: string, fallback = "") => {
      const v = formData.get(key);
      if (v === null || v === undefined) return fallback;
      return String(v);
    };

    // Extract form data
    const formValues = {
      enabled: getStr("enabled", "false"),
      title: getStr("title", ""),
      description: getStr("description", ""),
      ctaText: getStr("ctaText", "Get Started"),
      ctaUrl: getStr("ctaUrl", "/"),
      imageUrl: getStr("imageUrl", ""),
      imageFit: getStr("imageFit", "cover"),
      imageAlt: getStr("imageAlt", ""),
      imagePosition: getStr("imagePosition", "top"),
      style: getStr("style", "spectacular"),
      titleFontSize: getStr("titleFontSize", "24px"),
      descriptionFontSize: getStr("descriptionFontSize", "16px"),
      ctaFontSize: getStr("ctaFontSize", "16px"),
      backgroundColor: getStr("backgroundColor", "#ffffff"),
      textColor: getStr("textColor", "#000000"),
      ctaBackgroundColor: getStr("ctaBackgroundColor", "#007bff"),
      ctaTextColor: getStr("ctaTextColor", "#ffffff"),
      overlayColor: getStr("overlayColor", "rgba(0, 0, 0, 0.5)"),
      placement: getStr("placement", "all"),
      position: getStr("position", "middle-center"),
      triggerType: getStr("triggerType", "delay"),
      delaySeconds: getStr("delaySeconds", "3"),
      cookieDays: getStr("cookieDays", "7"),
      ignoreCookie: getStr("ignoreCookie", "false"),
      enableNewsletter: getStr("enableNewsletter", "false"),
      discountCodeId: getStr("discountCodeId", ""),
      discountCode: getStr("discountCode", ""),
    };

    // Validate input
    const validatedData = popupSettingsSchema.parse(formValues);
    
    const {
      enabled,
      title,
      description,
      ctaText,
      ctaUrl,
      imageUrl,
      imageFit,
      imageAlt,
      imagePosition,
      style,
      titleFontSize,
      descriptionFontSize,
      ctaFontSize,
      backgroundColor,
      textColor,
      ctaBackgroundColor,
      ctaTextColor,
      overlayColor,
      placement,
      position,
      triggerType,
      delaySeconds,
      cookieDays,
      ignoreCookie,
      enableNewsletter,
      discountCodeId,
      discountCode,
    } = validatedData;

    // Get the shop ID
    const shopResponse = await admin.graphql(`
      query getShop {
        shop {
          id
        }
      }
    `);

    const shopData = await shopResponse.json();
    const shopId = shopData.data?.shop?.id;

    if (!shopId) {
      throw new Error("Could not retrieve shop ID");
    }

    // Save all settings as a single JSON metafield (using snake_case for Liquid compatibility)
    const settings = {
      enabled: enabled === "true",
      title,
      description,
      cta_text: ctaText,
      cta_url: ctaUrl,
      image_url: imageUrl,
      image_fit: imageFit,
      image_alt: imageAlt,
      image_position: imagePosition,
      style,
      title_font_size: titleFontSize,
      description_font_size: descriptionFontSize,
      cta_font_size: ctaFontSize,
      background_color: backgroundColor,
      text_color: textColor,
      cta_background_color: ctaBackgroundColor,
      cta_text_color: ctaTextColor,
      overlay_color: overlayColor,
      placement,
      position,
      trigger_type: triggerType,
      delay_seconds: Math.max(0, parseInt(delaySeconds) || 3),
      cookie_days: Math.max(1, parseInt(cookieDays) || 7),
      ignore_cookie: ignoreCookie === "true",
      enable_newsletter: enableNewsletter === "true",
      discount_code_id: discountCodeId,
      discount_code: discountCode,
    };

    // Save as JSON metafield
    const metafields = [
      {
        ownerId: shopId,
        namespace: "urgify",
        key: "popup_config",
        value: JSON.stringify(settings),
        type: "json"
      },
    ];

    const response = await admin.graphql(`#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `, { variables: { metafields } });

    const data = await response.json();
    const userErrors = data?.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("Metafield error:", userErrors);
      throw new Error(`Failed to save metafields: ${userErrors[0]?.message || 'Unknown error'}`);
    }

    return json({ success: true }, { headers: { ...CORS_HEADERS } });
  } catch (error) {
    console.error("Error saving popup settings:", error);
    
    // Handle authentication errors
    if (error instanceof Response && error.status === 401) {
      // Mirror CORS headers on passthrough 401
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
    
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues?.map((err: any) => `${err.path?.join('.')}: ${err.message}`).join(', ') || 'Validation failed';
      return json({
        error: `Validation failed: ${errorMessage}`
      }, { status: 400, headers: { ...CORS_HEADERS } });
    }
    
    return json({
      error: "Failed to save settings: " + errorMessage
    }, { status: 500, headers: { ...CORS_HEADERS } });
  }
};

type DiscountCodeOption = { id: string; code: string; title: string };
type PopupResource = { id: string; title: string; handle: string };
type PopupLoaderData = SerializeFrom<typeof loader>;
type PopupLoaderSuccess = Extract<PopupLoaderData, { settings: unknown }>;

export default function PopupSettings() {
  const loaderData = useLoaderData<PopupLoaderData>();

  if (!("settings" in loaderData)) {
    const message =
      loaderData.error ||
      "PopUps feature requires a Plus plan. Please upgrade your subscription to access this feature.";

    return <PopupAccessRequired message={message} />;
  }

  return <PopupSettingsForm data={loaderData} />;
}

function PopupAccessRequired({ message }: { message: string }) {
  return (
    <s-page heading="PopUp Settings">
      <s-section>
        <s-banner tone="warning" heading="Subscription Required">
          <s-paragraph>{message}</s-paragraph>
          <div style={{ marginTop: "12px" }}>
            <ViewPlansLink />
          </div>
        </s-banner>
      </s-section>
    </s-page>
  );
}

function PopupSettingsForm({ data }: { data: PopupLoaderSuccess }) {
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const {
    settings,
    discountCodes: discountCodeOptions,
    selectedResource: loadedResource,
  } = data;
  const discountCodes = useMemo<DiscountCodeOption[]>(
    () => (discountCodeOptions ?? []) as DiscountCodeOption[],
    [discountCodeOptions],
  );
  // Priming: Stelle sicher, dass ein Session-Token vorhanden ist, sobald die Seite geladen ist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Versuche zuerst aus sessionStorage
        const existing = sessionStorage.getItem('shopify_session_token');
        if (existing) {
          return; // Token bereits vorhanden
        }
        
        // Wenn kein Token vorhanden, hole es von App Bridge
        // In App Bridge v4 wurde getSessionToken() durch idToken() ersetzt
        const appBridge = shopify as any;
        if (appBridge?.idToken) {
          try {
            const token = await appBridge.idToken();
            if (!cancelled && token) {
              sessionStorage.setItem('shopify_session_token', token);
            }
          } catch (error) {
            console.warn('Failed to prime session token:', error);
            // still allow UI to render; fetch will try again on save
          }
        }
      } catch (error) {
        console.warn('Error priming session token:', error);
        // still allow UI to render; fetch will try again on save
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopify]);
  
  // State management
  const [enabled, setEnabled] = useState(Boolean(settings.enabled));
  const [title, setTitle] = useState(String(settings.title || ''));
  const [description, setDescription] = useState(String(settings.description || ''));
  const [ctaText, setCtaText] = useState(String(settings.ctaText || 'Get Started'));
  const [ctaUrl, setCtaUrl] = useState(String(settings.ctaUrl || 'https://'));
  const [ctaUrlType, setCtaUrlType] = useState<'product' | 'collection' | 'external'>('external');
  const [selectedResource, setSelectedResource] = useState<PopupResource | null>(
    (loadedResource ?? null) as PopupResource | null,
  );
  const [imageUrl, setImageUrl] = useState(String(settings.imageUrl || ''));
  const [imageFit, setImageFit] = useState<string>(String(settings.imageFit || 'cover'));
  const [imageAlt, setImageAlt] = useState<string>(String(settings.imageAlt || ''));
  const [imagePosition, setImagePosition] = useState<string>(String(settings.imagePosition || 'top'));
  const [style, setStyle] = useState(String(settings.style || 'spectacular'));
  const [titleFontSize, setTitleFontSize] = useState(String(settings.titleFontSize || '24px'));
  const [descriptionFontSize, setDescriptionFontSize] = useState(String(settings.descriptionFontSize || '16px'));
  const [ctaFontSize, setCtaFontSize] = useState(String(settings.ctaFontSize || '16px'));
  const [backgroundColor, setBackgroundColor] = useState(String(settings.backgroundColor || '#ffffff'));
  const [textColor, setTextColor] = useState(String(settings.textColor || '#000000'));
  const [ctaBackgroundColor, setCtaBackgroundColor] = useState(String(settings.ctaBackgroundColor || '#007bff'));
  const [ctaTextColor, setCtaTextColor] = useState(String(settings.ctaTextColor || '#ffffff'));
  const [overlayColor, setOverlayColor] = useState(String(settings.overlayColor || 'rgba(0, 0, 0, 0.5)'));
  const [placement, setPlacement] = useState(String(settings.placement || 'all'));
  const [position, setPosition] = useState(String(settings.position || 'middle-center'));
  const [triggerType, setTriggerType] = useState(String(settings.triggerType || 'delay'));
  const [delaySeconds, setDelaySeconds] = useState(String(settings.delaySeconds || 3));
  const [cookieDays, setCookieDays] = useState(String(settings.cookieDays || 7));
  const [ignoreCookie, setIgnoreCookie] = useState(Boolean(settings.ignoreCookie || false));
  const [enableNewsletter, setEnableNewsletter] = useState(Boolean(settings.enableNewsletter || false));
  const [discountCodeId, setDiscountCodeId] = useState(String(settings.discountCodeId || ''));
  
  const [isDirty, setIsDirty] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("Settings saved successfully!");
  const [isSaving, setIsSaving] = useState(false);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toastActive) {
      const timer = setTimeout(() => {
        setToastActive(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastActive]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  useEffect(() => {
    if (triggerType === 'always' && !ignoreCookie) {
      setIgnoreCookie(true);
      setIsDirty(true);
    }
  }, [triggerType, ignoreCookie]);

  const isAlwaysTrigger = triggerType === 'always';


  // Update local state when loader data changes
  useEffect(() => {
    setEnabled(Boolean(settings.enabled));
    setTitle(String(settings.title || ''));
    setDescription(String(settings.description || ''));
    setCtaText(String(settings.ctaText || 'Get Started'));
    const url = String(settings.ctaUrl || 'https://');
    setCtaUrl(url);
    
    // Automatisch den Link-Typ basierend auf der URL erkennen
    if (url.startsWith('/products/')) {
      setCtaUrlType('product');
    } else if (url.startsWith('/collections/')) {
      setCtaUrlType('collection');
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      setCtaUrlType('external');
    } else {
      setCtaUrlType('external');
    }
    
    setImageUrl(String(settings.imageUrl || ''));
    setImageFit(String(settings.imageFit || 'cover'));
    setImageAlt(String(settings.imageAlt || ''));
    setImagePosition(String(settings.imagePosition || 'top'));
    setStyle(String(settings.style || 'spectacular'));
    setTitleFontSize(String(settings.titleFontSize || '24px'));
    setDescriptionFontSize(String(settings.descriptionFontSize || '16px'));
    setCtaFontSize(String(settings.ctaFontSize || '16px'));
    setBackgroundColor(String(settings.backgroundColor || '#ffffff'));
    setTextColor(String(settings.textColor || '#000000'));
    setCtaBackgroundColor(String(settings.ctaBackgroundColor || '#007bff'));
    setCtaTextColor(String(settings.ctaTextColor || '#ffffff'));
    setOverlayColor(String(settings.overlayColor || 'rgba(0, 0, 0, 0.5)'));
    setPlacement(String(settings.placement || 'all'));
    setPosition(String(settings.position || 'middle-center'));
    setTriggerType(String(settings.triggerType || 'delay'));
    setDelaySeconds(String(settings.delaySeconds || 3));
    setCookieDays(String(settings.cookieDays || 7));
    setIgnoreCookie(Boolean(settings.ignoreCookie || false));
    setEnableNewsletter(Boolean(settings.enableNewsletter || false));
    setDiscountCodeId(String(settings.discountCodeId || ''));
    
    // Set selected resource if loaded from server
    if (loadedResource) {
      setSelectedResource(loadedResource);
    } else {
      setSelectedResource(null);
    }
  }, [settings, loadedResource]);

  // Reset custom values when switching from custom to a predefined style
  const previousStyleRef = useRef<string>(style);
  
  useEffect(() => {
    // Wenn der Stil von "custom" zu einem anderen Stil geändert wird, 
    // setze die Custom-Werte auf ihre Standardwerte zurück
    if (previousStyleRef.current === 'custom' && style !== 'custom') {
      setTitleFontSize('24px');
      setDescriptionFontSize('16px');
      setCtaFontSize('16px');
      setBackgroundColor('#ffffff');
      setTextColor('#000000');
      setCtaBackgroundColor('#007bff');
      setCtaTextColor('#ffffff');
      setIsDirty(true);
    }
    previousStyleRef.current = style;
  }, [style]);

  // Control save bar visibility programmatically
  useEffect(() => {
    const saveBar = document.getElementById('popup-save-bar') as any;
    if (saveBar) {
      if (isDirty) {
        saveBar.show();
      } else {
        saveBar.hide();
      }
    }
  }, [isDirty]);

  // Responsive state for grid columns
  const [isMobilePopup, setIsMobilePopup] = useState(false);
  const popupAttemptsRef = useRef(0);
  
  // Check screen size on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobilePopup(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Responsive grid layout for mobile - CSS handles most of it, this is a fallback
  useEffect(() => {
    popupAttemptsRef.current = 0; // Reset on change
    
    const updateGridLayout = () => {
      const grid = document.querySelector('.popup-settings-grid') as HTMLElement;
      if (!grid || !grid.style) return;
      
      if (isMobilePopup) {
        // Force single column via style
        grid.style.setProperty('grid-template-columns', '1fr', 'important');
        grid.style.setProperty('display', 'grid', 'important');
        
        // Remove the attribute that might be setting it
        grid.removeAttribute('gridTemplateColumns');
        
        // Make preview section appear first
        const sections = grid.querySelectorAll('s-section');
        if (sections.length >= 2) {
          // Find the preview section (contains the preview container)
          const previewSection = Array.from(sections).find((section: Element) => {
            return section.querySelector('.popup-preview-sticky-container');
          }) as HTMLElement;
          
          if (previewSection && previewSection.style) {
            previewSection.style.setProperty('order', '-1', 'important');
            previewSection.style.setProperty('grid-column', '1', 'important');
            previewSection.style.setProperty('grid-row', '1', 'important');
          }
          
          // Ensure settings section appears second
          const settingsSection = Array.from(sections).find((section: Element) => {
            return !section.querySelector('.popup-preview-sticky-container');
          }) as HTMLElement;
          
          if (settingsSection && settingsSection.style) {
            settingsSection.style.setProperty('order', '0', 'important');
            settingsSection.style.setProperty('grid-column', '1', 'important');
            settingsSection.style.setProperty('grid-row', '2', 'important');
          }
          
          // Ensure all sections take full width
          sections.forEach((section: any) => {
            if (section.style) {
              section.style.setProperty('width', '100%', 'important');
              section.style.setProperty('max-width', '100%', 'important');
            }
          });
        }
      } else {
        // Desktop: reset to default (1/3 settings, 2/3 preview)
        grid.style.setProperty('grid-template-columns', '1fr 2fr', 'important');
        const sections = grid.querySelectorAll('s-section');
        sections.forEach((section: any) => {
          if (section.style) {
            section.style.removeProperty('order');
            section.style.removeProperty('grid-row');
          }
        });
      }
    };

    // Use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
      setTimeout(updateGridLayout, 50);
    });
    
    // Run a few times initially to catch late-rendering Web Components
    const maxAttempts = 10;
    const interval = setInterval(() => {
      updateGridLayout();
      popupAttemptsRef.current++;
      if (popupAttemptsRef.current >= maxAttempts) {
        clearInterval(interval);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isMobilePopup]);

  const handleEnabledChange = useCallback((checked: boolean) => {
    setEnabled(checked);
    setIsDirty(true);
  }, []);

  const handleOpenResourcePicker = useCallback(async (resourceType: 'product' | 'collection') => {
    try {
      const selected = await shopify.resourcePicker({
        type: resourceType,
        action: 'select',
        multiple: false,
      });

      if (selected && selected.length > 0) {
        const resource = selected[0];
        let url = '/';
        
        if ('handle' in resource && resource.handle) {
          if (resourceType === 'product') {
            url = `/products/${resource.handle}`;
          } else if (resourceType === 'collection') {
            url = `/collections/${resource.handle}`;
          }
          setCtaUrl(url);
          
          // Speichere die ausgewählte Ressource für die Anzeige
          if ('id' in resource && 'title' in resource) {
            setSelectedResource({
              id: String(resource.id),
              title: String(resource.title || ''),
              handle: String(resource.handle || ''),
            });
          }
          
          setIsDirty(true);
        }
      }
    } catch (error) {
      console.error('Error opening resource picker:', error);
    }
  }, [shopify]);

  const handleCtaUrlTypeChange = useCallback((value: string) => {
    const newType = value as typeof ctaUrlType;
    setCtaUrlType(newType);
    setIsDirty(true);
    
    // Wenn ein Typ ausgewählt wird, der keinen Resource Picker unterstützt, Ressource zurücksetzen
    if (newType !== 'product' && newType !== 'collection') {
      setSelectedResource(null);
      // Bei externen Links URL-Feld auf https:// setzen, falls es eine Shopify-URL ist oder leer
      if (newType === 'external') {
        if (ctaUrl.startsWith('/products/') || ctaUrl.startsWith('/collections/') || 
            ctaUrl.startsWith('/pages/') || ctaUrl.startsWith('/blogs/') || 
            ctaUrl.startsWith('/policies/') || !ctaUrl.startsWith('http://') && !ctaUrl.startsWith('https://')) {
          setCtaUrl('https://');
        }
      }
    }
  }, [ctaUrl]);
  
  const handleResourceFieldClick = useCallback(() => {
    if (ctaUrlType === 'product' || ctaUrlType === 'collection') {
      handleOpenResourcePicker(ctaUrlType);
    }
  }, [ctaUrlType, handleOpenResourcePicker]);

  const handleImageUpload = useCallback(async (event: any) => {
    const dropZone = event.currentTarget as any;
    const files = dropZone.files || [];
    const file = files[0];
    
    if (!file) {
      return;
    }

    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validImageTypes.includes(file.type)) {
      setUploadError("Invalid file type. Only images are allowed.");
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setUploadError("File size exceeds maximum limit of 10MB");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Get session token
      const appBridge = shopify as any;
      let token: string | null = null;
      try {
        token = await appBridge.idToken();
        if (!token) {
          token = sessionStorage.getItem('shopify_session_token');
        }
      } catch (error) {
        token = sessionStorage.getItem('shopify_session_token');
      }

      if (!token) {
        throw new Error('Session token not available. Please refresh the page.');
      }

      // Upload file
      const formData = new FormData();
      formData.append("file", file);

      const response = await authenticatedFetch("/api/upload-image", {
        method: "POST",
        body: formData,
        sessionToken: token,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as any));
        throw new Error(data?.error || `Upload failed (${response.status})`);
      }

      const data = await response.json();
      
      if (data.success && data.imageUrl) {
        setImageUrl(data.imageUrl);
        setIsDirty(true);
        setUploadError(null);
        setToastMessage("Image uploaded successfully!");
        setToastActive(true);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      const message = error instanceof Error ? error.message : "Failed to upload image";
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  }, [shopify]);

  const handleSaveSettings = useCallback(async () => {
    const selectedDiscount = discountCodes.find(
      (dc: DiscountCodeOption) => dc.id === discountCodeId,
    );
    const discountCode = selectedDiscount?.code || '';

    const payload: Record<string, string> = {
      enabled: enabled.toString(),
      title,
      description,
      ctaText,
      ctaUrl,
      imageUrl,
      imageFit: imageFit.toString(),
      imageAlt,
      imagePosition: imagePosition.toString(),
      style,
      titleFontSize,
      descriptionFontSize,
      ctaFontSize,
      backgroundColor,
      textColor,
      ctaBackgroundColor,
      ctaTextColor,
      overlayColor,
      placement,
      position,
      triggerType,
      delaySeconds,
      cookieDays,
      ignoreCookie: ignoreCookie.toString(),
      enableNewsletter: enableNewsletter.toString(),
      discountCodeId,
      discountCode,
    };

    const formPayload = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      formPayload.append(key, value);
    });

    try {
      setIsSaving(true);
      setToastMessage("Settings saved successfully!");

      // Hole IMMER ein frisches Token von App Bridge (verhindert abgelaufene Tokens)
      if (!shopify) {
        throw new Error('App Bridge not available. Please refresh the page.');
      }
      const appBridge = shopify as any;
      if (typeof appBridge.idToken !== 'function') {
        console.error('shopify.idToken is not a function:', shopify);
        throw new Error('Session token method not available. Please refresh the page.');
      }
      let token: string | null = null;
      try {
        token = await appBridge.idToken();
        if (token) {
          sessionStorage.setItem('shopify_session_token', token);
        } else {
          throw new Error('Session token was empty');
        }
      } catch (error) {
        console.error('Failed to get session token from App Bridge:', error);
        // Fallback: nutze evtl. vorhandenes Token aus sessionStorage
        token = sessionStorage.getItem('shopify_session_token');
      }

      if (!token) {
        throw new Error('Session token not available. Please refresh the page.');
      }

      const response = await authenticatedFetch("/app/popup", {
        method: "POST",
        body: formPayload,
        sessionToken: token, // Übergib das Token direkt
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as any));
        const message = data?.error || `Failed to save settings (${response.status})`;
        throw new Error(message);
      }

      setToastMessage("Settings saved successfully!");
      setToastActive(true);
      setIsDirty(false);
      revalidator.revalidate();
    } catch (error) {
      console.error("Error saving popup settings:", error);
      const message = error instanceof Error ? error.message : "Failed to save settings";
      setToastMessage(message);
      setToastActive(true);
    } finally {
      setIsSaving(false);
    }
  }, [discountCodes, discountCodeId, enableNewsletter, backgroundColor, ctaBackgroundColor, ctaFontSize, ctaText, ctaTextColor, ctaUrl, delaySeconds, description, descriptionFontSize, enabled, imageUrl, imageFit, imageAlt, imagePosition, overlayColor, placement, position, triggerType, revalidator, shopify, style, textColor, title, titleFontSize, cookieDays, ignoreCookie]);

  // Preview component
  const PopupPreview = () => {
    // Debug: Log the enableNewsletter value (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('PopupPreview render - enableNewsletter:', enableNewsletter, typeof enableNewsletter);
    }
    
    const getPreviewStyles = () => {
      if (style === 'custom') {
        return {
          backgroundColor,
          color: textColor,
        };
      }
      return {};
    };

    const getCtaStyles = () => {
      if (style === 'custom') {
        return {
          backgroundColor: ctaBackgroundColor,
          color: ctaTextColor,
          fontSize: ctaFontSize,
        };
      }
      return {};
    };

    const getTitleStyles = () => {
      if (style === 'custom') {
        return {
          fontSize: titleFontSize,
          color: textColor,
        };
      }
      return {};
    };

    const getDescriptionStyles = () => {
      if (style === 'custom') {
        return {
          fontSize: descriptionFontSize,
          color: textColor,
        };
      }
      return {};
    };

        // Determine layout based on image position
        const isHorizontalLayout = imagePosition === 'left' || imagePosition === 'right';
        const previewContainerStyle: React.CSSProperties = {
          ...getPreviewStyles(),
          position: 'relative',
          display: isHorizontalLayout ? 'flex' : 'block',
          flexDirection: imagePosition === 'right' ? 'row-reverse' : imagePosition === 'left' ? 'row' : 'column',
          gap: isHorizontalLayout ? '0' : '0',
          alignItems: isHorizontalLayout ? 'stretch' : 'stretch',
          alignContent: isHorizontalLayout ? 'stretch' : 'normal',
          margin: '0', // No negative margins
          padding: '32px', // Keep padding
          minHeight: 'auto',
          maxHeight: 'none',
          overflow: 'visible', // Changed to visible
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
        };

        const imageContainerStyle: React.CSSProperties = {
          width: isHorizontalLayout ? '40%' : '100%',
          maxWidth: isHorizontalLayout ? '200px' : 'none',
          flexShrink: 0,
          marginBottom: imagePosition === 'top' ? '20px' : imagePosition === 'bottom' ? '0' : '0',
          marginTop: imagePosition === 'bottom' ? '20px' : '0',
          marginLeft: isHorizontalLayout ? '0' : '0',
          marginRight: isHorizontalLayout ? '0' : '0',
          // Don't set order for horizontal layouts - let CSS handle it on mobile
          // For desktop, order is handled by flexDirection (row/row-reverse)
          order: isHorizontalLayout ? undefined : (imagePosition === 'bottom' ? 5 : 1),
          height: isHorizontalLayout ? '100%' : 'auto',
          minHeight: isHorizontalLayout ? '100%' : 'auto',
          borderRadius: '8px', // All corners rounded since image doesn't extend to edge
          overflow: 'hidden',
          display: isHorizontalLayout ? 'flex' : 'block',
          alignItems: isHorizontalLayout ? 'stretch' : 'normal',
          alignSelf: isHorizontalLayout ? 'stretch' : 'auto',
        };

        const imageInnerStyle: React.CSSProperties = {
          width: '100%',
          height: isHorizontalLayout ? '100%' : 'auto',
          minHeight: isHorizontalLayout ? '100%' : 'auto',
          maxHeight: isHorizontalLayout ? 'none' : '150px',
          objectFit: imageFit === 'contain' ? 'contain' : 'cover',
          display: 'block',
        };

        const contentWrapperStyle: React.CSSProperties = isHorizontalLayout ? {
          flex: '1 1 0%', // Use flex-basis 0% to prevent overflow
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0, // Prevent overflow in flex containers
          maxWidth: '100%', // Ensure it doesn't exceed container
          // Don't set order for horizontal layouts - let CSS handle it on mobile
          order: undefined,
          padding: imageUrl ? (imagePosition === 'left' ? '0 0 0 32px' : '0 32px 0 0') : '0', // Padding on side away from image, only if image exists
          boxSizing: 'border-box',
          overflow: 'hidden', // Prevent content from overflowing
        } : {
          order: imagePosition === 'bottom' ? 1 : 2,
          maxWidth: '100%',
          boxSizing: 'border-box',
          width: '100%',
        };

    return (
      <s-stack gap="base" direction="block">
        <s-heading>Preview</s-heading>
        <div style={{ overflow: 'visible', position: 'relative', maxHeight: 'none', height: 'auto', width: '100%', maxWidth: '100%' }}>
          <div 
            className={`urgify-popup-preview urgify-popup-preview--${style} ${isHorizontalLayout ? 'urgify-popup-preview--horizontal' : ''}`}
            style={previewContainerStyle}
          >
            <button 
              className="urgify-popup-close-preview"
              type="button"
              aria-label="Close popup"
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: style === 'spectacular' || style === 'brutalist' 
                  ? 'rgba(255, 255, 255, 0.2)' 
                  : style === 'glassmorphism'
                  ? 'rgba(255, 255, 255, 0.5)'
                  : 'rgba(255, 255, 255, 0.9)',
                border: style === 'glassmorphism' ? '1px solid rgba(255, 255, 255, 0.7)' : 'none',
                fontSize: '32px',
                lineHeight: 1,
                cursor: 'default',
                color: style === 'spectacular' || style === 'brutalist' ? '#fff' : style === 'glassmorphism' ? '#1a1a1a' : '#666',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                padding: 0,
                zIndex: 20,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                pointerEvents: 'none',
              }}
            >
              ×
            </button>
            {imageUrl && imagePosition !== 'bottom' && (
              <div className="urgify-popup-preview-image-container" style={imageContainerStyle}>
                <img 
                  src={imageUrl} 
                  alt={imageAlt || 'Urgify popup preview image'}
                  style={imageInnerStyle}
                />
              </div>
            )}
            <div className="urgify-popup-preview-content-wrapper" style={contentWrapperStyle}>
              {title && (
                <h3 style={getTitleStyles()}>
                  {title}
                </h3>
              )}
              {description && (
                <p style={getDescriptionStyles()}>
                  {description
                    .replace(/\r\n/g, '\n')  // Normalize Windows line breaks
                    .replace(/\r/g, '\n')    // Normalize Mac line breaks
                    .split('\n')
                    .map((line, i, arr) => (
                      <Fragment key={i}>
                        {line}
                        {i < arr.length - 1 && <br />}
                      </Fragment>
                    ))}
                </p>
              )}
            {enableNewsletter ? (
              <div 
                className="urgify-popup-newsletter-container" 
                style={{ 
                  display: 'block', 
                  width: '100%',
                  marginTop: '20px',
                  visibility: 'visible',
                  opacity: 1
                }}
              >
                <div 
                  className="urgify-popup-newsletter-input-group" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: isHorizontalLayout ? 'column' : 'row',
                    gap: '12px', 
                    width: '100%', 
                    alignItems: isHorizontalLayout ? 'stretch' : 'center',
                    visibility: 'visible',
                    opacity: 1
                  }}
                >
                  <input 
                    type="email" 
                    className="urgify-popup-newsletter-email"
                    placeholder="Enter your email"
                    disabled
                    style={{ 
                      flex: 1,
                      padding: '12px 16px',
                      border: '2px solid #e0e0e0',
                      borderRadius: '8px',
                      fontSize: '16px',
                      backgroundColor: '#fff',
                      color: '#333',
                      minWidth: 0
                    }}
                  />
                  <button 
                    type="button"
                    className="urgify-popup-newsletter-submit"
                    style={{ 
                      ...getCtaStyles(), 
                      flexShrink: 0,
                      padding: '12px 24px',
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      backgroundColor: style === 'custom' ? ctaBackgroundColor : '#007bff',
                      color: style === 'custom' ? ctaTextColor : '#ffffff',
                      width: isHorizontalLayout ? '100%' : 'auto'
                    }}
                    onClick={(e) => e.preventDefault()}
                    disabled
                  >
                    Subscribe
                  </button>
                </div>
              </div>
            ) : (
              ctaText && (
                <button 
                  type="button"
                  className="urgify-popup-cta-preview"
                  style={getCtaStyles()}
                  onClick={(e) => e.preventDefault()}
                  >
                    {ctaText}
                  </button>
                )
              )}
            </div>
            {imageUrl && imagePosition === 'bottom' && (
              <div className="urgify-popup-preview-image-container" style={imageContainerStyle}>
                <img 
                  src={imageUrl} 
                  alt={imageAlt || 'Urgify popup preview image'}
                  style={imageInnerStyle}
                />
              </div>
            )}
          </div>
        </div>
      </s-stack>
    );
  };

  return (
    <s-page heading="PopUp Settings">
      <s-grid 
        gap="base" 
        gridTemplateColumns={isMobilePopup ? "1fr" : "1fr 2fr"}
        className="popup-settings-grid"
      >
        <s-section heading="PopUp Settings">
          <s-stack gap="base" direction="block">
                  <s-checkbox
                    label="Enable PopUp"
                    checked={enabled}
                    onChange={(e) => handleEnabledChange(e.currentTarget.checked)}
                  />
                  
                  <s-text-field
                    label="Title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.currentTarget.value);
                      setIsDirty(true);
                    }}
                    autocomplete="off"
                  />
                  
                  <s-text-area
                    label="Description"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.currentTarget.value);
                      setIsDirty(true);
                    }}
                    rows={3}
                  />
                  
                  <s-heading level="2">CTA Button or Newsletter Signup</s-heading>
                  <s-paragraph color="subdued">
                    Choose one: a CTA button with a link <strong>or</strong> a newsletter signup form. You can't use both.
                  </s-paragraph>
                  
                  <s-choice-list
                    name="cta-or-newsletter"
                    label="Select type"
                    values={enableNewsletter ? ["newsletter"] : ["cta"]}
                    onChange={(e) => {
                      const values = (e.currentTarget as any).values || [];
                      const newValue = Array.isArray(values) && values.length > 0 && values[0] === "newsletter";
                      if (process.env.NODE_ENV === 'development') {
                        console.log('Newsletter selection changed:', { values, newValue, enableNewsletter });
                      }
                      setEnableNewsletter(newValue);
                      setIsDirty(true);
                    }}
                  >
                    <s-choice value="cta" selected={!enableNewsletter}>
                      CTA Button (Link)
                      <s-text slot="details">Shows a button with a configurable link</s-text>
                    </s-choice>
                    <s-choice value="newsletter" selected={enableNewsletter}>
                      Newsletter Signup (Email field)
                      <s-text slot="details">Shows an email input field for newsletter subscription</s-text>
                    </s-choice>
                  </s-choice-list>
                  
                  {!enableNewsletter ? (
                    <s-stack gap="base" direction="block">
                      <s-text-field
                        label="CTA Text"
                        value={ctaText}
                        onChange={(e) => {
                          setCtaText(e.currentTarget.value);
                          setIsDirty(true);
                        }}
                        autocomplete="off"
                        details="Button text for the call-to-action"
                      />
                      
                      <s-select
                        label="Link type"
                        value={ctaUrlType}
                        onChange={(e) => handleCtaUrlTypeChange(e.currentTarget.value)}
                      >
                        <s-option value="collection">Collection</s-option>
                        <s-option value="product">Product</s-option>
                        <s-option value="external">External link</s-option>
                      </s-select>
                      
                      {(ctaUrlType === 'product' || ctaUrlType === 'collection') && (
                        <div>
                          <label htmlFor="resource-reference-field" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                            {ctaUrlType === 'product' ? 'Product' : 'Collection'}
                          </label>
                          <div
                            id="resource-reference-field"
                            onClick={handleResourceFieldClick}
                            style={{
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              padding: '8px 12px',
                              cursor: 'pointer',
                              backgroundColor: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              minHeight: '36px',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#6366f1';
                              e.currentTarget.style.backgroundColor = '#f9fafb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#d1d5db';
                              e.currentTarget.style.backgroundColor = '#ffffff';
                            }}
                          >
                            <span style={{ 
                              color: selectedResource ? '#000000' : '#6b7280',
                              fontSize: '14px',
                              flex: 1,
                            }}>
                              {selectedResource ? selectedResource.title : `Select a ${ctaUrlType}`}
                            </span>
                            <svg 
                              width="16" 
                              height="16" 
                              viewBox="0 0 16 16" 
                              fill="none" 
                              xmlns="http://www.w3.org/2000/svg"
                              style={{ color: '#6b7280', flexShrink: 0, marginLeft: '8px' }}
                            >
                              <path 
                                d="M6 12L10 8L6 4" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          {selectedResource && (
                            <s-button
                              variant="tertiary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedResource(null);
                                setCtaUrl('/');
                                setIsDirty(true);
                              }}
                              style={{ marginTop: '8px' }}
                            >
                              Remove {ctaUrlType}
                            </s-button>
                          )}
                        </div>
                      )}
                      
                      {ctaUrlType === 'external' && (
                        <s-url-field
                          label="CTA URL"
                          value={ctaUrl}
                          onChange={(e) => {
                            setCtaUrl(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                          details="Enter external URL (e.g., https://example.com)"
                        />
                      )}
                    </s-stack>
                  ) : null}
                  
                  {enableNewsletter && (
                    <s-select
                      label="Discount Code"
                      value={discountCodeId}
                      onChange={(e) => {
                        setDiscountCodeId(e.currentTarget.value);
                        setIsDirty(true);
                      }}
                      details="Select a discount code to show after newsletter signup"
                    >
                      <s-option value="">No discount</s-option>
                      {discountCodes.map((dc: DiscountCodeOption) => (
                        <s-option key={dc.id} value={dc.id}>
                          {dc.title} ({dc.code})
                        </s-option>
                      ))}
                    </s-select>
                  )}
                  
                  <s-drop-zone
                    label="Upload Image"
                    accept="image/*"
                    accessibilityLabel="Upload an image file for the popup"
                    onChange={handleImageUpload as any}
                    onInput={handleImageUpload as any}
                    disabled={isUploading}
                    error={uploadError || undefined}
                  />
                  
                  {imageUrl && (
                    <div style={{ marginTop: '12px' }}>
                      <s-image
                        src={imageUrl}
                        alt="Uploaded image preview"
                        inlineSize="auto"
                        borderRadius="base"
                        style={{ maxWidth: '200px', maxHeight: '200px' }}
                      />
                      <s-button
                        variant="tertiary"
                        onClick={(e: React.MouseEvent<HTMLElement>) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setImageUrl('');
                          setIsDirty(true);
                          setUploadError(null);
                        }}
                        style={{ marginTop: '8px' }}
                      >
                        Remove Image
                      </s-button>
                    </div>
                  )}
                  
                  {imageUrl && (
                    <>
                      <s-select
                        label="Image Fit"
                        value={imageFit}
                        onChange={(e) => {
                          setImageFit(e.currentTarget.value);
                          setIsDirty(true);
                        }}
                        details="Fill: Image fills the area (may be cropped). Contain: Image is fully displayed (may have empty areas)."
                      >
                        <s-option value="cover">Fill</s-option>
                        <s-option value="contain">Contain</s-option>
                      </s-select>
                      
                      <s-select
                        label="Image Position in Popup"
                        value={imagePosition}
                        onChange={(e) => {
                          setImagePosition(e.currentTarget.value);
                          setIsDirty(true);
                        }}
                        details="Where to position the image within the popup: Top (above content), Bottom (below content), Left (beside content), or Right (beside content)."
                      >
                        <s-option value="top">Top</s-option>
                        <s-option value="bottom">Bottom</s-option>
                        <s-option value="left">Left</s-option>
                        <s-option value="right">Right</s-option>
                      </s-select>
                      
                      <s-text-field
                        label="Alt Text"
                        value={imageAlt}
                        onChange={(e) => {
                          setImageAlt(e.currentTarget.value);
                          setIsDirty(true);
                        }}
                        autocomplete="off"
                        details="Description of the image for accessibility and SEO. Used when the image cannot be loaded."
                      />
                    </>
                  )}
                  
                  <s-select
                    label="Style"
                    value={style}
                    onChange={(e) => {
                      setStyle(e.currentTarget.value);
                      setIsDirty(true);
                    }}
                  >
                    <s-option value="spectacular">Spectacular</s-option>
                    <s-option value="brutalist">Brutalist</s-option>
                    <s-option value="glassmorphism">Glassmorphism</s-option>
                    <s-option value="neumorphism">Neumorphism</s-option>
                    <s-option value="minimal">Minimal</s-option>
                    <s-option value="custom">Custom</s-option>
                  </s-select>
                  
                  <s-select
                    label="Placement"
                    value={placement}
                    onChange={(e) => {
                      setPlacement(e.currentTarget.value);
                      setIsDirty(true);
                    }}
                  >
                    <s-option value="all">All Pages</s-option>
                    <s-option value="homepage">Homepage Only</s-option>
                    <s-option value="products">Product Pages Only</s-option>
                  </s-select>
                  
                  <s-select
                    label="Position"
                    value={position}
                    onChange={(e) => {
                      setPosition(e.currentTarget.value);
                      setIsDirty(true);
                    }}
                  >
                    <s-option value="top-left">Top Left</s-option>
                    <s-option value="top-center">Top Center</s-option>
                    <s-option value="top-right">Top Right</s-option>
                    <s-option value="middle-left">Middle Left</s-option>
                    <s-option value="middle-center">Middle Center</s-option>
                    <s-option value="middle-right">Middle Right</s-option>
                    <s-option value="bottom-left">Bottom Left</s-option>
                    <s-option value="bottom-center">Bottom Center</s-option>
                    <s-option value="bottom-right">Bottom Right</s-option>
                  </s-select>
                  
                  <s-select
                    label="Trigger Type"
                    value={triggerType}
                    onChange={(e) => {
                      setTriggerType(e.currentTarget.value);
                      setIsDirty(true);
                    }}
                  >
                    <s-option value="immediate">Immediate</s-option>
                    <s-option value="delay">After Delay</s-option>
                    <s-option value="exit_intent">Exit Intent</s-option>
                    <s-option value="always">Always Show</s-option>
                  </s-select>
                  
                  {triggerType === 'delay' && (
                    <s-number-field
                      label="Delay (seconds)"
                      value={delaySeconds}
                      min={0}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        const numValue = parseInt(value, 10);
                        // Ensure value is not negative
                        const safeValue = isNaN(numValue) || numValue < 0 ? '0' : value;
                        setDelaySeconds(safeValue);
                        setIsDirty(true);
                      }}
                    />
                  )}
                  
                  {!isAlwaysTrigger && (
                    <>
                      <div style={{ opacity: ignoreCookie ? 0.5 : 1, pointerEvents: ignoreCookie ? 'none' : 'auto' }}>
                        <s-number-field
                          label="Cookie Duration (days)"
                          value={cookieDays}
                          min={1}
                          onChange={(e) => {
                            if (ignoreCookie) return;
                            const value = e.currentTarget.value;
                            const numValue = parseInt(value, 10);
                            // Ensure value is at least 1
                            const safeValue = isNaN(numValue) || numValue < 1 ? '1' : value;
                            setCookieDays(safeValue);
                            setIsDirty(true);
                          }}
                        />
                      </div>
                      <s-paragraph color="subdued" style={{ marginTop: '-8px', marginBottom: '16px' }}>
                        Days to hide popup after dismissal
                      </s-paragraph>
                    </>
                  )}

                  <div style={isAlwaysTrigger ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
                    <s-checkbox
                      label="Always show popup (ignore cookie)"
                      checked={isAlwaysTrigger ? true : ignoreCookie}
                      aria-disabled={isAlwaysTrigger ? 'true' : 'false'}
                      onChange={(e) => {
                        if (isAlwaysTrigger) return;
                        setIgnoreCookie(e.currentTarget.checked);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <s-paragraph color="subdued" style={{ marginTop: '-8px', marginBottom: '16px' }}>
                    {isAlwaysTrigger
                      ? "Always Show trigger ignores cookie duration and forces the popup to appear on every page load."
                      : "If enabled, the popup will always be shown, regardless of cookie duration. This overrides the cookie duration setting."}
                  </s-paragraph>
                  
                  {style === "custom" && (
                    <>
                      <s-heading level="2">Typography</s-heading>
                      <s-stack gap="base" direction="inline">
                        <s-text-field
                          label="Title Font Size"
                          value={titleFontSize}
                          onChange={(e) => {
                            setTitleFontSize(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                          details="e.g., 24px, 1.5rem"
                        />
                        <s-text-field
                          label="Description Font Size"
                          value={descriptionFontSize}
                          onChange={(e) => {
                            setDescriptionFontSize(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                        />
                        <s-text-field
                          label="CTA Font Size"
                          value={ctaFontSize}
                          onChange={(e) => {
                            setCtaFontSize(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                        />
                      </s-stack>
                      
                      <s-heading level="2">Colors</s-heading>
                      <s-stack gap="base" direction="inline">
                        <s-color-field
                          label="Background Color"
                          value={backgroundColor}
                          onChange={(e) => {
                            setBackgroundColor(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                          details="e.g., #ffffff"
                        />
                        <s-color-field
                          label="Text Color"
                          value={textColor}
                          onChange={(e) => {
                            setTextColor(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                        />
                        <s-color-field
                          label="Overlay Color"
                          value={overlayColor}
                          onChange={(e) => {
                            setOverlayColor(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                          alpha
                          details="e.g., rgba(0, 0, 0, 0.5)"
                        />
                      </s-stack>
                      <s-stack gap="base" direction="inline">
                        <s-color-field
                          label="CTA Background Color"
                          value={ctaBackgroundColor}
                          onChange={(e) => {
                            setCtaBackgroundColor(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                        />
                        <s-color-field
                          label="CTA Text Color"
                          value={ctaTextColor}
                          onChange={(e) => {
                            setCtaTextColor(e.currentTarget.value);
                            setIsDirty(true);
                          }}
                          autocomplete="off"
                        />
                      </s-stack>
                    </>
                  )}
                </s-stack>
          </s-section>
          
          <s-section>
            <div className="popup-preview-sticky-container">
              <PopupPreview />
            </div>
          </s-section>
      </s-grid>
      
      <ui-save-bar 
        id="popup-save-bar"
      >
        <button 
          variant="primary" 
          id="popup-save-button"
          onClick={handleSaveSettings}
          disabled={isSaving}
          {...(isSaving ? { loading: true } : {})}
        >
          Save
        </button>
        <button 
          id="popup-discard-button"
          onClick={() => {
            setEnabled(Boolean(settings.enabled));
            setTitle(String(settings.title || ''));
            setDescription(String(settings.description || ''));
            setCtaText(String(settings.ctaText || 'Get Started'));
            setCtaUrl(String(settings.ctaUrl || 'https://'));
            setImageUrl(String(settings.imageUrl || ''));
            setImageFit(String(settings.imageFit || 'cover'));
            setImageAlt(String(settings.imageAlt || ''));
            setImagePosition(String(settings.imagePosition || 'top'));
            setStyle(String(settings.style || 'spectacular'));
            setTitleFontSize(String(settings.titleFontSize || '24px'));
            setDescriptionFontSize(String(settings.descriptionFontSize || '16px'));
            setCtaFontSize(String(settings.ctaFontSize || '16px'));
            setBackgroundColor(String(settings.backgroundColor || '#ffffff'));
            setTextColor(String(settings.textColor || '#000000'));
            setCtaBackgroundColor(String(settings.ctaBackgroundColor || '#007bff'));
            setCtaTextColor(String(settings.ctaTextColor || '#ffffff'));
            setOverlayColor(String(settings.overlayColor || 'rgba(0, 0, 0, 0.5)'));
            setPlacement(String(settings.placement || 'all'));
            setPosition(String(settings.position || 'middle-center'));
            setTriggerType(String(settings.triggerType || 'delay'));
            setDelaySeconds(String(settings.delaySeconds || 3));
            setCookieDays(String(settings.cookieDays || 7));
            setIgnoreCookie(Boolean(settings.ignoreCookie || false));
            setIsDirty(false);
          }}
        >
          Discard
        </button>
      </ui-save-bar>
      
      {toastActive && (
        <div
          className="urgify-toast-container"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            animation: 'toastSlideIn 0.3s ease-out',
          }}
        >
          <s-banner 
            heading="Settings saved successfully!"
            tone="success"
            dismissible
            onDismiss={() => setToastActive(false)}
          >
            {toastMessage !== "Settings saved successfully!" ? toastMessage : ""}
          </s-banner>
        </div>
      )}
      <style>{`
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        .urgify-toast-container {
          min-width: 300px;
          max-width: 500px;
        }
        .urgify-toast-container s-banner {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </s-page>
  );
}

