# Source Tree

```
brickops/
├── convex/                         # Convex backend functions and schema
│   ├── _generated/                 # Auto-generated Convex types
│   ├── functions/                  # Business logic functions
│   │   ├── auth.ts                # Authentication functions
│   │   ├── catalog.ts             # Catalog management functions
│   │   ├── inventory.ts           # Inventory operations
│   │   ├── marketplace.ts         # External API integrations
│   │   ├── orders.ts              # Order processing functions
│   │   ├── picking.ts             # Pick session management
│   │   └── identification.ts      # Part identification functions
│   ├── http.ts                    # HTTP actions for webhooks/external calls
│   ├── crons.ts                   # Scheduled functions (order sync)
│   ├── schema.ts                  # Database schema definitions
│   └── auth.config.js             # Convex Auth configuration
├── src/                           # Next.js frontend application
│   ├── app/                       # App Router (Next.js 14+)
│   │   ├── (auth)/               # Auth-protected routes
│   │   │   ├── dashboard/        # Main dashboard pages
│   │   │   ├── inventory/        # Inventory management pages
│   │   │   ├── orders/           # Order management pages
│   │   │   ├── picking/          # Pick session pages
│   │   │   └── settings/         # User/business settings
│   │   ├── auth/                 # Authentication pages
│   │   │   ├── signin/
│   │   │   ├── signup/
│   │   │   └── reset/
│   │   ├── globals.css           # Global Tailwind styles
│   │   ├── layout.tsx            # Root layout component
│   │   └── page.tsx              # Landing page
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Base UI components (buttons, inputs, etc.)
│   │   ├── forms/                # Form components with validation
│   │   ├── tables/               # Data table components
│   │   ├── camera/               # Camera integration components
│   │   ├── picking/              # Pick session specific components
│   │   └── layout/               # Layout components (nav, sidebar, etc.)
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-convex-auth.ts    # Authentication state management
│   │   ├── use-inventory.ts      # Inventory data hooks
│   │   ├── use-orders.ts         # Order management hooks
│   │   └── use-camera.ts         # Camera integration hooks
│   ├── lib/                      # Utility libraries and configurations
│   │   ├── utils.ts              # General utility functions
│   │   ├── validations.ts        # Form validation schemas (Zod)
│   │   ├── constants.ts          # App constants and enums
│   │   └── types.ts              # Shared TypeScript types
│   └── middleware.ts             # Next.js middleware for auth/routing
├── public/                       # Static assets
│   ├── icons/                    # App icons and favicons
│   ├── images/                   # Static images
│   └── logos/                    # Brand assets
├── __tests__/                    # Test files
│   ├── convex/                   # Backend function tests
│   ├── components/               # Component unit tests
│   ├── pages/                    # Page integration tests
│   └── e2e/                      # End-to-end tests (Playwright)
├── docs/                         # Project documentation
│   ├── api/                      # API documentation
│   ├── deployment/               # Deployment guides
│   └── development/              # Development setup guides
├── scripts/                      # Build and utility scripts
│   ├── setup-dev.js              # Development environment setup
│   ├── seed-data.js              # Database seeding for development
│   └── deploy.js                 # Deployment automation
├── .env.local                    # Local environment variables
├── .env.example                  # Environment variables template
├── convex.json                   # Convex project configuration
├── next.config.js                # Next.js configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies and scripts
├── pnpm-workspace.yaml           # Monorepo workspace configuration
└── README.md                     # Project setup and documentation
```
