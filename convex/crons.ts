import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const crons = cronJobs();

export const logHeartbeat = internalAction({
  args: {},
  handler: async (_ctx) => {
    console.log("[cron] Heartbeat executed ✓");
  },
});

crons.interval("log-heartbeat", { seconds: 60 * 60 }, internal.crons.logHeartbeat);

// Process refresh queue every 5 minutes (10 items per run = 120 API calls/hour max)
crons.interval(
  "process-refresh-queue",
  { minutes: 5 },
  internal.bricklink.dataRefresher.processQueue,
);

// Clean up old queue items daily at 2 AM UTC
crons.daily(
  "cleanup-refresh-queue",
  { hourUTC: 2, minuteUTC: 0 },
  internal.bricklink.dataRefresher.cleanupQueue,
);

// Process inventory sync queue every 5 minutes (Story 3.4, Task 4)
// Syncs pending inventory changes to all configured marketplaces (BrickLink, BrickOwl)
// DEPRECATED: Replaced with immediate sync in Story 3.6
// crons.interval("inventory-sync", { minutes: 5 }, internal.inventory.sync.processAllPendingChanges);

export default crons;
