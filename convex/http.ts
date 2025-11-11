import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

import { validateBricklink, validateBrickognize, validateBrickowl } from "./lib/external/validate";
import { auth } from "./auth";
import { bricklinkWebhook } from "./marketplaces/bricklink/notifications/actions";

const http = httpRouter();

auth.addHttpRoutes(http);

const healthz = httpAction(
  async (_ctx, _req) =>
    new Response("ok", {
      status: 200,
    }),
);

http.route({
  path: "/healthz",
  method: "GET",
  handler: healthz,
});

const toJsonResponse = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const brickognizeHealth = httpAction(async (_ctx, _req) => {
  try {
    const result = await validateBrickognize();
    const status = result.ok ? 200 : 503;
    return toJsonResponse(result, status);
  } catch (error) {
    return toJsonResponse(
      {
        provider: "brickognize",
        ok: false,
        error: (error as Error).message,
      },
      500,
    );
  }
});

http.route({
  path: "/api/health/brickognize",
  method: "GET",
  handler: brickognizeHealth,
});

const bricklinkHealth = httpAction(async (_ctx, _req) => {
  try {
    const result = await validateBricklink();
    const status = result.ok ? 200 : 503;
    return toJsonResponse(result, status);
  } catch (error) {
    return toJsonResponse(
      {
        provider: "bricklink",
        ok: false,
        error: (error as Error).message,
      },
      500,
    );
  }
});

http.route({
  path: "/api/health/bricklink",
  method: "GET",
  handler: bricklinkHealth,
});

const brickowlHealth = httpAction(async (_ctx, _req) => {
  try {
    const result = await validateBrickowl();
    const status = result.ok ? 200 : 503;
    return toJsonResponse(result, status);
  } catch (error) {
    return toJsonResponse(
      {
        provider: "brickowl",
        ok: false,
        error: (error as Error).message,
      },
      500,
    );
  }
});

http.route({
  path: "/api/health/brickowl",
  method: "GET",
  handler: brickowlHealth,
});

// BrickLink webhook endpoint - supports dynamic token routing
// Path: /api/bricklink/webhook/{webhookToken}
// Token is extracted in the handler from URL path
// Note: Convex httpRouter should match paths with additional segments after the base path
// If path-based routing doesn't work, the handler also supports query parameters (?token=...)
http.route({
  path: "/api/bricklink/webhook",
  method: "POST",
  handler: bricklinkWebhook,
});

export default http;
