# Project Structure

```plaintext
brickops/
├── app/                          # Next.js App Router directory
│   ├── (auth)/                   # Route group for auth pages
│   │   ├── login/
│   │   └── signup/
│   ├── dashboard/                # Main dashboard routes
│   │   ├── page.tsx             # Inventory dashboard
│   │   └── layout.tsx           # Dashboard layout with nav
│   ├── inventory/               # Inventory management routes
│   │   ├── page.tsx             # Inventory list view
│   │   ├── add/                 # Add new inventory
│   │   ├── [id]/                # Individual inventory item
│   │   └── upload/              # Bulk inventory upload
│   ├── identify/                # Part identification routes
│   │   ├── page.tsx             # Camera interface
│   │   └── results/             # Identification results
│   ├── orders/                  # Order management routes
│   │   ├── page.tsx             # Order table view
│   │   ├── [id]/                # Individual order details
│   │   └── picking/             # Pick session routes
│   │       ├── [sessionId]/
│   │       └── todo/
│   ├── catalog/                 # Parts catalog routes
│   │   ├── page.tsx             # Catalog search
│   │   └── [partId]/            # Part detail pages
│   ├── settings/                # User settings routes
│   │   ├── page.tsx             # Account settings
│   │   ├── users/               # User management (owners only)
│   │   └── integrations/        # API configurations
│   ├── api/                     # Next.js API routes
│   │   ├── auth/                # Auth endpoints
│   │   ├── bricklink/           # Bricklink API proxy
│   │   ├── brickowl/            # Brickowl API proxy
│   │   └── brickognize/         # Brickognize API proxy
│   ├── globals.css              # Global styles and Tailwind imports
│   ├── layout.tsx               # Root layout with providers
│   ├── loading.tsx              # Global loading UI
│   ├── error.tsx                # Global error UI
│   └── page.tsx                 # Landing/redirect page
├── components/                   # Reusable UI components
│   ├── ui/                      # Base UI components (buttons, inputs, etc.)
│   ├── forms/                   # Form-specific components
│   ├── camera/                  # Camera capture components
│   ├── inventory/               # Inventory-specific components
│   ├── orders/                  # Order management components
│   ├── picking/                 # Pick session components
│   └── layout/                  # Layout components (nav, sidebar, etc.)
├── lib/                         # Utility libraries and configurations
│   ├── convex.ts               # Convex client configuration
│   ├── auth.ts                 # Authentication utilities
│   ├── utils.ts                # General utility functions
│   ├── types.ts                # Shared TypeScript types
│   ├── constants.ts            # Application constants
│   └── validations/            # Form validation schemas
├── hooks/                       # Custom React hooks
│   ├── use-auth.ts             # Authentication hooks
│   ├── use-camera.ts           # Camera access hooks
│   ├── use-inventory.ts        # Inventory management hooks
│   └── use-realtime.ts         # Convex subscription hooks
├── store/                       # Zustand store definitions
│   ├── auth-store.ts           # Authentication state
│   ├── inventory-store.ts      # Inventory management state
│   ├── picking-store.ts        # Pick session state
│   └── ui-store.ts             # UI state (modals, notifications)
├── styles/                      # Additional styling files
│   └── components.css          # Component-specific styles
├── public/                      # Static assets
│   ├── icons/                  # App icons and favicons
│   └── images/                 # Static images
├── convex/                      # Convex backend functions
│   ├── auth.ts                 # Authentication functions
│   ├── inventory.ts            # Inventory operations
│   ├── orders.ts               # Order management
│   ├── catalog.ts              # Catalog operations
│   └── schema.ts               # Database schema
└── tests/                       # Test files
    ├── __mocks__/              # Mock implementations
    ├── components/             # Component tests
    ├── hooks/                  # Hook tests
    ├── pages/                  # Page integration tests
    └── utils/                  # Utility function tests
```
