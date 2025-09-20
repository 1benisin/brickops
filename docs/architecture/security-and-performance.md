# Security and Performance

## Security Requirements

- Input Validation: Zod schemas at Convex function boundaries
- Rate Limiting: Per-user limits (e.g., identify: 100/hour, order processing: 50/hour)
- CORS: Restrict to production domains
- Secrets: Never hardcode; use environment variables with encryption
- Tenant Isolation: All queries scoped by businessAccountId

## Performance Optimization

- Frontend: Mobile-first, Tailwind, code-splitting, image optimization
- Backend: Convex subscriptions, caching catalog data, exponential backoff and circuit breakers for APIs
