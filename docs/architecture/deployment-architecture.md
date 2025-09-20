# Deployment Architecture

## Deployment Strategy

**Frontend Deployment:**

- **Platform:** Vercel with global edge CDN
- **Build Command:** `pnpm run build`
- **Output Directory:** `.next`
- **CDN/Edge:** Automatic with Vercel's global network

**Backend Deployment:**

- **Platform:** Convex managed serverless deployment
- **Build Command:** Automatic via `convex deploy`
- **Deployment Method:** Git-based with automatic versioning

## CI/CD Pipeline

```yaml