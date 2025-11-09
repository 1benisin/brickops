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

// Drain catalog refresh outbox every 5 minutes (10 items per run = 120 API calls/hour max)
crons.interval(
  "drain-catalog-refresh-outbox",
  { minutes: 10 },
  internal.catalog.refreshWorker.drainCatalogRefreshOutbox,
);

// Clean up old outbox items daily at 2 AM UTC
crons.daily(
  "cleanup-catalog-refresh-outbox",
  { hourUTC: 2, minuteUTC: 0 },
  internal.marketplaces.bricklink.dataRefresher.cleanupOutbox,
);

// Phase 3: Drain marketplace outbox every 30 seconds
crons.interval(
  "drain-marketplace-outbox",
  { minutes: 10 },
  internal.inventory.syncWorker.drainMarketplaceOutbox,
);

// Poll BrickLink notifications for all active stores every 3 minutes (safety net)
crons.interval(
  "poll-bricklink-notifications",
  { minutes: 10 },
  internal.marketplaces.bricklink.notifications.pollAllNotifications,
);

// Verify BrickLink webhook registration every 6 hours
crons.interval(
  "verify-bricklink-webhook",
  { hours: 6 },
  internal.marketplaces.bricklink.actions.ensureWebhooks,
  {},
);

// Verify BrickOwl webhook registration every 6 hours
crons.interval(
  "verify-brickowl-webhook",
  { hours: 6 },
  internal.marketplaces.brickowl.actions.ensureWebhooks,
  {},
);

export default crons;
