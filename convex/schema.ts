import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

// Import domain-specific schema tables
import { usersTables } from "./users/schema";
import { inventoryTables } from "./inventory/schema";
import { catalogTables } from "./catalog/schema";
import { identifyTables } from "./identify/schema";
import { marketplaceTables } from "./marketplaces/shared/schema";
import { ordersTables } from "./orders/schema";
import { ratelimitTables } from "./ratelimit/schema";

// Root schema aggregator - combines all domain schemas
export default defineSchema({
  // Auth tables from convex-auth
  ...authTables,

  // Domain-specific tables
  ...usersTables,
  ...inventoryTables,
  ...catalogTables,
  ...identifyTables,
  ...marketplaceTables,
  ...ordersTables,
  ...ratelimitTables,
});
