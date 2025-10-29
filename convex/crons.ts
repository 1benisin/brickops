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

// Phase 3: Drain marketplace outbox every 30 seconds
crons.interval(
  "drain-marketplace-outbox",
  { seconds: 30 },
  internal.inventory.syncWorker.drainMarketplaceOutbox,
);

export default crons;
