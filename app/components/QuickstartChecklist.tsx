import * as React from "react";
import {
  Box,
  Button,
  Card,
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  ProgressBar,
  Text,
  BlockStack,
  Toast,
  Banner,
} from "@shopify/polaris";
import {CheckCircleIcon, ExternalIcon} from "@shopify/polaris-icons";
import {useFetcher} from "@remix-run/react";

/**
 * Polaris-conformant Quickstart Checklist (1 Step)
 * - Fetches status from /api/quickstart-status
 * - Opens Theme Editor via /activate-embed
 * - Updates status via /api/refresh-status
 * - Shows empty circle (todo) or green checkmark (done)
 * - Hides card permanently once done
 */
interface QuickstartChecklistProps {
  shop: string;
}

export default function QuickstartChecklist({ shop }: QuickstartChecklistProps) {
  // ALL HOOKS AT THE TOP - before any early returns
  const statusFetcher = useFetcher<{embedActive: boolean}>();

  const [isDone, setIsDone] = React.useState<boolean | null>(null);
  const [isActivating, setIsActivating] = React.useState(false);
  const [showActivationToast, setShowActivationToast] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [polling, setPolling] = React.useState(false);

  // Error boundary for component errors
  const [componentError, setComponentError] = React.useState<Error | null>(null);

  // Initial status load
  React.useEffect(() => {
    statusFetcher.load(`/api/quickstart-status?shop=${encodeURIComponent(shop)}`);
  }, [shop, statusFetcher]);
  
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log("Status fetcher data:", statusFetcher.data);
      console.log("Status fetcher state:", statusFetcher.state);
    }
    
    // Defensive check: ensure data exists and embedActive is a boolean
    if (
      statusFetcher.data &&
      typeof statusFetcher.data.embedActive === "boolean"
    ) {
      if (process.env.NODE_ENV === 'development') {
        console.log("Setting isDone to:", statusFetcher.data.embedActive);
      }
      setIsDone(statusFetcher.data.embedActive);
      setHasError(false);
      // Reset activation state when status updates
      if (statusFetcher.data.embedActive) {
        setIsActivating(false);
        setShowActivationToast(false);
        setPolling(false); // Stoppe Polling wenn aktiviert
        if (process.env.NODE_ENV === 'development') {
          console.log("✅ Activation detected - stopping polling");
        }
      }
    }
  }, [statusFetcher.data, statusFetcher.state]);

  // Error handling - reset errors when data is received, but don't stop polling
  React.useEffect(() => {
    if (statusFetcher.data !== undefined) {
      setHasError(false);
    }
  }, [statusFetcher.data]);

  // Handle API errors and timeouts
  React.useEffect(() => {
    if (statusFetcher.state === "idle" && !statusFetcher.data) {
      const timeout = setTimeout(() => {
        if (!statusFetcher.data) {
          console.warn("API timeout - no data received after 5 seconds");
          setHasError(true);
        }
      }, 5000);
      
      return () => clearTimeout(timeout);
    }
  }, [statusFetcher.state, statusFetcher.data]);

  // Auto-refresh when tab comes back (classic Shopify behavior)
  React.useEffect(() => {
    const onFocus = () => statusFetcher.load(`/api/quickstart-status?shop=${encodeURIComponent(shop)}`);
    const onVisibilityChange = () => {
      if (!document.hidden) onFocus();
    };
    
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [shop, statusFetcher]);

  // Polling after activation - check status every 3 seconds until activated
  React.useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    let timeout: NodeJS.Timeout | undefined;
    
    if (polling) {
      console.log("🔄 Starting polling for activation status...");
      
      // Polling alle 3 Sekunden
      interval = setInterval(() => {
        console.log("🔄 Polling: Checking activation status...");
        statusFetcher.load(`/api/quickstart-status?shop=${encodeURIComponent(shop)}`);
      }, 3000);
      
      // Timeout nach 5 Minuten (300 Sekunden) - stoppe Polling
      timeout = setTimeout(() => {
        console.log("⏰ Polling timeout after 5 minutes - stopping");
        setPolling(false);
        setHasError(true);
      }, 300000); // 5 Minuten
    }
    
    // Stoppe das Polling NUR wenn aktiviert (isDone === true)
    // NICHT stoppen wenn isDone === false - das ist normal während Polling
    if (isDone === true) {
      if (polling) {
        console.log("✅ Stopping polling - activation detected");
        setPolling(false);
      }
      if (interval) {
        clearInterval(interval);
      }
      if (timeout) {
        clearTimeout(timeout);
      }
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [polling, isDone, shop, statusFetcher]); // hasError entfernt - Polling läuft auch bei Fehlern weiter

  // Callback hook
  const handleActivate = React.useCallback(() => {
    try {
      setIsActivating(true);
      setShowActivationToast(true);
      setHasError(false);
      setPolling(true); // Starte Polling nach Klick
      
      // Open Theme Editor in new tab - both approaches are fine,
      // in the screenshot you typically open it in the admin.
      const themeEditorUrl = `/activate-embed?shop=${encodeURIComponent(shop)}`;
      const newWindow = window.open(themeEditorUrl, "_blank", "noopener,noreferrer");
      
      // Check if popup was blocked
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        setHasError(true);
        setIsActivating(false);
        setShowActivationToast(false);
        setPolling(false); // Stoppe Polling bei Fehler
        console.error("Theme Editor popup was blocked. Please allow popups for this site.");
      }
    } catch (error) {
      console.error("Error opening Theme Editor:", error);
      setHasError(true);
      setIsActivating(false);
      setShowActivationToast(false);
      setPolling(false); // Stoppe Polling bei Fehler
    }
  }, [shop]);

  // NOW ALL EARLY RETURNS AFTER ALL HOOKS
  if (componentError) {
    return (
      <Card>
        <Banner tone="critical">
          <p>An error occurred: {componentError?.message || "Unknown error"}</p>
        </Banner>
      </Card>
    );
  }

  // Don't hide the component completely - always render it so it can react to status changes

  // Show loading state while fetching initial data or when data is not yet available
  if (isDone === null) {
    return (
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Quickstart</Text>
          <Text as="p" tone="subdued">Loading...</Text>
        </BlockStack>
      </Card>
    );
  }

  const completed = isDone ? 1 : 0;
  const total = 1;
  const progress = (completed / total) * 100;

  return (
    <>
      <Card>
        <BlockStack gap="400">
          {/* Header with title left and progress right */}
          <InlineGrid columns={2} gap="200" alignItems="center">
            <Text as="h2" variant="headingMd">Quickstart</Text>
            <InlineStack align="end" gap="200">
              <Text as="span" tone="subdued">
                {completed} of {total} tasks completed
              </Text>
              <Box minWidth="200px" maxWidth="300px">
                <ProgressBar progress={progress} size="small" />
              </Box>
            </InlineStack>
          </InlineGrid>

          <Divider />

          {/* Content based on activation status */}
          {isDone ? (
            /* Success State - App is activated */
            <InlineGrid columns={2} gap="300" alignItems="center">
              <BlockStack gap="150">
                <Text as="h3" variant="headingMd">App Successfully Activated</Text>
                <Text as="p" tone="subdued">
                  Your app is now active in your theme. You can add and configure app blocks in the Theme Editor.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  ✅ <strong>Status:</strong> App embedding is active and ready to use.
                </Text>
              </BlockStack>
              
              <InlineStack gap="200" align="center">
                <Icon source={CheckCircleIcon} tone="success" />
                <Text as="span" tone="success" variant="bodyMd">
                  Activated
                </Text>
                <Button
                  variant="tertiary"
                  onClick={() => {
                    try {
                      statusFetcher.load(`/api/quickstart-status?shop=${encodeURIComponent(shop)}`);
                    } catch (e) {
                      console.error("❌ Refresh failed:", e);
                      setComponentError(e instanceof Error ? e : new Error(String(e || "Unknown error")));
                    }
                  }}
                  loading={statusFetcher.state === "loading"}
                >
                  Refresh Status
                </Button>
              </InlineStack>
            </InlineGrid>
          ) : (
            /* Activation State - App needs to be activated */
            <InlineGrid columns={2} gap="300" alignItems="center">
              <BlockStack gap="150">
                <Text as="h3" variant="headingMd">Activate App in Theme</Text>
                <Text as="p" tone="subdued">
                  Activate our app in your theme to enable countdown timer functionality. This will open the Theme Editor where you can add and configure the app blocks.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  💡 <strong>Tip:</strong> The Theme Editor will open in a new tab. After adding the app blocks, return here to see the activation status update automatically.
                </Text>
                {polling && (
                  <Text as="p" variant="bodySm" tone="info">
                    🔄 <strong>Monitoring:</strong> Waiting for activation in Theme Editor... This will update automatically. 
                    <br />
                    <Text as="span" variant="bodySm" tone="subdued">
                      💡 <strong>Tip:</strong> Keep this tab open while activating in the Theme Editor. The status will update automatically when you activate the app.
                    </Text>
                  </Text>
                )}
              </BlockStack>

              <InlineStack gap="200" align="center">
                <Button
                  variant="primary"
                  onClick={handleActivate}
                  disabled={isActivating || polling}
                  loading={isActivating || polling}
                  icon={ExternalIcon}
                  accessibilityLabel="Activate app in Theme Editor (opens in new tab)"
                >
                  {isActivating ? "Opening Theme Editor..." : polling ? "Waiting for activation..." : "Activate in Theme"}
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() => {
                    try {
                      statusFetcher.load(`/api/quickstart-status?shop=${encodeURIComponent(shop)}`);
                    } catch (e) {
                      console.error("❌ Refresh failed:", e);
                      setComponentError(e instanceof Error ? e : new Error(String(e || "Unknown error")));
                    }
                  }}
                  loading={statusFetcher.state === "loading"}
                >
                  Refresh
                </Button>
                {polling && (
                  <Button
                    variant="tertiary"
                    onClick={() => {
                      console.log("🛑 Manual polling stop");
                      setPolling(false);
                      setIsActivating(false);
                      setShowActivationToast(false);
                    }}
                  >
                    Stop Monitoring
                  </Button>
                )}
              </InlineStack>
            </InlineGrid>
          )}
        </BlockStack>
      </Card>

      {/* Error banner */}
      {hasError && (
        <Banner
          tone="critical"
          onDismiss={() => setHasError(false)}
        >
          <p>
            {isActivating 
              ? "Theme Editor popup was blocked. Please allow popups for this site and try again."
              : "Unable to load app status. Please refresh the page to try again."
            }
          </p>
        </Banner>
      )}

      {/* Activation feedback toast */}
      {showActivationToast && (
        <Toast
          content="Theme Editor opened! Add the app blocks to your theme and return here to see the status update automatically."
          onDismiss={() => setShowActivationToast(false)}
        />
      )}
    </>
  );
}
