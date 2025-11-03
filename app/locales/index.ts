import en from "./en.json";
import de from "./de.json";

// Polaris Web Components don't require locale files anymore
// The components automatically use the browser's locale

export const APP_LOCALES = {
  en,
  de,
};

export type SupportedLocale = keyof typeof APP_LOCALES;

export function getLocale(request: Request): SupportedLocale {
  const header = request.headers.get("Accept-Language") || "";
  const lang = header.split(",")[0]?.toLowerCase() || "en";
  return lang.startsWith("de") ? "de" : "en";
}
