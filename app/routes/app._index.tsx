import { useRouteLoaderData, useActionData, useRouteError, isRouteErrorResponse, useLoaderData, useLocation } from "@remix-run/react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { toMessage } from "../lib/errors";
import { Suspense, lazy, useState, useEffect } from "react";
import { ViewPlansLink } from "../components/ViewPlansLink";
import { authenticate } from "../shopify.server";

// App embedding is managed through the Theme Editor, not programmatically
export const action = async ({ request }: ActionFunctionArgs) => {
  return json({ success: false, error: "App embedding must be enabled manually through the Theme Editor" });
};

// Safe loader that never throws
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") ?? undefined;
    
    // Sync subscription status to metafield for Liquid templates
    try {
      const { admin } = await authenticate.admin(request);

      // Get shop ID for metafield sync
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
        const syncResult = await syncSubscriptionStatusToMetafield(admin, shopId);
        console.log("Metafield sync in app._index:", syncResult);
      }
    } catch (syncError) {
      console.error("Failed to sync subscription status in app._index:", syncError);
      // Continue with normal flow even if sync fails
    }
    
    return json({ shop }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("app._index loader failed", err);
    return json({ shop: undefined }, { headers: { "Cache-Control": "no-store" } });
  }
}

// Zeig Fehler im UI statt "Unexpected Server Error"
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Route error in app._index:", error);

  let title = "Error";
  let message = "Unknown error";
  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    try {
      message = typeof error.data === "string" ? error.data : JSON.stringify(error.data);
    } catch {
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = toMessage(error);
  } else if (typeof error === "string") {
    message = error;
  }

  return (
    <s-page heading={title}>
      <s-section>
        <s-banner tone="critical" heading="Error">
          <s-paragraph>An error occurred: {message}</s-paragraph>
        </s-banner>
      </s-section>
    </s-page>
  );
}

