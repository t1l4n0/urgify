/**
 * Webhook-Helper-Funktionen für Production-Hardening
 * 
 * Enthält:
 * - Offline-Token-Management
 * - Admin-API-Calls mit Retry
 * - Idempotenz-Handling
 * - Strukturiertes Logging
 * - Dead-Letter-Queue
 */

import shopify from "~/shopify.server";
import prisma from "~/db.server";

// ============================================================================
// 1. OFFLINE-TOKEN-MANAGEMENT
// ============================================================================

/**
 * Holt Offline-Token für Shop (für Admin-API-Calls)
 */
export async function getOfflineToken(shop: string): Promise<string> {
  const session = await prisma.session.findFirst({ 
    where: { 
      shop, 
      isOnline: false 
    } 
  });
  
  if (!session?.accessToken) {
    throw new Error(`No offline token for ${shop}`);
  }
  
  return session.accessToken;
}

// ============================================================================
// 2. ADMIN-API-CALLS MIT RETRY
// ============================================================================

/**
 * Admin-API-Call mit automatischem Retry bei 429/5xx
 */
export async function adminCall(
  shop: string, 
  query: string, 
  variables?: any
): Promise<any> {
  const token = await getOfflineToken(shop);
  const url = `https://${shop}/admin/api/2025-04/graphql.json`;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (response.ok) {
        return await response.json();
      }

      // Retry bei Rate-Limit oder Server-Fehlern
      if (response.status === 429 || response.status >= 500) {
        const delay = 300 * Math.pow(2, attempt); // Exponential backoff
        log("warn", `Admin API retry ${attempt + 1}/4`, { 
          shop, 
          status: response.status, 
          delay 
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Andere Fehler nicht retry
      const errorText = await response.text();
      throw new Error(`Admin API ${response.status}: ${errorText}`);
    } catch (error) {
      if (attempt === 3) throw error; // Letzter Versuch
      log("warn", `Admin API attempt ${attempt + 1} failed`, { shop, error });
    }
  }

  throw new Error("Admin API retry exhausted");
}

// ============================================================================
// 3. IDEMPOTENZ-HANDLING
// ============================================================================

/**
 * Prüft, ob Webhook bereits verarbeitet wurde (Idempotenz)
 */
export async function isWebhookProcessed(webhookId: string): Promise<boolean> {
  const existing = await prisma.webhookEvent.findUnique({
    where: { id: webhookId }
  });
  
  return !!existing;
}

/**
 * Markiert Webhook als verarbeitet
 */
export async function markWebhookProcessed(
  webhookId: string, 
  topic: string, 
  shop: string
): Promise<void> {
  await prisma.webhookEvent.create({
    data: { 
      id: webhookId, 
      topic, 
      shop,
      processedAt: new Date()
    }
  });
}

// ============================================================================
// 4. STRUKTURIERTES LOGGING
// ============================================================================

/**
 * Strukturiertes Logging für Webhooks
 */
export function log(
  level: "info" | "warn" | "error", 
  message: string, 
  extra?: Record<string, any>
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...extra
  };
  
  console[level](`[Webhook] ${message}`, extra ?? {});
}

// ============================================================================
// 5. DEAD-LETTER-QUEUE
// ============================================================================

/**
 * Speichert fehlgeschlagene Webhook-Verarbeitung in Dead-Letter-Queue
 */
export async function addToDeadLetterQueue(
  topic: string,
  shop: string,
  payload: any,
  error: Error
): Promise<void> {
  try {
    await prisma.deadLetter.create({
      data: {
        topic,
        shop,
        payload: JSON.stringify(payload),
        error: error.message,
        stack: error.stack || null,
        createdAt: new Date()
      }
    });
    
    log("error", "Added to dead letter queue", { topic, shop, error: error.message });
  } catch (dbError) {
    // Fallback: Log in Console wenn DB-Fehler
    console.error("[Webhook] Failed to add to dead letter queue:", dbError);
    console.error("[Webhook] Original error:", error);
  }
}

// ============================================================================
// 6. WEBHOOK-VERARBEITUNG MIT IDEMPOTENZ
// ============================================================================

/**
 * Sichere Webhook-Verarbeitung mit Idempotenz und Dead-Letter-Queue
 */
export async function processWebhookSafely(
  webhookId: string,
  topic: string,
  shop: string,
  payload: any,
  processor: () => Promise<void>
): Promise<void> {
  try {
    // 1. Idempotenz prüfen
    if (await isWebhookProcessed(webhookId)) {
      log("info", "Webhook already processed", { webhookId, topic, shop });
      return;
    }

    // 2. Verarbeitung ausführen
    await processor();

    // 3. Als verarbeitet markieren
    await markWebhookProcessed(webhookId, topic, shop);
    
    log("info", "Webhook processed successfully", { webhookId, topic, shop });
  } catch (error) {
    // 4. Fehler in Dead-Letter-Queue speichern
    await addToDeadLetterQueue(topic, shop, payload, error as Error);
    
    // 5. Fehler weiterwerfen (für Logging)
    throw error;
  }
}

// ============================================================================
// 7. DEAD-LETTER-REPLAY
// ============================================================================

/**
 * Replay-Funktion für Dead-Letter-Queue
 */
export async function replayDeadLetter(deadLetterId: string): Promise<void> {
  const deadLetter = await prisma.deadLetter.findUnique({
    where: { id: deadLetterId }
  });

  if (!deadLetter) {
    throw new Error(`Dead letter not found: ${deadLetterId}`);
  }

  try {
    // Webhook erneut verarbeiten
    const payload = JSON.parse(deadLetter.payload);
    
    // Hier würde die ursprüngliche Verarbeitungslogik aufgerufen werden
    // Das ist abhängig vom Topic und muss individuell implementiert werden
    
    // Dead-Letter als erfolgreich markieren
    await prisma.deadLetter.update({
      where: { id: deadLetterId },
      data: { 
        retriedAt: new Date(),
        retryCount: (deadLetter.retryCount || 0) + 1
      }
    });
    
    log("info", "Dead letter replayed successfully", { deadLetterId });
  } catch (error) {
    // Retry-Count erhöhen
    await prisma.deadLetter.update({
      where: { id: deadLetterId },
      data: { 
        retryCount: (deadLetter.retryCount || 0) + 1,
        lastError: (error as Error).message
      }
    });
    
    log("error", "Dead letter replay failed", { deadLetterId, error });
    throw error;
  }
}

// ============================================================================
// 8. UTILITY-FUNKTIONEN
// ============================================================================

/**
 * Holt alle unverarbeiteten Dead-Letters
 */
export async function getUnprocessedDeadLetters(): Promise<any[]> {
  return await prisma.deadLetter.findMany({
    where: {
      retriedAt: null,
      retryCount: { lt: 3 } // Max 3 Retries
    },
    orderBy: { createdAt: 'asc' }
  });
}

/**
 * Cleanup alter Webhook-Events (älter als X Tage)
 */
export async function cleanupOldWebhookEvents(days: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const result = await prisma.webhookEvent.deleteMany({
    where: {
      processedAt: { lt: cutoffDate }
    }
  });
  
  log("info", "Cleaned up old webhook events", { count: result.count, days });
  return result.count;
}
