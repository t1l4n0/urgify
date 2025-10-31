import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BillingManager } from "../utils/billing";
import { z } from "zod";
import { shouldRateLimit, checkShopifyRateLimit } from "../utils/rateLimiting";
import { validateSessionToken } from "../utils/sessionToken";
import {
  Frame,
  Card,
  Page,
  Layout,
  Text,
  BlockStack,
  Select,
  TextField,
  FormLayout,
  Checkbox,
  Toast,
  ContextualSaveBar,
  InlineStack,
  Button,
  ChoiceList,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
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
  delaySeconds: z.string().default('3'),
  cookieDays: z.string().default('7'),
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

  // Check subscription status
  let hasActiveSubscription = false;
  let isTrialActive = false;
  
  try {
    const billingManager = new BillingManager(session.shop, admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    hasActiveSubscription = subscriptionStatus.hasActiveSubscription;
    isTrialActive = subscriptionStatus.isTrialActive;
  } catch (error) {
    console.error("Error checking subscription status:", error);
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
    const settings = {
      enabled: rawSettings.enabled,
      title: rawSettings.title,
      description: rawSettings.description,
      ctaText: rawSettings.cta_text || rawSettings.ctaText || 'Get Started',
      ctaUrl: rawSettings.cta_url || rawSettings.ctaUrl || '/',
      imageUrl: rawSettings.image_url || rawSettings.imageUrl || '',
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
      enableNewsletter: rawSettings.enable_newsletter || rawSettings.enableNewsletter || false,
      discountCodeId: rawSettings.discount_code_id || rawSettings.discountCodeId || '',
      discountCode: rawSettings.discount_code || rawSettings.discountCode || '',
    };

    return json({
      settings,
      discountCodes,
      hasActiveSubscription,
      isTrialActive,
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
          ctaUrl: '/',
          imageUrl: '',
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
          enableNewsletter: false,
          discountCodeId: '',
          discountCode: '',
        },
        discountCodes: [],
      hasActiveSubscription,
      isTrialActive,
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
      delay_seconds: parseInt(delaySeconds) || 3,
      cookie_days: parseInt(cookieDays) || 7,
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

export default function PopupSettings() {
  const { settings, discountCodes } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
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
  const [ctaUrl, setCtaUrl] = useState(String(settings.ctaUrl || '/'));
  const [ctaUrlType, setCtaUrlType] = useState<'product' | 'collection' | 'page' | 'blog' | 'article' | 'policy' | 'external'>('external');
  const [imageUrl, setImageUrl] = useState(String(settings.imageUrl || ''));
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
  const [enableNewsletter, setEnableNewsletter] = useState(Boolean(settings.enableNewsletter || false));
  const [discountCodeId, setDiscountCodeId] = useState(String(settings.discountCodeId || ''));
  
  const [isDirty, setIsDirty] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("Settings saved successfully!");
  const [isSaving, setIsSaving] = useState(false);
  

  // Update local state when loader data changes
  useEffect(() => {
    setEnabled(Boolean(settings.enabled));
    setTitle(String(settings.title || ''));
    setDescription(String(settings.description || ''));
    setCtaText(String(settings.ctaText || 'Get Started'));
    const url = String(settings.ctaUrl || '/');
    setCtaUrl(url);
    
    // Automatisch den Link-Typ basierend auf der URL erkennen
    if (url.startsWith('/products/')) {
      setCtaUrlType('product');
    } else if (url.startsWith('/collections/')) {
      setCtaUrlType('collection');
    } else if (url.startsWith('/pages/')) {
      setCtaUrlType('page');
    } else if (url.startsWith('/blogs/') && url.split('/').length > 3) {
      setCtaUrlType('article');
    } else if (url.startsWith('/blogs/')) {
      setCtaUrlType('blog');
    } else if (url.startsWith('/policies/')) {
      setCtaUrlType('policy');
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      setCtaUrlType('external');
    } else {
      setCtaUrlType('external');
    }
    
    setImageUrl(String(settings.imageUrl || ''));
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
    setEnableNewsletter(Boolean(settings.enableNewsletter || false));
    setDiscountCodeId(String(settings.discountCodeId || ''));
  }, [settings]);

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
    
    // Wenn ein Typ ausgewählt wird, der einen Resource Picker unterstützt, öffnen wir diesen
    if (newType === 'product' || newType === 'collection') {
      handleOpenResourcePicker(newType);
    } else if (newType === 'external') {
      // Bei externen Links URL-Feld leeren, falls es eine Shopify-URL ist
      if (ctaUrl.startsWith('/products/') || ctaUrl.startsWith('/collections/') || 
          ctaUrl.startsWith('/pages/') || ctaUrl.startsWith('/blogs/') || 
          ctaUrl.startsWith('/policies/')) {
        setCtaUrl('');
      }
    }
  }, [ctaUrl, handleOpenResourcePicker]);
  
  const handleBrowseButtonClick = useCallback(() => {
    if (ctaUrlType === 'product' || ctaUrlType === 'collection') {
      handleOpenResourcePicker(ctaUrlType);
    }
  }, [ctaUrlType, handleOpenResourcePicker]);

  const handleSaveSettings = useCallback(async () => {
    const selectedDiscount = discountCodes.find(dc => dc.id === discountCodeId);
    const discountCode = selectedDiscount?.code || '';

    const payload: Record<string, string> = {
      enabled: enabled.toString(),
      title,
      description,
      ctaText,
      ctaUrl,
      imageUrl,
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
  }, [discountCodes, discountCodeId, enableNewsletter, backgroundColor, ctaBackgroundColor, ctaFontSize, ctaText, ctaTextColor, ctaUrl, delaySeconds, description, descriptionFontSize, enabled, imageUrl, overlayColor, placement, position, triggerType, revalidator, shopify, style, textColor, title, titleFontSize, cookieDays]);

  // Preview component
  const PopupPreview = () => {
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
      return {
        fontSize: ctaFontSize,
      };
    };

    const getTitleStyles = () => {
      if (style === 'custom') {
        return {
          fontSize: titleFontSize,
          color: textColor,
        };
      }
      return {
        fontSize: titleFontSize,
      };
    };

    const getDescriptionStyles = () => {
      if (style === 'custom') {
        return {
          fontSize: descriptionFontSize,
          color: textColor,
        };
      }
      return {
        fontSize: descriptionFontSize,
      };
    };

    return (
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Preview
        </Text>
        <div style={{
          position: 'relative',
          width: '100%',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: overlayColor,
          padding: '20px',
          minHeight: '200px',
        }}>
          <div 
            className={`urgify-popup-preview urgify-popup-preview--${style}`}
            style={getPreviewStyles()}
          >
            {imageUrl && (
              <img 
                src={imageUrl} 
                alt="Preview" 
              />
            )}
            {title && (
              <h3 style={getTitleStyles()}>
                {title}
              </h3>
            )}
            {description && (
              <p style={getDescriptionStyles()}>
                {description}
              </p>
            )}
            {ctaText && (
              <button 
                type="button"
                className="urgify-popup-cta-preview"
                style={getCtaStyles()}
                onClick={(e) => e.preventDefault()}
              >
                {ctaText}
              </button>
            )}
          </div>
        </div>
      </BlockStack>
    );
  };

  const toastMarkup = toastActive ? (
    <Toast
      content={toastMessage}
      duration={4000}
      onDismiss={() => setToastActive(false)}
    />
  ) : null;

  return (
    <Frame>
      <Page>
        <Layout>
          <div className="popup-form-wrapper">
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    PopUp Settings
                  </Text>
                  
                  <FormLayout>
                  <Checkbox
                    label="Enable PopUp"
                    checked={enabled}
                    onChange={handleEnabledChange}
                  />
                  
                  <TextField
                    label="Title"
                    value={title}
                    onChange={(value) => {
                      setTitle(value);
                      setIsDirty(true);
                    }}
                    autoComplete="off"
                  />
                  
                  <TextField
                    label="Description"
                    value={description}
                    onChange={(value) => {
                      setDescription(value);
                      setIsDirty(true);
                    }}
                    multiline={3}
                    autoComplete="off"
                  />
                  
                  <Text variant="headingSm" as="h3">
                    CTA Button or Newsletter Signup
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Choose one: a CTA button with a link <Text as="span" fontWeight="bold">or</Text> a newsletter signup form. You can't use both.
                  </Text>
                  
                  <ChoiceList
                    title="Select type"
                    choices={[
                      {
                        label: "CTA Button (Link)",
                        value: "cta",
                        helpText: "Shows a button with a configurable link",
                      },
                      {
                        label: "Newsletter Signup (Email field)",
                        value: "newsletter",
                        helpText: "Shows an email input field for newsletter subscription",
                      },
                    ]}
                    selected={enableNewsletter ? ["newsletter"] : ["cta"]}
                    onChange={(value) => {
                      const newValue = value[0] === "newsletter";
                      setEnableNewsletter(newValue);
                      setIsDirty(true);
                    }}
                  />
                  
                  {!enableNewsletter ? (
                    <BlockStack gap="300">
                      <TextField
                        label="CTA Text"
                        value={ctaText}
                        onChange={(value) => {
                          setCtaText(value);
                          setIsDirty(true);
                        }}
                        autoComplete="off"
                        helpText="Button text for the call-to-action"
                      />
                      
                      <Select
                        label="Link type"
                        options={[
                          { label: 'Collection', value: 'collection' },
                          { label: 'Product', value: 'product' },
                          { label: 'Page', value: 'page' },
                          { label: 'Blog', value: 'blog' },
                          { label: 'Blog post', value: 'article' },
                          { label: 'Policy', value: 'policy' },
                          { label: 'External link', value: 'external' },
                        ]}
                        value={ctaUrlType}
                        onChange={handleCtaUrlTypeChange}
                      />
                      {ctaUrlType === 'external' && (
                        <TextField
                          label="CTA URL"
                          value={ctaUrl}
                          onChange={(value) => {
                            setCtaUrl(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                          helpText="Enter external URL (e.g., https://example.com)"
                        />
                      )}
                      {(ctaUrlType === 'product' || ctaUrlType === 'collection') && (
                        <Button
                          onClick={handleBrowseButtonClick}
                          variant="secondary"
                          size="medium"
                        >
                          Browse {ctaUrlType === 'product' ? 'products' : 'collections'}
                        </Button>
                      )}
                    </BlockStack>
                  ) : null}
                  
                  {enableNewsletter && (
                    <Select
                      label="Discount Code"
                      options={[
                        { label: "No discount", value: "" },
                        ...discountCodes.map(dc => ({
                          label: `${dc.title} (${dc.code})`,
                          value: dc.id
                        }))
                      ]}
                      value={discountCodeId}
                      onChange={(value) => {
                        setDiscountCodeId(value);
                        setIsDirty(true);
                      }}
                      helpText="Select a discount code to show after newsletter signup"
                    />
                  )}
                  
                  <TextField
                    label="Image URL"
                    value={imageUrl}
                    onChange={(value) => {
                      setImageUrl(value);
                      setIsDirty(true);
                    }}
                    autoComplete="off"
                    helpText="URL of the image to display"
                  />
                  
                  <Select
                    label="Style"
                    options={[
                      { label: "Spectacular", value: "spectacular" },
                      { label: "Brutalist", value: "brutalist" },
                      { label: "Glassmorphism", value: "glassmorphism" },
                      { label: "Neumorphism", value: "neumorphism" },
                      { label: "Minimal", value: "minimal" },
                      { label: "Custom", value: "custom" },
                    ]}
                    value={style}
                    onChange={(value) => {
                      setStyle(value);
                      setIsDirty(true);
                    }}
                  />
                  
                  <Select
                    label="Placement"
                    options={[
                      { label: "All Pages", value: "all" },
                      { label: "Homepage Only", value: "homepage" },
                      { label: "Product Pages Only", value: "products" },
                    ]}
                    value={placement}
                    onChange={(value) => {
                      setPlacement(value);
                      setIsDirty(true);
                    }}
                  />
                  
                  <Select
                    label="Position"
                    options={[
                      { label: "Top Left", value: "top-left" },
                      { label: "Top Center", value: "top-center" },
                      { label: "Top Right", value: "top-right" },
                      { label: "Middle Left", value: "middle-left" },
                      { label: "Middle Center", value: "middle-center" },
                      { label: "Middle Right", value: "middle-right" },
                      { label: "Bottom Left", value: "bottom-left" },
                      { label: "Bottom Center", value: "bottom-center" },
                      { label: "Bottom Right", value: "bottom-right" },
                    ]}
                    value={position}
                    onChange={(value) => {
                      setPosition(value);
                      setIsDirty(true);
                    }}
                  />
                  
                  <Select
                    label="Trigger Type"
                    options={[
                      { label: "Immediate", value: "immediate" },
                      { label: "After Delay", value: "delay" },
                      { label: "Exit Intent", value: "exit_intent" },
                      { label: "Always Show", value: "always" },
                    ]}
                    value={triggerType}
                    onChange={(value) => {
                      setTriggerType(value);
                      setIsDirty(true);
                    }}
                  />
                  
                  {triggerType === 'delay' && (
                    <TextField
                      label="Delay (seconds)"
                      value={delaySeconds}
                      onChange={(value) => {
                        setDelaySeconds(value);
                        setIsDirty(true);
                      }}
                      type="number"
                      autoComplete="off"
                    />
                  )}
                  
                  <TextField
                    label="Cookie Duration (days)"
                    value={cookieDays}
                    onChange={(value) => {
                      setCookieDays(value);
                      setIsDirty(true);
                    }}
                    type="number"
                    autoComplete="off"
                    helpText="Days to hide popup after dismissal"
                  />
                  
                  {style === "custom" && (
                    <>
                      <Text variant="headingSm" as="h3">Typography</Text>
                      <InlineStack gap="400">
                        <TextField
                          label="Title Font Size"
                          value={titleFontSize}
                          onChange={(value) => {
                            setTitleFontSize(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                          helpText="e.g., 24px, 1.5rem"
                        />
                        <TextField
                          label="Description Font Size"
                          value={descriptionFontSize}
                          onChange={(value) => {
                            setDescriptionFontSize(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                        />
                        <TextField
                          label="CTA Font Size"
                          value={ctaFontSize}
                          onChange={(value) => {
                            setCtaFontSize(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                        />
                      </InlineStack>
                      
                      <Text variant="headingSm" as="h3">Colors</Text>
                      <InlineStack gap="400">
                        <TextField
                          label="Background Color"
                          value={backgroundColor}
                          onChange={(value) => {
                            setBackgroundColor(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                          helpText="e.g., #ffffff"
                        />
                        <TextField
                          label="Text Color"
                          value={textColor}
                          onChange={(value) => {
                            setTextColor(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                        />
                        <TextField
                          label="Overlay Color"
                          value={overlayColor}
                          onChange={(value) => {
                            setOverlayColor(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                          helpText="e.g., rgba(0, 0, 0, 0.5)"
                        />
                      </InlineStack>
                      <InlineStack gap="400">
                        <TextField
                          label="CTA Background Color"
                          value={ctaBackgroundColor}
                          onChange={(value) => {
                            setCtaBackgroundColor(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                        />
                        <TextField
                          label="CTA Text Color"
                          value={ctaTextColor}
                          onChange={(value) => {
                            setCtaTextColor(value);
                            setIsDirty(true);
                          }}
                          autoComplete="off"
                        />
                      </InlineStack>
                    </>
                  )}
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>
          </div>
          <div className="popup-preview-wrapper">
            <Layout.Section variant="oneHalf">
              <div className="popup-preview-sticky-container">
                <Card>
                  <PopupPreview />
                </Card>
              </div>
            </Layout.Section>
          </div>
        </Layout>
        
        {isDirty && (
          <ContextualSaveBar
            message="Unsaved changes"
            saveAction={{
              onAction: handleSaveSettings,
                loading: isSaving,
              content: 'Save',
            }}
            discardAction={{
              onAction: () => {
                setEnabled(Boolean(settings.enabled));
                setTitle(String(settings.title || ''));
                setDescription(String(settings.description || ''));
                setCtaText(String(settings.ctaText || 'Get Started'));
                setCtaUrl(String(settings.ctaUrl || '/'));
                setImageUrl(String(settings.imageUrl || ''));
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
                setIsDirty(false);
              },
              content: 'Discard',
            }}
            alignContentFlush
          />
        )}
        
      </Page>
      {toastMarkup}
    </Frame>
  );
}

