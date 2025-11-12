import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import prisma from "../db.server";

const GDPR_STORAGE_DIR =
  process.env.GDPR_STORAGE_DIR ?? path.join(process.cwd(), "storage", "gdpr");

let storageReadyPromise: Promise<void> | null = null;

async function ensureStorageDir(): Promise<void> {
  if (!storageReadyPromise) {
    storageReadyPromise = (async () => {
      try {
        await fs.mkdir(GDPR_STORAGE_DIR, { recursive: true });
      } catch (error) {
        storageReadyPromise = null;
        throw error;
      }
    })();
  }

  await storageReadyPromise;
}

function hashValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value).digest("hex");
}

function parseJsonSafely(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

async function deleteArtifactFile(artifactPath: string | null | undefined) {
  if (!artifactPath) {
    return;
  }

  const absolutePath = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.join(GDPR_STORAGE_DIR, artifactPath);

  try {
    await fs.unlink(absolutePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[GDPR] Failed to delete artifact", {
        artifactPath: absolutePath,
        error,
      });
    }
  }
}

type CustomerDataRequestPayload = {
  shop_id: number;
  shop_domain: string;
  customer: {
    id: number;
    email?: string | null;
    phone?: string | null;
  };
  orders_requested?: number[];
};

type CustomerRedactPayload = {
  shop_id: number;
  shop_domain: string;
  customer: {
    id: number;
    email?: string | null;
    phone?: string | null;
  };
  orders_to_redact?: number[];
};

type ShopRedactPayload = {
  shop_id: number;
  shop_domain: string;
};

export async function handleCustomerDataRequest(
  shop: string,
  payload: CustomerDataRequestPayload,
) {
  const customerId = String(payload.customer.id);
  const emailHash = hashValue(payload.customer.email?.toLowerCase() ?? null);

  const searchTerms = [customerId];
  if (payload.customer.email) {
    searchTerms.push(payload.customer.email);
  }
  if (payload.customer.phone) {
    searchTerms.push(payload.customer.phone);
  }

  const deadLetters = await prisma.deadLetter.findMany({
    where: {
      shop,
      OR: [
        { topic: { contains: "customers" } },
        ...searchTerms.map((term) => ({
          payload: { contains: term },
        })),
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  const deadLetterRecords = deadLetters.map((record) => ({
    id: record.id,
    topic: record.topic,
    createdAt: record.createdAt.toISOString(),
    payload: parseJsonSafely(record.payload),
  }));

  const exportData = {
    generatedAt: new Date().toISOString(),
    shop,
    customer: {
      id: customerId,
      email: payload.customer.email ?? null,
      phone: payload.customer.phone ?? null,
    },
    ordersRequested: payload.orders_requested ?? [],
    storedRecords: {
      deadLetters: deadLetterRecords,
    },
    notes:
      deadLetterRecords.length === 0
        ? [
            "Urgify speichert keine Kundendaten außerhalb temporärer Shopify-Metafields. Es wurden keine Datensätze für diesen Kunden gefunden.",
          ]
        : [],
  };

  await ensureStorageDir();
  const artifactFileName = `customers-data-${customerId}-${Date.now()}.json`;
  await fs.writeFile(
    path.join(GDPR_STORAGE_DIR, artifactFileName),
    JSON.stringify(exportData, null, 2),
    "utf-8",
  );

  await prisma.gdprRequest.create({
    data: {
      shop,
      topic: "customers/data_request",
      customerId,
      customerEmailHash: emailHash,
      status: "completed",
      artifactPath: artifactFileName,
      details: JSON.stringify({
        generatedAt: exportData.generatedAt,
        deadLetterCount: deadLetterRecords.length,
      }),
      processedAt: new Date(),
    },
  });

  return exportData;
}

export async function handleCustomerRedact(
  shop: string,
  payload: CustomerRedactPayload,
) {
  const customerId = String(payload.customer.id);
  const emailHash = hashValue(payload.customer.email?.toLowerCase() ?? null);

  const existingRequests = await prisma.gdprRequest.findMany({
    where: {
      shop,
      customerId,
    },
  });

  await Promise.all(
    existingRequests.map((request) => deleteArtifactFile(request.artifactPath)),
  );

  const transactionResults = await prisma.$transaction([
    prisma.deadLetter.deleteMany({
      where: {
        shop,
        OR: [
          { topic: { contains: "customers" } },
          { payload: { contains: customerId } },
          ...(payload.customer.email
            ? [{ payload: { contains: payload.customer.email } }]
            : []),
          ...(payload.customer.phone
            ? [{ payload: { contains: payload.customer.phone } }]
            : []),
        ],
      },
    }),
    prisma.gdprRequest.deleteMany({
      where: {
        shop,
        customerId,
      },
    }),
  ]);

  await prisma.gdprRequest.create({
    data: {
      shop,
      topic: "customers/redact",
      customerId,
      customerEmailHash: emailHash,
      status: "completed",
      details: JSON.stringify({
        processedAt: new Date().toISOString(),
        deletedDeadLetters: transactionResults[0].count,
        deletedExports: existingRequests.length,
        ordersToRedact: payload.orders_to_redact ?? [],
      }),
      processedAt: new Date(),
    },
  });

  return {
    deletedDeadLetters: transactionResults[0].count,
    deletedExports: existingRequests.length,
  };
}

export async function handleShopRedact(
  shop: string,
  _payload: ShopRedactPayload,
) {
  const existingRequests = await prisma.gdprRequest.findMany({
    where: { shop },
  });

  await Promise.all(
    existingRequests.map((request) => deleteArtifactFile(request.artifactPath)),
  );

  const transactionResults = await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop } }),
    prisma.deadLetter.deleteMany({ where: { shop } }),
    prisma.webhookEvent.deleteMany({ where: { shop } }),
    prisma.gdprRequest.deleteMany({ where: { shop } }),
  ]);

  await prisma.gdprRequest.create({
    data: {
      shop,
      topic: "shop/redact",
      status: "completed",
      details: JSON.stringify({
        processedAt: new Date().toISOString(),
        deletedSessions: transactionResults[0].count,
        deletedDeadLetters: transactionResults[1].count,
        deletedWebhookEvents: transactionResults[2].count,
        deletedExports: existingRequests.length,
      }),
      processedAt: new Date(),
    },
  });

  return {
    deletedSessions: transactionResults[0].count,
    deletedDeadLetters: transactionResults[1].count,
    deletedWebhookEvents: transactionResults[2].count,
    deletedExports: existingRequests.length,
  };
}

