import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const crons = cronJobs();

export const logHeartbeat = internalAction({
  args: {},
  handler: async (_ctx) => {
    console.log("Cron heartbeat executed");
  },
});

crons.interval("log-heartbeat", { seconds: 60 * 60 }, internal.crons.logHeartbeat);
// crons.interval("catalog-refresh", { minutes: 15 }, internal.catalog.scheduleStaleRefresh);

export default crons;