export default function Index() {
  const { shop: shopDomain } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const data = useRouteLoaderData("routes/app") as any;
  const hasActiveSub = Boolean(data?.hasActiveSub);
  const actionData = useActionData<typeof action>();
  const apiKey = data?.apiKey || "";
  const themeEditorUrl = buildThemeEditorUrl(search, shopDomain, apiKey);

  return (
    <s-page heading="Urgify – Urgency Marketing Suite">
      <s-banner
        heading={hasActiveSub ? 'Subscription active' : 'No active subscription'}
        tone={hasActiveSub ? 'success' : 'warning'}
      >
        <s-paragraph>
          {hasActiveSub
            ? 'You can use all app features: countdown timers, limited-time offers, smart stock alerts, scarcity banners, smart popups, and complete customization options.'
            : 'A subscription is required to use all features.'}
        </s-paragraph>
        {!hasActiveSub && (
          <div style={{ marginTop: '12px' }}>
            <ViewPlansLink />
          </div>
        )}
      </s-banner>

      {/* Success/Error Messages */}
      {actionData?.error && (
        <s-section>
          <s-banner tone="critical" heading="Error">
            <s-paragraph>{toMessage(actionData.error)}</s-paragraph>
          </s-banner>
        </s-section>
      )}
      
      {actionData?.success && (
        <s-section>
          <s-banner tone="success" heading="Success">
            <s-paragraph>Operation completed successfully</s-paragraph>
          </s-banner>
        </s-section>
      )}

      <VideosSection />

      <s-section heading="Welcome to Urgify">
        <s-stack gap="base">
          <s-paragraph>
            Urgify provides urgency marketing tools for Shopify stores. 
            Add countdown timers, limited-time offers, stock alerts, scarcity banners, and smart popups to your product pages.
          </s-paragraph>

          <Suspense fallback={<div aria-busy="true">Loading features…</div>}>
            {(() => {
              const LazyFeatures = lazy(() => import("../components/Features"));
              return <LazyFeatures />;
            })()}
          </Suspense>
        </s-stack>
      </s-section>

      <s-section heading="Setup guide">
        <s-stack gap="base">
          <s-paragraph>
            Follow these simple steps to get started with Urgify.
          </s-paragraph>
          
          <s-paragraph>
            <strong>Step 1: Enable Urgify Core</strong><br />
            Go to <strong>Online Store → Themes</strong>, click <strong>"Customize"</strong> on your active theme, find <strong>"App embeds"</strong> in the sidebar, enable <strong>"Urgify"</strong>, and click <strong>"Save"</strong>.
          </s-paragraph>

          <s-paragraph>
            <strong>Step 2: Configure Stock Alerts</strong><br />
            Go to <strong>Stock Alerts</strong> in the Urgify app menu. Set your inventory threshold and customize the alert messages. Stock alerts will automatically appear on product pages when inventory falls below your threshold.
          </s-paragraph>

          <s-paragraph>
            <strong>Step 3: Set Up PopUps</strong><br />
            Navigate to <strong>PopUps</strong> in the app menu. Create eye-catching popups with customizable triggers (time delay, exit intent, or manual). Configure your message, colors, and positioning.
          </s-paragraph>

          <s-paragraph>
            <strong>Step 4: Add Blocks to Your Theme</strong><br />
            In the Theme Editor, add Urgify blocks to your product pages: <strong>Countdown</strong> for time-limited offers, <strong>Limited Offer</strong> for special deals, or <strong>Scarcity Banner</strong> for inventory warnings. Drag and drop them where you want them to appear.
          </s-paragraph>

          <s-paragraph>
            <strong>Step 5: Customize & Publish</strong><br />
            Customize each block's settings, choose from multiple styles, and adjust colors to match your brand. Preview your changes, then click <strong>"Publish"</strong> to make them live.
          </s-paragraph>
          
          {hasActiveSub && (
            <s-button
              variant="primary"
              href={themeEditorUrl}
              target="_top"
              accessibilityLabel="Open the Shopify Theme Editor and activate Urgify app embed"
            >
              Activate Urgify
            </s-button>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Enjoying Urgify?">
        <s-stack gap="base" alignItems="center">
          <s-paragraph>
            If Urgify helps you create effective urgency experiences, please consider leaving a review.
          </s-paragraph>
          <s-button 
            variant="primary" 
            tone="success"
            accessibilityLabel="Leave a review for Urgify"
            onClick={() => {
              // Shopify App Bridge v4 Review API, fails gracefully if unavailable
              if (typeof window !== 'undefined' && (window as any).shopify?.reviews?.request) {
                (window as any).shopify.reviews.request().catch(() => {});
              }
            }}
          >
            ⭐ Leave a Review
          </s-button>
          <s-paragraph tone="subdued" color="subdued">
            Your feedback helps other merchants discover Urgify
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function b64UrlDecode(input: string) {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  return atob(s + "=".repeat(pad));
}

function buildThemeEditorUrl(search: string, shop?: string | null, apiKey?: string) {
  const params = new URLSearchParams(search);
  const host = params.get("host");
  const shopParam = params.get("shop");
  const EMBED_HANDLE = "app-embed";
  
  // Build activateAppId parameter if API key is available
  const activateAppIdParam = apiKey 
    ? `&activateAppId=${encodeURIComponent(`${apiKey}/${EMBED_HANDLE}`)}`
    : "";

  // Use host parameter if available (preferred method for embedded apps)
  if (host && shopParam) {
    try {
      const decoded = b64UrlDecode(host);
      
      // One Admin?
      const mOne = decoded.match(/admin\.shopify\.com\/store\/([^/?#]+)/);
      if (mOne) {
        const storeSegment = mOne[1]; // e.g. "12345678"
        return `https://admin.shopify.com/store/${storeSegment}/themes/current/editor?context=apps${activateAppIdParam}`;
      }

      // Legacy Admin?
      const mLegacy = decoded.match(/([a-zA-Z0-9-]+\.myshopify\.com)\/admin/);
      if (mLegacy) {
        const shopDomain = mLegacy[1];
        return `https://${shopDomain}/admin/themes/current/editor?context=apps${activateAppIdParam}`;
      }
    } catch (error) {
      console.error("Failed to decode host parameter:", error);
    }
  }

  // Fallback: use shop parameter
  if (shopParam) {
    const storeHandle = shopParam.replace(".myshopify.com", "");
    return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/current/editor?context=apps${activateAppIdParam}`;
  }

  // Final fallback
  if (shop) {
    const storeHandle = shop.replace(".myshopify.com", "");
    return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/current/editor?context=apps${activateAppIdParam}`;
  }

  return `https://admin.shopify.com/themes/current/editor?context=apps${activateAppIdParam}`;
}

function VideosSection() {
  const [openModal, setOpenModal] = useState<{ videoId: string; videoTitle: string } | null>(null);

  const videos = [
    {
      heading: "What is Urgify?",
      description: "A short overview of what Urgify offers and how it helps you create urgency marketing for your Shopify store.",
      videoId: "2Rol9WuUmX8",
      videoTitle: "Urgify App Overview",
    },
    {
      heading: "How it works",
      description: "See how to set up Urgify and create urgency marketing elements for your Shopify store.",
      videoId: "9366yFNZvjY",
      videoTitle: "Urgify Setup Tutorial",
    },
  ];

  return (
    <>
      <s-section heading="Videos">
        <s-stack gap="base">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px',
              width: '100%',
            }}
          >
            {videos.map((video) => (
              <VideoThumbnail
                key={video.videoId}
                heading={video.heading}
                description={video.description}
                videoId={video.videoId}
                videoTitle={video.videoTitle}
                onOpen={() => setOpenModal({ videoId: video.videoId, videoTitle: video.videoTitle })}
              />
            ))}
          </div>
        </s-stack>
      </s-section>

      {openModal && (
        <VideoModal
          videoId={openModal.videoId}
          videoTitle={openModal.videoTitle}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}

interface VideoThumbnailProps {
  heading: string;
  description: string;
  videoId: string;
  videoTitle: string;
  onOpen: () => void;
}

function VideoThumbnail({ heading, description, videoId, videoTitle, onOpen }: VideoThumbnailProps) {
  const [isHovered, setIsHovered] = useState(false);
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: isHovered ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        backgroundColor: '#fff',
      }}
      onClick={onOpen}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <img
          src={thumbnailUrl}
          alt={videoTitle}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: isHovered ? 'translate(-50%, -50%) scale(1.1)' : 'translate(-50%, -50%)',
            width: '48px',
            height: '36px',
            backgroundColor: isHovered ? 'rgba(220, 38, 38, 0.9)' : 'rgba(23, 35, 34, 0.9)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s, transform 0.2s',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="white"
            style={{ marginLeft: '2px' }}
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <div style={{ padding: '16px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>{heading}</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#6B7280', lineHeight: '1.5' }}>
          {description}
        </p>
        <s-button
          variant="primary"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Watch video
        </s-button>
      </div>
    </div>
  );
}

interface VideoModalProps {
  videoId: string;
  videoTitle: string;
  onClose: () => void;
}

function VideoModal({ videoId, videoTitle, onClose }: VideoModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          backgroundColor: '#000',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 10001,
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            lineHeight: '1',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
          }}
          aria-label="Close video"
        >
          ×
        </button>
        <div
          style={{
            position: 'relative',
            paddingBottom: '56.25%',
            height: 0,
            overflow: 'hidden',
          }}
        >
          <iframe
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            title={videoTitle}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}
