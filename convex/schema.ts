import { defineSchema } from "convex/server";

// ============================================
// Infrastructure
// ============================================
import { authTables } from "@convex-dev/auth/server";
import { ratelimitTables } from "./shared/ratelimit/schema";

// ============================================
// Core Business Domains
// ============================================
import { usersTables } from "./users/schema";
import { catalogTables } from "./catalog/schema";
import { identifyTables } from "./identify/schema";
import { inventoryTables } from "./inventory/schema";
import { ordersTables } from "./orders/schema";

// ============================================
// Orchestration
// ============================================
import { syncTables } from "./sync/schema";

// ============================================
// External Integrations
// ============================================
import { marketplaceTables } from "./marketplaces/shared/schema";

export default defineSchema({
  // Infrastructure
  ...authTables,
  ...ratelimitTables,

  // Core Business Domains
  ...usersTables,
  ...catalogTables,
  ...identifyTables,
  ...inventoryTables,
  ...ordersTables,

  // Orchestration
  ...syncTables,

  // External Integrations
  ...marketplaceTables,
});
