# Deployment Architecture

## Deployment Strategy

### Frontend Deployment

**Platform:** Vercel with global edge CDN

- **Build Command:** `pnpm run build`
- **Output Directory:** `.next`
- **CDN/Edge:** Automatic with Vercel's global network
- **Framework Detection:** Automatic (Next.js 14+)
- **Environment Variables:** Configured in Vercel dashboard
- **Domain:** Configured in Vercel project settings

**Deployment Process:**
1. Git push to `main` branch triggers automatic deployment
2. Vercel builds Next.js application
3. Build artifacts deployed to edge network
4. DNS updates propagate globally

### Backend Deployment

**Platform:** Convex managed serverless deployment

- **Build Command:** Automatic via `convex deploy`
- **Deployment Method:** Git-based with automatic versioning
- **Functions:** Deployed automatically on `convex deploy` command
- **Schema:** Validated and applied automatically
- **Environment Variables:** Configured in Convex dashboard

**Deployment Process:**
1. Run `npx convex deploy` from local development
2. Convex validates functions and schema
3. Functions deployed to Convex cloud
4. Schema changes applied atomically
5. Zero-downtime deployment (functions versioned)

## CI/CD Pipeline

The project uses GitHub Actions for continuous integration and testing.

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push and pull request:

```yaml
- Checkout repository
- Setup pnpm 8.15.4
- Setup Node.js 20.11.0
- Install dependencies (frozen lockfile)
- Run lint (ESLint with zero warnings)
- Run tests with coverage
  - Frontend: Jest + React Testing Library
  - Backend: Vitest with Convex polyfills
- Build application (Next.js production build)
```

**Key Requirements:**
- All lint checks must pass (zero warnings)
- All tests must pass with coverage thresholds
- Production build must succeed

### E2E Workflow (`.github/workflows/e2e.yml`)

Runs on manual dispatch and weekly schedule (Mondays at 06:00 UTC):

```yaml
- Checkout repository
- Setup pnpm 8.15.4
- Setup Node.js 20.11.0
- Install dependencies
- Install Playwright browsers with system dependencies
- Build application
- Run E2E tests (Playwright)
```

**Coverage:**
- Critical user flows tested across browsers
- Mobile and desktop viewports
- Real browser testing with Playwright

### Pre-commit Hooks

**Simple Git Hooks** configured via `simple-git-hooks`:

- **Lint-staged:** Runs ESLint and Prettier on staged files
- **Pre-commit:** Validates code before commit
- **Format:** Auto-formats code with Prettier

## Environments

### Development

**Local Development:**
- Frontend: `http://localhost:3000` (Next.js dev server)
- Backend: Convex dev deployment (configured via `convex.json`)
- Database: Convex development database
- Hot reloading: Enabled for both frontend and backend

**Setup:**
1. Copy `.env.local.example` to `.env.local`
2. Configure Convex deployment URL
3. Run `pnpm dev` for concurrent frontend/backend development

### Staging (Future)

Planned staging environment for pre-production testing:
- Separate Vercel deployment
- Separate Convex deployment
- Staging database
- Production-like configuration

### Production

**Current Production Setup:**
- Vercel: Production deployment (automatic from main branch)
- Convex: Production deployment (manual via `npx convex deploy`)
- Production database: Convex production database

**Future Enhancements:**
- Automated Convex deployments on main branch merge
- Separate staging environment
- Blue-green deployments for zero-downtime updates
- Feature flags for gradual rollouts

## Deployment Best Practices

1. **Always test locally first:**
   - Run `pnpm test:coverage` before deploying
   - Verify build succeeds: `pnpm build`
   - Test critical flows locally

2. **Convex deployment:**
   - Deploy during low-traffic periods
   - Verify schema migrations are backward compatible
   - Test critical functions after deployment

3. **Vercel deployment:**
   - Automatic on main branch push
   - Preview deployments for pull requests
   - Production deployments require main branch

4. **Rollback procedures:**
   - **Convex:** Revert to previous deployment via dashboard
   - **Vercel:** Revert via deployment history in dashboard
   - **Database:** Schema changes should be backward compatible

## Monitoring Deployment

**After Deployment:**
- Check Convex dashboard for function errors
- Monitor Vercel deployment logs
- Verify critical user flows
- Check error tracking (Sentry if configured)

**Key Metrics:**
- Deployment success rate
- Function execution errors
- Build time and performance
- Error rates post-deployment
