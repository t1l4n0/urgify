import { RemixBrowser } from "@remix-run/react";
import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { trackCoreWebVitals } from "./utils/performance";

// Track Core Web Vitals (client-side only)
trackCoreWebVitals();

startTransition(() => {
  hydrateRoot(document, <RemixBrowser />);
});

