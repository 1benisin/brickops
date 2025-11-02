# Security and Performance

## Security Requirements

- **Input Validation**: Zod schemas at Convex function boundaries
- **Rate Limiting**:
  - Per-user limits (e.g., identify: 100/hour, order processing: 50/hour)
  - Database-backed marketplace rate limiting (Stories 3.2-3.3) with circuit breaker
- **Provider Quotas**:
  - BrickLink: 5,000 calls/day per business account
  - BrickOwl: 200 calls/minute per business account
  - Enforce with alerts at ≥80% usage and hard stop beyond quota
- **Credential Encryption (Story 3.1)**:
  - User marketplace credentials encrypted at rest using AES-GCM
  - Implementation: `convex/lib/encryption.ts` using Web Crypto API
  - Encryption key: `ENCRYPTION_KEY` environment variable (32-byte base64-encoded)
  - Never return plaintext credentials; always decrypt server-side only
- **CORS**: Restrict to production domains
- **Secrets**: Never hardcode; use environment variables (system) or encrypted database storage (user BYOK)
- **Tenant Isolation**: All queries scoped by businessAccountId
- **RBAC**: Owner role required for marketplace credential management and inventory sync operations

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
