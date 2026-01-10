import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { usersTables } from "./users/schema";
import { inventoryTables } from "./inventory/schema";
import { ordersTables } from "./orders/schema";
import { marketplaceTables } from "./marketplaces/shared/schema";
import { catalogTables } from "./catalog/schema";
import { identifyTables } from "./identify/schema";
import { ratelimitTables } from "./ratelimiter/schema";

export default defineSchema({
  ...authTables,
  ...usersTables,
  ...inventoryTables,
  ...ordersTables,
  ...marketplaceTables,
  ...catalogTables,
  ...identifyTables,
  ...ratelimitTables,
});
