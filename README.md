# Urgify – Urgency Marketing Suite

Urgify hilft Händler:innen, echte Kaufmotivation auf ihren Shopify Stores zu erzeugen. Die App kombiniert verlässliche Lagerbestandswarnungen, konvertierende Pop-ups, Countdown-Bausteine und limitierte Angebote in einem Built-for-Shopify-konformen Paket.

## Feature-Highlights
- **Stock Alerts (Theme App Extension)**: Automatische Low-Stock-Banner inklusive Konfigurationsmetafields (`shop.metafields.urgify.*`).
- **Smart Popups & Discount Codes**: Admin-Konfiguration mit Shopify Files API & staged uploads, DSGVO-konformer Versand.
- **Countdowns & Limited Offers**: Theme-Blöcke, die Händler:innen direkt im Theme Editor platzieren können.
- **Built-for-Shopify Checks**: Session-Token-Auth (App Bridge v4), Logging, Health Check, GDPR Pipelines.
- **Observability & Web Vitals**: Core Web Vitals Tracking (optional) und strukturierte Server-Logs.

## Projektstruktur
| Pfad | Beschreibung |
|------|--------------|
| `app/` | Remix Admin UI (Polaris Web Components, Session Token Provider, API-Routen). |
| `extensions/urgify-theme/` | Theme App Extension mit JS/CSS/Blöcken für Stock Alerts & Popups. |
| `prisma/` | Prisma-Schema (`Session`, `WebhookEvent`, `DeadLetter`, `GdprRequest`). |
| `storage/gdpr/` | Export-Artefakte für DSGVO-Datenanforderungen (wird bei Bedarf erzeugt). |
| `fly.toml` & `server.js` | Fly.io Deployment-Konfiguration inklusive Health Checks & Startkommando. |

## Voraussetzungen
- Node.js >= 20 (Projekt nutzt ESM & moderne App Bridge APIs).
- Shopify Partner-Account + Shopify CLI (`npm install -g @shopify/cli`).
- Entwicklungsstore zur App-Installation.
- Optional: Fly.io CLI (`flyctl`) für Deployment.

## Umgebungsvariablen
| Variable | Zweck |
|----------|-------|
| `SHOPIFY_API_KEY` | Public App Bridge/API Key. |
| `SHOPIFY_API_SECRET` | Private App Secret (App startet ohne diesen Wert nicht). |
| `SHOPIFY_APP_URL` | Öffentliche App-URL, z. B. `https://urgify.fly.dev`. Wird automatisch normalisiert. |
| `SCOPES` | Kommagetrennte Shopify-Scopes (siehe `shopify.app.toml`). |
| `SHOP_CUSTOM_DOMAIN` | Optional: zusätzliche Shop-Domain für Embedded Routing. |
| `GDPR_STORAGE_DIR` | Optional: eigener Pfad für GDPR-Exportartefakte (Default: `./storage/gdpr`). |

> Hinweis: Lokal nutzt Prisma SQLite (`prisma/dev.sqlite`). Für Produktion empfiehlt sich eine externe Datenbank (Fly-Volume oder Managed DB).

## Lokale Entwicklung
1. Abhängigkeiten installieren: `npm install`
2. Shopify CLI authentifizieren: `shopify login --store {dev-store}`
3. App starten: `shopify app dev`
   - Die CLI erstellt einen Tunnel, setzt Umgebungsvariablen und öffnet die Installations-URL.
4. Nach Installation Theme-App-Extension aktivieren:
   - Shopify Admin → "Online Store" → "Themes" → "Customize"
   - Im Theme Editor unter **App embeds** den Eintrag **Urgify Core** aktivieren und speichern.

Während der Entwicklung werden Session Tokens in `sessionStorage` aktualisiert und in `storage/gdpr/` abgelegte GDPR-Exports sind nur lokal sichtbar.

## Billing & Managed Pricing
Urgify bietet drei Pläne im Admin Billing Flow. Das Feature-Gating ist in `app/utils/billing.ts` zentral abgelegt.

| Plan | Preis/Monat | Features |
|------|-------------|----------|
| **Basic** (`urgify_basic`) | 9,99 USD | Bis 100 Produkte, Basis-Countdowns, Stock Alerts. |
| **Pro** (`urgify_pro`) | 19,99 USD | Alle Basic-Features, unbegrenzte Produkte, erweiterte Animationen, Limited Offers. |
| **Enterprise** (`urgify_enterprise`) | 49,99 USD | Alle Pro-Features, Smart Popups, Scarcity Banner, dedizierter Support. |

> **Managed Pricing Page**: Verwalte Preise & Testphasen über die Shopify Partner Oberfläche – ersetze die Platzhalter mit deiner Organisations- und App-ID:
> `https://partners.shopify.com/<organization_id>/apps/<app_id>/pricing/managed-pricing`

## GDPR & Compliance
- Webhooks `customers/data_request`, `customers/redact`, `shop/redact` erzeugen bzw. löschen Exportartefakte unter `storage/gdpr/` und protokollieren Aktionen in der Tabelle `GdprRequest`.
- Requests werden idempotent verarbeitet (`processWebhookSafely`) und bei Fehlern in eine Dead-Letter-Queue geschrieben.
- Entferne Artefakte aus `storage/gdpr/` regelmäßig in Produktion (z. B. via Cron/Task Runner).

## Wichtige Skripte
| Befehl | Wirkung |
|--------|---------|
| `npm run dev` | Remix Dev Server via Shopify CLI (durch `shopify app dev`). |
| `npm run lint` | ESLint über den gesamten Code. |
| `npm run typecheck` | TypeScript Strict Check. |
| `npm run build` | Produktionsbuild (Remix + Assets). |
| `npm run start` | Startet den gebauten Server (wird auf Fly.io genutzt). |

## Deployment (Fly.io)
1. `fly launch` (einmalig) oder `fly deploy` für Updates.
2. Environment Variablen setzen (z. B. `fly secrets set SHOPIFY_API_SECRET=...`).
3. Prisma Migrationen laufen automatisiert über `[deploy] release_command` (`prisma migrate deploy`).
4. Health Endpoint unter `/health` liefert `200`.

## Theme App Extension testen
- Lokale Änderungen pushen: `shopify extension push`
- In der Dev-Theme-Preview prüfen (Urify stock alerts werden automatisch platziert, Popups via App-Einstellungen aktivieren).
- Debug-Logging im Theme aktiviert sich über `window.UrgifyDebug = true` oder über das App-Embed-Flag `data-debug="true"` im Theme Editor.

## Troubleshooting
- **Session Token Fehler**: Browser-Konsole prüfen; `ServerSessionTokenProvider` kann via `window.UrgifyDebug = true` zusätzliche Logs aktivieren.
- **Billing Test**: `/app/billing` aufrufen, Plan wählen, anschließend `app.billing.confirmation` prüfen.
- **Webhooks**: per `shopify app trigger webhook --topic=...` testen; Dead-Letter-Einträge stehen in `prisma.deadLetter`.
- **Fly Deploy schlägt fehl**: sicherstellen, dass `SHOPIFY_API_SECRET` und `SHOPIFY_API_KEY` als Secrets gesetzt sind und `npm install` auf Fly funktioniert.

---

Für weitere Fragen: siehe In-App-Hilfe (`/app/pricing`) oder die offiziellen [Shopify App Docs](https://shopify.dev/docs/apps).
