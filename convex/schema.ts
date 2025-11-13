// Root Convex schema aggregator.
// Domain-specific tables live under `convex/<domain>/schema.ts`.
import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";

import { catalogTables } from "./catalog/schema";
import { identifyTables } from "./identify/schema";
import { inventoryTables } from "./inventory/schema";
import { marketplaceTables } from "./marketplaces/shared/schema";
import { ordersTables } from "./orders/schema";
import { ratelimitTables } from "./ratelimiter/schema";
import { usersTables } from "./users/schema";

const tables = {
  ...authTables,
  ...catalogTables,
  ...identifyTables,
  ...inventoryTables,
  ...marketplaceTables,
  ...ordersTables,
  ...ratelimitTables,
  ...usersTables,
} as const;

export default defineSchema(tables);
