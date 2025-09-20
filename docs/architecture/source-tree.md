# Source Tree

```text
brickops/
├── convex/                         # Convex backend functions and schema
│   ├── functions/                  # Business logic functions
│   ├── http.ts                     # HTTP actions
│   ├── crons.ts                    # Scheduled functions
│   └── schema.ts                   # Database schema
├── src/                            # Next.js frontend application
│   ├── app/                        # App Router (Next.js 14+)
│   ├── components/                 # Reusable UI components
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Utilities and configs
│   └── middleware.ts               # Route protection
├── public/                         # Static assets
├── __tests__/                      # Tests (unit/integration/e2e)
├── docs/                           # Documentation
├── scripts/                        # Build and utility scripts
├── package.json                    # Dependencies and scripts
├── pnpm-workspace.yaml             # Monorepo workspace configuration
└── README.md                       # Project documentation
```
