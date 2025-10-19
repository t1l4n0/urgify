# Session Token Authentication Implementation

Diese Dokumentation beschreibt die Implementierung der neuesten App Bridge Version und Session Token Authentifizierung in der Urgify Shopify App.

## Übersicht

Die App wurde aktualisiert, um die neueste Version von Shopify App Bridge (v4.2.3) und Session Token Authentifizierung zu verwenden. Dies entspricht den "Built for Shopify"-Standards und bietet eine sichere, moderne Authentifizierung.

## Implementierte Features

### 1. App Bridge v4 Integration
- **Version**: @shopify/app-bridge-react v4.2.3
- **Konfiguration**: Optimiert für embedded apps mit Session Token Authentifizierung
- **Features**: Navigation, TitleBar, und sichere API-Kommunikation

### 2. Session Token Authentifizierung
- **API Endpoints**: 
  - `/api/session-token` - Session Token bereitstellen
  - `/api/authenticated-fetch` - Authentifizierte API-Aufrufe
  - `/api/graphql` - Authentifizierte GraphQL-Anfragen
- **Frontend Utilities**: 
  - `SessionTokenProvider` - React Context für Session Token
  - `authenticatedFetch` - Utility für sichere API-Aufrufe
  - `sessionToken.ts` - Backend Utilities

### 3. Sicherheitsfeatures
- **Token Validation**: Automatische Validierung von Session Tokens
- **Error Handling**: Robuste Fehlerbehandlung für Authentifizierungsfehler
- **Rate Limiting**: Integration mit bestehenden Rate Limiting Utilities
- **CORS Protection**: Sichere Cross-Origin Requests

## Verwendung

### Frontend - Session Token verwenden

```tsx
import { useSessionToken } from '../components/SessionTokenProvider';
import { authenticatedFetch } from '../utils/authenticatedFetch';

function MyComponent() {
  const { sessionToken, isLoading, error } = useSessionToken();

  const handleApiCall = async () => {
    try {
      const response = await authenticatedFetch('/api/my-endpoint');
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error('API call failed:', error);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <button onClick={handleApiCall}>
      Make API Call
    </button>
  );
}
```

### Backend - Session Token validieren

```typescript
import { validateSessionToken } from '../utils/sessionToken';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const sessionToken = validateSessionToken(request);
  if (!sessionToken) {
    return json({ error: "Session token required" }, { status: 401 });
  }
  
  // Authentifizierte Logik hier
};
```

## API Endpoints

### GET /api/session-token
Gibt aktuelle Session Token Informationen zurück.

**Response:**
```json
{
  "sessionToken": "eyJ...",
  "shop": "example.myshopify.com",
  "isOnline": true
}
```

### POST /api/authenticated-fetch
Macht authentifizierte API-Aufrufe.

**Request:**
```json
{
  "url": "https://api.example.com/endpoint",
  "method": "GET",
  "body": {}
}
```

### POST /api/graphql
Führt authentifizierte GraphQL-Anfragen aus.

**Request:**
```json
{
  "query": "query { shop { name } }",
  "variables": {}
}
```

## Konfiguration

### App Bridge Konfiguration
```tsx
<AppProvider 
  isEmbeddedApp 
  apiKey={apiKey}
  shop={shop}
  forceRedirect={true}
>
  <SessionTokenProvider>
    {/* App Content */}
  </SessionTokenProvider>
</AppProvider>
```

### Session Token Provider
```tsx
<SessionTokenProvider>
  {/* Components that need session token access */}
</SessionTokenProvider>
```

## Sicherheitshinweise

1. **Token Storage**: Session Tokens werden sicher in Session Storage gespeichert
2. **Automatic Refresh**: Tokens werden automatisch erneuert wenn nötig
3. **Error Handling**: Robuste Fehlerbehandlung für Authentifizierungsfehler
4. **Rate Limiting**: Integration mit bestehenden Rate Limiting Mechanismen

## Testing

Die Implementierung kann mit der `AuthenticatedApiExample` Komponente getestet werden, die auf der Hauptseite der App verfügbar ist. Diese Komponente demonstriert:

- Session Token Status
- API-Aufrufe mit Session Token
- GraphQL-Anfragen mit Session Token
- Fehlerbehandlung

## Migration von älteren Versionen

Diese Implementierung ist vollständig rückwärtskompatibel. Bestehende API-Aufrufe funktionieren weiterhin, aber neue Features sollten die Session Token Authentifizierung verwenden.

## Troubleshooting

### Session Token nicht verfügbar
- Überprüfen Sie, ob die App in einem embedded Kontext läuft
- Stellen Sie sicher, dass App Bridge korrekt initialisiert ist
- Überprüfen Sie die Browser-Konsole auf Fehler

### API-Aufrufe schlagen fehl
- Überprüfen Sie, ob der Session Token gültig ist
- Stellen Sie sicher, dass die API-Endpunkte korrekt konfiguriert sind
- Überprüfen Sie die Rate Limiting Einstellungen

## Weitere Informationen

- [Shopify App Bridge Documentation](https://shopify.dev/docs/apps/tools/app-bridge)
- [Session Token Authentication](https://shopify.dev/docs/apps/auth/session-tokens)
- [Built for Shopify Standards](https://shopify.dev/docs/apps/store/built-for-shopify)
