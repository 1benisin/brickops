# Infrastructure and Deployment

## Infrastructure as Code

- **Tool:** Vercel CLI v33.0.0+ with Convex CLI v1.9.0+
- **Location:** Configuration files at project root (`vercel.json`, `convex.json`)
- **Approach:** Declarative configuration with automatic provisioning - no traditional IaC tools needed as both platforms handle infrastructure automatically

## Deployment Strategy

- **Strategy:** Continuous Deployment with Git-based triggers and automatic previews
- **CI/CD Platform:** Vercel's built-in CI/CD with Convex automatic deployments
- **Pipeline Configuration:** `.github/workflows/` for GitHub Actions integration (optional advanced workflows)

## Environments

- **Development:** Local development with Convex dev deployment and Next.js dev server
- **Preview:** Automatic preview deployments on PR creation with isolated Convex environments
- **Production:** Production deployment with Convex production backend and Vercel production hosting

## Environment Promotion Flow

```
Development (Local)
    ↓ git push to feature branch
Preview Environment (Auto-deployed)
    ↓ merge to main branch
Production Environment (Auto-deployed)
    ↓ rollback if issues detected
Previous Stable Version
```

## Rollback Strategy

- **Primary Method:** Vercel instant rollback to previous deployment with Convex function versioning
- **Trigger Conditions:** Failed health checks, critical error rates above 1%, or manual trigger by team
- **Recovery Time Objective:** Under 5 minutes for frontend rollback, under 2 minutes for backend function rollback
