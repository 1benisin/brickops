# REST API Spec

Since BrickOps uses Convex serverless functions rather than a traditional REST API architecture, this section is not applicable. Convex functions provide a different paradigm where the frontend directly calls backend functions through the Convex client, eliminating the need for REST endpoint definitions.

**API Architecture Note:** BrickOps uses Convex's function-based API where:

- Frontend calls Convex functions directly via `useMutation()` and `useQuery()`
- Functions are defined in the Convex backend and automatically exposed
- Real-time subscriptions replace traditional polling or webhook patterns
- Authentication and authorization are handled at the function level
