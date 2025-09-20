import { httpRouter } from "convex/server";

const http = httpRouter();

http.route({
  path: "/healthz",
  method: "GET",
  handler: async () => ({
    status: 200,
    body: "ok",
  }),
});

export default http;
