import { cronJobs } from "convex/server";

const crons = cronJobs();

crons.interval("log-heartbeat", { seconds: 60 * 60 }, async (ctx) => {
  const log = ctx.scheduler.logger;
  log.info("Cron heartbeat executed");
});

export default crons;
