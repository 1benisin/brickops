# Tech Stack

## Cloud Infrastructure

- **Provider:** Vercel (Frontend) + Convex (Backend Services)
- **Key Services:** Convex Functions, Convex Database, Convex File Storage, Convex Auth, Convex Cron
- **Deployment Regions:** Global edge deployment (Vercel) + US-based Convex backend

## Technology Stack Table

| Category                       | Technology          | Version     | Purpose                           | Rationale                                                                                     |
| ------------------------------ | ------------------- | ----------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| **Language**                   | TypeScript          | 5.3.3+      | Primary development language      | Strong typing essential for complex inventory/order data structures, excellent tooling        |
| **Runtime**                    | Node.js             | 20.11.0 LTS | JavaScript runtime                | Latest LTS provides stability, security, and performance for production use                   |
| **Frontend Framework**         | Next.js             | 14.1.0+     | React framework with SSR/SSG      | PRD requirement, provides optimal SEO and performance for web-responsive design               |
| **Backend Platform**           | Convex              | Latest      | Serverless backend + real-time DB | PRD requirement, eliminates infrastructure complexity while providing real-time subscriptions |
| **Styling**                    | Tailwind CSS        | 3.4.0+      | Utility-first CSS framework       | PRD requirement, rapid UI development with consistent design system                           |
| **State Management**           | React Built-in      | Latest      | Client state management           | PRD preference, useState/useReducer sufficient for most use cases                             |
| **State Management (Complex)** | Zustand             | 4.5.0+      | Advanced state management         | PRD backup option for complex client state if React built-in proves insufficient              |
| **Package Manager**            | pnpm                | 8.15.0+     | Package management                | Efficient for monorepo, faster installs, better disk usage                                    |
| **Testing Framework**          | Vitest              | 1.2.0+      | Unit and integration testing      | Fast, Vite-native, excellent TypeScript support                                               |
| **E2E Testing**                | Playwright          | 1.40.0+     | End-to-end testing                | Cross-browser testing for camera integration and complex workflows                            |
| **Linting**                    | ESLint              | 8.56.0+     | Code quality and standards        | Industry standard, catches errors and enforces conventions                                    |
| **Formatting**                 | Prettier            | 3.2.0+      | Code formatting                   | Consistent code style across team                                                             |
| **API Integration**            | Brickognize API     | Current     | Part identification               | PRD requirement for automated Lego part recognition                                           |
| **API Integration**            | Bricklink API       | Current     | Marketplace and catalog           | PRD requirement for inventory ground truth and marketplace operations                         |
| **API Integration**            | Brickowl API        | Current     | Secondary marketplace             | PRD requirement for multi-marketplace inventory management                                    |
| **Authentication**             | Convex Auth         | Latest      | User authentication               | PRD requirement, integrated with Convex platform                                              |
| **File Storage**               | Convex File Storage | Latest      | Image and document storage        | PRD requirement, integrated solution for part images                                          |
| **Deployment**                 | Vercel              | Latest      | Frontend hosting                  | PRD requirement, optimal Next.js hosting with global edge                                     |
| **Monitoring**                 | Convex Dashboard    | Latest      | Backend monitoring                | Built-in monitoring and logging for Convex functions                                          |
