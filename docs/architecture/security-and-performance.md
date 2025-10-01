# Security and Performance

## Security Requirements

- Input Validation: Zod schemas at Convex function boundaries
- Rate Limiting: Per-user limits (e.g., identify: 100/hour, order processing: 50/hour)
- Provider Quotas: Bricklink default 5,000 calls/day (API Terms 2023-02-02). Enforce daily budgeting with alerts at ≥80% usage and hard stop beyond quota for compliance.
- CORS: Restrict to production domains
- Secrets: Never hardcode; use environment variables with encryption
- Tenant Isolation: All queries scoped by businessAccountId

## Performance Optimization

- Frontend: Mobile-first, Tailwind, code-splitting, image optimization
- Backend: Convex subscriptions, caching catalog data, exponential backoff and circuit breakers for APIs, scheduled refresh jobs enforcing catalog freshness windows (fresh <7 days, stale <30 days, expired ≥30 days)

### Theme and Responsive Design

**Dark/Light Mode Support:**

- CSS variables for theme switching with `prefers-color-scheme` detection
- Theme toggle component with localStorage persistence
- All components support both themes through CSS custom properties
- Smooth transitions between themes (no flash of unstyled content)

**Responsive Breakpoint Strategy:**

- Mobile-first approach starting at 320px viewport width
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px)
- Container max-widths: mobile (100%), tablet (768px), desktop (1280px)
- Touch-friendly interface elements (44px minimum touch targets)
- Optimized for camera interface on mobile devices
