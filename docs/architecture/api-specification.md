# API Specification

BrickOps uses Convex serverless functions instead of a traditional REST API. The frontend calls Convex functions directly via the Convex client and real-time subscriptions. Authentication/authorization occur at function boundaries.

- No OpenAPI spec is required for MVP. If a REST façade is added later, generate an OpenAPI document then.
