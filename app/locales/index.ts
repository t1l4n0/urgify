import enPolaris from "@shopify/polaris/locales/en.json";
import dePolaris from "@shopify/polaris/locales/de.json";
import en from "./en.json";
import de from "./de.json";

export const POLARIS_LOCALES = {
  en: enPolaris,
  de: dePolaris,
};

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
