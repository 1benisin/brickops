import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  type BOBulkRequestEntry,
  boBulkRequestEntrySchema,
  boBulkBatchPayloadSchema,
} from "./schema";
import { createBrickOwlHttpClient } from "./credentials";
import { createBrickOwlRequestState } from "./credentials";
import { normalizeBrickOwlError } from "./storeClient";
import type { StoreOperationError } from "../shared/types";

export interface BrickOwlBulkOptions {
  chunkSize?: number;
  idempotencyKey?: string;
  onProgress?: (progress: BrickOwlBulkProgress) => void | Promise<void>;
  delayBetweenBatchesMs?: number;
}

export interface BrickOwlBulkProgress {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}

export interface BrickOwlBulkResponse {
  success: boolean;
  data?: unknown;
  error?: StoreOperationError;
}

export interface BrickOwlBulkResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BrickOwlBulkResponse[];
  errors: Array<{
    batchIndex: number;
    requestIndex: number;
    request: BOBulkRequestEntry;
    error: StoreOperationError;
  }>;
}

const MAX_BATCH_SIZE = 50;

export async function executeBulkRequests(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    requests: BOBulkRequestEntry[];
    options?: BrickOwlBulkOptions;
  },
): Promise<BrickOwlBulkResult> {
  const { businessAccountId, requests } = params;
  const options = params.options ?? {};

  if (requests.length === 0) {
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      errors: [],
    };
  }

  const validatedRequests = requests.map((request) => boBulkRequestEntrySchema.parse(request));

  const chunkSize = Math.min(Math.max(options.chunkSize ?? MAX_BATCH_SIZE, 1), MAX_BATCH_SIZE);
  const chunks: BOBulkRequestEntry[][] = [];
  for (let index = 0; index < validatedRequests.length; index += chunkSize) {
    chunks.push(validatedRequests.slice(index, index + chunkSize));
  }

  const client = await createBrickOwlHttpClient(ctx, businessAccountId);
  const requestState = createBrickOwlRequestState();

  const results: BrickOwlBulkResponse[] = [];
  const errors: BrickOwlBulkResult["errors"] = [];

  let succeeded = 0;
  let failed = 0;
  const delayBetweenBatches = options.delayBetweenBatchesMs ?? 0;

  for (let batchIndex = 0; batchIndex < chunks.length; batchIndex += 1) {
    const chunk = chunks[batchIndex];
    const batchKey = options.idempotencyKey
      ? `${options.idempotencyKey}-batch-${batchIndex}`
      : undefined;

    try {
      const payload = boBulkBatchPayloadSchema.parse({ requests: chunk });

      const response = await client.requestWithRetry<unknown[]>(
        {
          path: "/bulk/batch",
          method: "POST",
          body: payload,
          idempotencyKey: batchKey,
          isIdempotent: !!batchKey,
        },
        requestState,
      );

      response.forEach((entry, requestIndex) => {
        const aggregateIndex = batchIndex * chunkSize + requestIndex;
        const originalRequest = validatedRequests[aggregateIndex];

        if (isErrorResponse(entry)) {
          const normalized = normalizeBrickOwlError(entry);
          failed += 1;
          results.push({
            success: false,
            error: normalized,
          });
          errors.push({
            batchIndex,
            requestIndex,
            request: originalRequest,
            error: normalized,
          });
        } else {
          succeeded += 1;
          results.push({
            success: true,
            data: entry,
          });
        }
      });
    } catch (rawError) {
      const normalized = normalizeBrickOwlError(rawError);

      chunk.forEach((request, requestIndex) => {
        failed += 1;
        results.push({
          success: false,
          error: normalized,
        });
        errors.push({
          batchIndex,
          requestIndex,
          request,
          error: normalized,
        });
      });
    }

    const progress: BrickOwlBulkProgress = {
      completed: Math.min((batchIndex + 1) * chunk.length, validatedRequests.length),
      total: validatedRequests.length,
      currentBatch: batchIndex + 1,
      totalBatches: chunks.length,
    };

    if (options.onProgress) {
      await options.onProgress(progress);
    }

    if (delayBetweenBatches > 0 && batchIndex < chunks.length - 1) {
      await delay(delayBetweenBatches);
    }
  }

  return {
    total: validatedRequests.length,
    succeeded,
    failed,
    results,
    errors,
  };
}

function isErrorResponse(entry: unknown): entry is { error?: unknown; message?: unknown } {
  return (
    typeof entry === "object" &&
    entry !== null &&
    ("error" in entry || "message" in entry)
  );
}

async function delay(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

