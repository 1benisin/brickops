import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";

export type Provider = "bricklink" | "brickowl";

export type ValidationIssue = {
  severity: "blocking" | "warning";
  message: string;
  itemId?: Id<"inventoryItems">;
  field?: string;
};

export type ValidationResult = {
  isValid: boolean;
  blockingIssues: ValidationIssue[];
  warnings: ValidationIssue[];
};

/**
 * Validate that an inventory item has all required fields for marketplace sync
 * AC: 3.5.11 - Validate required fields per marketplace requirements
 */
export function validateInventoryItemForSync(item: Doc<"inventoryItems">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Required fields for all marketplaces
  if (!item.partNumber) {
    issues.push({
      severity: "blocking",
      message: "Missing part number",
      itemId: item._id,
      field: "partNumber",
    });
  }

  if (!item.colorId) {
    issues.push({
      severity: "blocking",
      message: "Missing color ID",
      itemId: item._id,
      field: "colorId",
    });
  }

  if (item.quantityAvailable === undefined || item.quantityAvailable <= 0) {
    issues.push({
      severity: "blocking",
      message: "Quantity must be greater than 0",
      itemId: item._id,
      field: "quantityAvailable",
    });
  }

  if (!item.condition) {
    issues.push({
      severity: "blocking",
      message: "Missing condition (new/used)",
      itemId: item._id,
      field: "condition",
    });
  }

  if (item.price === undefined || item.price <= 0) {
    issues.push({
      severity: "blocking",
      message: "Missing or invalid price",
      itemId: item._id,
      field: "price",
    });
  }

  if (!item.location || item.location.trim().length === 0) {
    issues.push({
      severity: "blocking",
      message: "Location is required - cannot sync without a location",
      itemId: item._id,
      field: "location",
    });
  }

  return issues;
}

/**
 * Get all items in a file with inventory details
 * AC: 3.5.11 - Helper to fetch file items for validation
 */
export async function getFileItems(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"inventoryFiles">,
): Promise<Doc<"inventoryItems">[]> {
  const items = await ctx.db
    .query("inventoryItems")
    .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
    .filter((q) => q.eq(q.field("isArchived"), false))
    .collect();

  return items;
}

/**
 * Validate all prerequisites for batch sync
 * AC: 3.5.11 - Comprehensive pre-sync validation
 */
export async function validateBatchSyncPrerequisites(
  ctx: QueryCtx | MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  fileId: Id<"inventoryFiles">,
  providers: Provider[],
): Promise<ValidationResult> {
  const blockingIssues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Check file exists and belongs to business account
  const file = await ctx.db.get(fileId);
  if (!file) {
    blockingIssues.push({
      severity: "blocking",
      message: "File not found",
    });
    return { isValid: false, blockingIssues, warnings };
  }

  if (file.businessAccountId !== businessAccountId) {
    blockingIssues.push({
      severity: "blocking",
      message: "File does not belong to this business account",
    });
    return { isValid: false, blockingIssues, warnings };
  }

  if (file.deletedAt) {
    blockingIssues.push({
      severity: "blocking",
      message: "Cannot sync deleted file",
    });
    return { isValid: false, blockingIssues, warnings };
  }

  // 2. Get all items in file
  const items = await getFileItems(ctx, fileId);

  if (items.length === 0) {
    blockingIssues.push({
      severity: "blocking",
      message: "File has no items to sync",
    });
    return { isValid: false, blockingIssues, warnings };
  }

  // 3. Validate each item has required fields
  let itemsWithBlockingIssues = 0;
  let itemsWithWarnings = 0;

  for (const item of items) {
    const itemIssues = validateInventoryItemForSync(item);

    const itemBlockingIssues = itemIssues.filter((i) => i.severity === "blocking");
    const itemWarnings = itemIssues.filter((i) => i.severity === "warning");

    if (itemBlockingIssues.length > 0) {
      itemsWithBlockingIssues++;
      blockingIssues.push(...itemBlockingIssues);
    }

    if (itemWarnings.length > 0) {
      itemsWithWarnings++;
      warnings.push(...itemWarnings);
    }
  }

  // Summary for multiple items with issues
  if (itemsWithBlockingIssues > 0) {
    blockingIssues.unshift({
      severity: "blocking",
      message: `${itemsWithBlockingIssues} of ${items.length} items have blocking validation issues`,
    });
  }

  if (itemsWithWarnings > 0) {
    warnings.unshift({
      severity: "warning",
      message: `${itemsWithWarnings} of ${items.length} items have warnings`,
    });
  }

  // 4. Check marketplace credentials for each provider
  for (const provider of providers) {
    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", provider),
      )
      .first();

    if (!credentials) {
      blockingIssues.push({
        severity: "blocking",
        message: `${provider} credentials not configured`,
      });
      continue;
    }

    if (!credentials.isActive) {
      blockingIssues.push({
        severity: "blocking",
        message: `${provider} credentials are not active`,
      });
      continue;
    }

    if (credentials.validationStatus === "failed") {
      blockingIssues.push({
        severity: "blocking",
        message: `${provider} credentials failed validation: ${credentials.validationMessage || "Unknown error"}`,
      });
      continue;
    }

    // Warn if credentials haven't been validated recently (7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (!credentials.lastValidatedAt || credentials.lastValidatedAt < sevenDaysAgo) {
      warnings.push({
        severity: "warning",
        message: `${provider} credentials haven't been validated recently`,
      });
    }
  }

  // 5. Check rate limit capacity for each provider
  for (const provider of providers) {
    const quota = await ctx.runQuery(internal.marketplace.mutations.getQuotaState, {
      businessAccountId,
      provider,
    });

    // Calculate available capacity
    const now = Date.now();
    const windowElapsed = now - quota.windowStart;

    // Reset if window has expired
    const availableCapacity =
      windowElapsed >= quota.windowDurationMs
        ? quota.capacity
        : quota.capacity - quota.requestCount;

    // Estimate requests needed (conservative: 1 request per item for now)
    const estimatedRequests = items.length;

    if (availableCapacity < estimatedRequests) {
      warnings.push({
        severity: "warning",
        message: `${provider} rate limit may be insufficient (available: ${availableCapacity}, needed: ~${estimatedRequests})`,
      });
    }

    // Check if circuit breaker is open
    if (quota.circuitBreakerOpenUntil && quota.circuitBreakerOpenUntil > now) {
      const minutesUntilReset = Math.ceil((quota.circuitBreakerOpenUntil - now) / 60000);
      blockingIssues.push({
        severity: "blocking",
        message: `${provider} circuit breaker is open (resets in ${minutesUntilReset} minutes)`,
      });
    }
  }

  // Determine overall validity
  const isValid = blockingIssues.length === 0;

  return {
    isValid,
    blockingIssues,
    warnings,
  };
}
