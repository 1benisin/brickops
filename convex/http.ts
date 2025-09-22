import { httpRouter } from "convex/server";

import { validateBricklink, validateBrickognize, validateBrickowl } from "./lib/external/validate";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/healthz",
  method: "GET",
  handler: async () => ({
    status: 200,
    body: "ok",
  }),
});

const toJsonResponse = (data: unknown, status: number) => ({
  status,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(data),
});

http.route({
  path: "/api/health/brickognize",
  method: "GET",
  handler: async () => {
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
  },
});

http.route({
  path: "/api/health/bricklink",
  method: "GET",
  handler: async () => {
    try {
      const result = await validateBricklink("system");
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
  },
});

http.route({
  path: "/api/health/brickowl",
  method: "GET",
  handler: async () => {
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
  },
});

export default http;
