# Monitoring and Observability

## Monitoring Stack

- **Frontend Monitoring:** Vercel Analytics with Core Web Vitals tracking
- **Backend Monitoring:** Convex Dashboard with built-in function metrics and logs
- **Error Tracking:** Sentry for production error monitoring and alerting
- **Performance Monitoring:** Real-time function performance via Convex Dashboard

## Key Metrics

**Frontend Metrics:**

- Core Web Vitals (LCP, FID, CLS)
- JavaScript error rates and stack traces
- API response times from frontend perspective
- User interaction tracking (camera captures, inventory additions)
- Page load performance across different devices

**Backend Metrics:**

- Function execution time and success rates
- External API response times and error rates (Brickognize, Bricklink, Brickowl)
- Database query performance and subscription efficiency
- Real-time connection counts and message throughput
- Rate limit hit rates and API quota usage
  - Bricklink daily quota usage (% of 5,000/day) with alert threshold at ≥80%

**Business Metrics:**

- Part identification accuracy rates
- Order processing completion times
- Pick session efficiency metrics
- Inventory sync success rates with marketplaces
