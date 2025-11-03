import { useEffect, useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, useLoaderData, useRouteError, useRouteLoaderData } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { authenticate } from "../shopify.server";

interface WebVitalsMetric {
  id: string;
  name: string;
  value: number;
}

interface WebVitalsReport {
  metrics: WebVitalsMetric[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  return json({});
};

export default function Metrics() {
  const [metrics, setMetrics] = useState<WebVitalsMetric[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebugInfo = useCallback((message: string) => {
    console.log(`[Web Vitals Debug] ${message}`);
    setDebugInfo(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  useEffect(() => {
    // Wait for App Bridge to be available
    const initWebVitals = async () => {
      try {
        addDebugInfo("Starte Web Vitals Initialisierung...");
        
        // Wait for shopify object to be available
        let attempts = 0;
        const maxAttempts = 100; // Increased from 50
        
        addDebugInfo(`Warte auf window.shopify (max ${maxAttempts} Versuche)...`);
        
        // First wait for window.shopify to exist
        while (!(window as any).shopify && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (!(window as any).shopify) {
          addDebugInfo("window.shopify nicht gefunden");
          setError("App Bridge nicht verfügbar. Stelle sicher, dass die App im Shopify Admin eingebettet ist.");
          return;
        }

        addDebugInfo("window.shopify gefunden");

        const shopify = (window as any).shopify;
        
        // Log what properties are available
        addDebugInfo(`shopify Objekt hat folgende Eigenschaften: ${Object.keys(shopify).join(", ")}`);
        
        // Wait for webVitals specifically
        attempts = 0;
        while (!shopify?.webVitals && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (!shopify?.webVitals) {
          addDebugInfo("shopify.webVitals nicht verfügbar");
          addDebugInfo(`Verfügbare shopify Methoden: ${Object.keys(shopify).filter(k => typeof shopify[k] === 'function').join(", ")}`);
          setError("Web Vitals API nicht verfügbar. Stelle sicher, dass die App im Shopify Admin eingebettet ist.");
          return;
        }

        addDebugInfo("shopify.webVitals gefunden");

        // Register callback for Web Vitals reports
        const callback = async (report: WebVitalsReport) => {
          addDebugInfo(`Web Vitals Report empfangen: ${report.metrics?.length || 0} Metriken`);
          console.log("Web Vitals Report received:", report);
          console.log("Report structure:", JSON.stringify(report, null, 2));
          
          if (report.metrics && Array.isArray(report.metrics)) {
            console.log("First metric structure:", report.metrics[0]);
            setMetrics(prev => {
              // Merge new metrics with existing ones, keeping unique IDs
              const existingIds = new Set(prev.map(m => m.id));
              const newMetrics = report.metrics.filter(m => !existingIds.has(m.id));
              addDebugInfo(`${newMetrics.length} neue Metriken hinzugefügt`);
              console.log("New metrics to add:", newMetrics);
              const updated = [...prev, ...newMetrics].slice(-100);
              console.log("Updated metrics state:", updated);
              return updated;
            });
          } else {
            addDebugInfo("Report hat keine Metriken oder Metriken sind kein Array");
            console.error("Invalid report structure:", report);
          }
        };

        addDebugInfo("Registriere Web Vitals Callback...");
        await shopify.webVitals.onReport(callback);
        setIsListening(true);
        addDebugInfo("Web Vitals Callback erfolgreich registriert");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addDebugInfo(`Fehler: ${errorMessage}`);
        console.error("Failed to initialize Web Vitals:", err);
        setError(`Fehler beim Initialisieren der Web Vitals API: ${errorMessage}`);
      }
    };

    initWebVitals();
  }, [addDebugInfo]);

  // Format metric name for display
  const formatMetricName = (name: string): string => {
    const nameMap: Record<string, string> = {
      "LCP": "Largest Contentful Paint",
      "FID": "First Input Delay",
      "CLS": "Cumulative Layout Shift",
      "FCP": "First Contentful Paint",
      "TTFB": "Time to First Byte",
      "INP": "Interaction to Next Paint",
    };
    return nameMap[name] || name;
  };

  // Get metric threshold color
  const getMetricColor = (name: string, value: number): string => {
    // Based on Core Web Vitals thresholds
    if (name === "LCP") {
      return value <= 2500 ? "success" : value <= 4000 ? "warning" : "critical";
    }
    if (name === "FID") {
      return value <= 100 ? "success" : value <= 300 ? "warning" : "critical";
    }
    if (name === "INP") {
      return value <= 200 ? "success" : value <= 500 ? "warning" : "critical";
    }
    if (name === "CLS") {
      return value <= 0.1 ? "success" : value <= 0.25 ? "warning" : "critical";
    }
    if (name === "FCP") {
      return value <= 1800 ? "success" : value <= 3000 ? "warning" : "critical";
    }
    if (name === "TTFB") {
      return value <= 800 ? "success" : value <= 1800 ? "warning" : "critical";
    }
    return "base";
  };

  // Format metric value with unit
  const formatMetricValue = (name: string, value: number): string => {
    if (name === "CLS") {
      return value.toFixed(3);
    }
    if (name === "FID" || name === "INP" || name === "LCP" || name === "FCP" || name === "TTFB") {
      return `${Math.round(value)} ms`;
    }
    return value.toString();
  };

  // Group metrics by name and calculate averages
  const groupedMetrics = metrics.reduce((acc, metric) => {
    // Handle potential missing name field
    const name = metric?.name;
    if (!name) {
      console.warn("Metric without name:", metric);
      return acc;
    }
    if (!acc[name]) {
      acc[name] = [];
    }
    acc[name].push(metric);
    return acc;
  }, {} as Record<string, WebVitalsMetric[]>);

  const metricSummaries = Object.entries(groupedMetrics).map(([name, values]) => {
    const avgValue = values.reduce((sum, m) => sum + m.value, 0) / values.length;
    const latestValue = values[values.length - 1].value;
    return {
      name,
      latestValue,
      avgValue,
      count: values.length,
      color: getMetricColor(name, latestValue),
    };
  });

  // Debug: Log metrics state
  useEffect(() => {
    if (metrics.length > 0) {
      console.log("=== METRICS DEBUG ===");
      console.log("Current metrics in state:", metrics);
      console.log("First metric:", metrics[0]);
      console.log("First metric keys:", metrics[0] ? Object.keys(metrics[0]) : "no metrics");
      
      const grouped = metrics.reduce((acc, metric) => {
        const name = metric?.name || "unknown";
        if (!acc[name]) {
          acc[name] = [];
        }
        acc[name].push(metric);
        return acc;
      }, {} as Record<string, WebVitalsMetric[]>);
      
      console.log("Grouped metrics:", grouped);
      console.log("Grouped keys:", Object.keys(grouped));
      console.log("Total metrics:", metrics.length);
      console.log("====================");
    }
  }, [metrics]);

  return (
    <s-page heading="Web Vitals Performance Metrics">
      <s-section>
        {error && (
          <s-banner tone="critical" heading="Fehler">
            <s-paragraph>{error}</s-paragraph>
          </s-banner>
        )}

        {!isListening && !error && (
          <s-banner tone="info" heading="Initialisierung">
            <s-paragraph>Warte auf Web Vitals API...</s-paragraph>
          </s-banner>
        )}

        {isListening && (
          <s-banner tone="success" heading="Aktiv">
            <s-paragraph>
              Web Vitals API ist aktiv und sammelt Metriken. Navigiere durch die App (z.B. zu anderen Seiten oder aktualisiere die Seite), um Web Vitals Metriken zu generieren.
            </s-paragraph>
            <s-paragraph tone="subdued" size="small" style={{ marginTop: "0.5rem" }}>
              <strong>Hinweis:</strong> Metriken werden nur beim Laden neuer Seiten oder bei Interaktionen gesammelt. Wenn du bereits auf dieser Seite bist, aktualisiere die Seite oder navigiere zu einer anderen Seite und zurück.
            </s-paragraph>
          </s-banner>
        )}

        <s-stack gap="base" style={{ marginTop: "1rem" }}>
          <s-button
            variant="secondary"
            onClick={() => {
              const shopify = (window as any).shopify;
              if (shopify) {
                addDebugInfo(`window.shopify verfügbar: ${Object.keys(shopify).join(", ")}`);
                if (shopify.webVitals) {
                  addDebugInfo("shopify.webVitals verfügbar");
                } else {
                  addDebugInfo("shopify.webVitals NICHT verfügbar");
                }
              } else {
                addDebugInfo("window.shopify NICHT verfügbar");
              }
            }}
          >
            Debug Info aktualisieren
          </s-button>

          {debugInfo.length > 0 && (
            <details style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "0.5rem" }}>
                Debug-Logs ({debugInfo.length})
              </summary>
              <pre
                style={{
                  background: "#f5f5f5",
                  padding: "1rem",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  maxHeight: "300px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {debugInfo.join("\n")}
              </pre>
            </details>
          )}
        </s-stack>
      </s-section>

      {metrics.length > 0 && (
        <s-section heading="Metriken-Übersicht">
          <s-paragraph tone="subdued" style={{ marginBottom: "1rem" }}>
            {metrics.length} Metrik(en) gesammelt. {metricSummaries.length} verschiedene Metriken.
          </s-paragraph>
          
          {metricSummaries.length > 0 ? (
            <s-stack gap="base">
              <s-table>
                <thead>
                <tr>
                  <th>Metrik</th>
                  <th>Letzter Wert</th>
                  <th>Durchschnitt</th>
                  <th>Anzahl</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {metricSummaries
                  .sort((a, b) => {
                    // Sort Core Web Vitals first
                    const coreWebVitals = ["LCP", "FID", "CLS", "INP"];
                    const aIsCore = coreWebVitals.includes(a.name);
                    const bIsCore = coreWebVitals.includes(b.name);
                    if (aIsCore && !bIsCore) return -1;
                    if (!aIsCore && bIsCore) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((summary) => (
                    <tr key={summary.name}>
                      <td>
                        <strong>{formatMetricName(summary.name)}</strong>
                        <br />
                        <s-text tone="subdued" size="small">
                          {summary.name}
                        </s-text>
                      </td>
                      <td>
                        <s-text emphasis="strong">
                          {formatMetricValue(summary.name, summary.latestValue)}
                        </s-text>
                      </td>
                      <td>
                        <s-text tone="subdued">
                          {formatMetricValue(summary.name, summary.avgValue)}
                        </s-text>
                      </td>
                      <td>{summary.count}</td>
                      <td>
                        <s-badge tone={summary.color as any}>
                          {summary.color === "success" ? "✓ Gut" : 
                           summary.color === "warning" ? "⚠ Verbesserung" : 
                           "✗ Kritisch"}
                        </s-badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </s-table>
            </s-stack>
          ) : (
            <s-stack gap="base">
              <s-banner tone="warning" heading="Warnung">
                <s-paragraph>
                  Metriken wurden empfangen, aber konnten nicht gruppiert werden. Hier sind die Rohdaten:
                </s-paragraph>
              </s-banner>
              <s-table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Wert</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric, index) => (
                    <tr key={metric.id || index}>
                      <td>
                        <s-text tone="subdued" size="small">
                          {metric.id ? metric.id.slice(0, 12) + "..." : "N/A"}
                        </s-text>
                      </td>
                      <td>
                        <strong>{metric.name || "Unbekannt"}</strong>
                      </td>
                      <td>
                        <s-text emphasis="strong">
                          {typeof metric.value === 'number' 
                            ? metric.name === 'CLS' 
                              ? metric.value.toFixed(3)
                              : `${Math.round(metric.value)} ms`
                            : String(metric.value)}
                        </s-text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </s-table>
              <details style={{ marginTop: "1rem" }}>
                <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Vollständige JSON-Rohdaten anzeigen</summary>
                <pre style={{ background: "#f5f5f5", padding: "0.5rem", marginTop: "0.5rem", fontSize: "0.75rem", overflow: "auto", maxHeight: "400px" }}>
                  {JSON.stringify(metrics, null, 2)}
                </pre>
              </details>
            </s-stack>
          )}
        </s-section>
      )}

      {metrics.length > 0 && (
        <s-section heading="Detaillierte Metriken">
          <s-stack gap="base">
            <s-paragraph tone="subdued">
              {metrics.length} Metrik(en) gesammelt. Die neuesten werden zuerst angezeigt.
            </s-paragraph>
            <s-table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Metrik</th>
                  <th>Wert</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {[...metrics].reverse().slice(0, 50).map((metric, index) => (
                  <tr key={`${metric.id}-${index}`}>
                    <td>
                      <s-text tone="subdued" size="small">
                        {new Date(Date.now() - (metrics.length - index - 1) * 1000).toLocaleTimeString()}
                      </s-text>
                    </td>
                    <td>
                      <strong>{formatMetricName(metric.name)}</strong>
                      <br />
                      <s-text tone="subdued" size="small">
                        {metric.name}
                      </s-text>
                    </td>
                    <td>
                      <s-text
                        emphasis="strong"
                        tone={getMetricColor(metric.name, metric.value) as any}
                      >
                        {formatMetricValue(metric.name, metric.value)}
                      </s-text>
                    </td>
                    <td>
                      <s-text tone="subdued" size="small">
                        {metric.id.slice(0, 8)}...
                      </s-text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </s-table>
          </s-stack>
        </s-section>
      )}

      {metrics.length === 0 && isListening && (
        <s-section>
          <s-stack gap="base" alignItems="center">
            <s-paragraph tone="subdued">
              Noch keine Metriken gesammelt. Navigiere durch die App, um Web Vitals Metriken zu generieren.
            </s-paragraph>
          </s-stack>
        </s-section>
      )}

      <s-section heading="Informationen">
        <s-stack gap="base">
          <s-paragraph>
            Die Web Vitals API ermöglicht es, Performance-Metriken deiner App direkt über App Bridge zu überwachen.
            Diese Seite zeigt Core Web Vitals und weitere Performance-Metriken in Echtzeit.
          </s-paragraph>
          <s-ordered-list>
            <s-ordered-list-item>
              <s-paragraph>
                <strong>LCP (Largest Contentful Paint):</strong> Misst die Ladegeschwindigkeit. Ziel: ≤ 2.5s
              </s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph>
                <strong>FID (First Input Delay):</strong> Misst die Interaktivität. Ziel: ≤ 100ms
              </s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph>
                <strong>CLS (Cumulative Layout Shift):</strong> Misst die visuelle Stabilität. Ziel: ≤ 0.1
              </s-paragraph>
            </s-ordered-list-item>
            <s-ordered-list-item>
              <s-paragraph>
                <strong>INP (Interaction to Next Paint):</strong> Ersetzt FID als neue Core Web Vital. Ziel: ≤ 200ms
              </s-paragraph>
            </s-ordered-list-item>
          </s-ordered-list>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = boundary.headers;

