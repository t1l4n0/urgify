import * as React from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  Link,
  ProgressBar,
  Text,
  BlockStack,
  Toast,
} from "@shopify/polaris";
import {CheckCircleIcon} from "@shopify/polaris-icons";
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
  const statusFetcher = useFetcher<{embedActive: boolean}>();

  const [isDone, setIsDone] = React.useState<boolean | null>(null);
  const [isActivating, setIsActivating] = React.useState(false);
  const [showActivationToast, setShowActivationToast] = React.useState(false);

  // Initial status load
  React.useEffect(() => {
    statusFetcher.load("/api/quickstart-status");
  }, []);
  
  React.useEffect(() => {
    if (statusFetcher.data?.embedActive !== undefined) {
      setIsDone(statusFetcher.data.embedActive);
    }
  }, [statusFetcher.data]);

  // Auto-refresh when tab comes back (classic Shopify behavior)
  React.useEffect(() => {
    const onFocus = () => statusFetcher.load("/api/quickstart-status");
    const onVisibilityChange = () => {
      if (!document.hidden) onFocus();
    };
    
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Once completed → hide card
  if (isDone === true) return null;

  const completed = isDone ? 1 : 0;
  const total = 1;
  const progress = (completed / total) * 100;

  const handleActivate = React.useCallback(() => {
    setIsActivating(true);
    setShowActivationToast(true);
    // Open Theme Editor in new tab - both approaches are fine,
    // in the screenshot you typically open it in the admin.
    window.open(`/activate-embed?shop=${encodeURIComponent(shop)}`, "_blank", "noopener,noreferrer");
    // Disable immediately after click; user returns and card auto-refreshes.
  }, [shop]);

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
              <Box minWidth="240px">
                <ProgressBar progress={progress} size="small" />
              </Box>
            </InlineStack>
          </InlineGrid>

          <Divider />

          {/* Step-Row */}
          <InlineGrid columns={2} gap="300" alignItems="center">
            {/* Title + Description */}
            <BlockStack gap="150">
              <Text as="h3" variant="headingMd">Activate App</Text>
              <Text as="p" tone="subdued">
                Activate our app to make it visible in your store.
              </Text>
            </BlockStack>

            {/* Action right (Activate only) */}
            <Button
              variant="primary"
              onClick={handleActivate}
              disabled={isActivating}
              loading={isActivating}
            >
              Activate
            </Button>
          </InlineGrid>
        </BlockStack>
      </Card>

      {/* Activation feedback toast */}
      {showActivationToast && (
        <Toast
          content="Theme Editor opened! Complete the activation and return to click 'Refresh'."
          onDismiss={() => setShowActivationToast(false)}
        />
      )}
    </>
  );
}
