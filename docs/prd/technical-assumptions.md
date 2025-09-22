# Technical Assumptions

## Repository Structure: Monorepo

Single repository containing the Next.js application and any shared packages, allowing for better code organization and shared utilities between frontend and backend components.

## Service Architecture

**Serverless functions in Convex** for business logic with real-time subscriptions for live updates. The architecture will be built around Convex's real-time database and serverless functions, providing seamless real-time inventory updates and order processing across all connected clients.

## Testing Requirements

**Unit + Integration testing by default (CI)** with comprehensive coverage for business logic, API integrations, and key user workflows. End-to-end (Playwright) tests are run locally during relevant changes and via an on-demand/scheduled GitHub Actions workflow for regression coverage.

Scope:

- Unit: components, hooks, utilities, Convex functions
- Integration: API interactions (Bricklink, Brickowl, Brickognize), cross-function flows
- E2E: Critical journeys (auth, signup, dashboard load) executed on-demand (not every PR)

## Additional Technical Assumptions and Requests

- **Frontend Framework**: Next.js 14+ with TypeScript for type safety and modern React features
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent, accessible design system across all devices. **CRITICAL**: All UI components MUST be installed via shadcn/ui CLI (`pnpm dlx shadcn@latest add [component]`). Do NOT install Radix UI components directly.
- **State Management**: Built-in React state management (useState, useContext, useReducer) with Zustand available if needed for complex state management
- **Backend Services**: Convex for real-time database, authentication, and serverless functions
  - **Authentication**: Convex Auth with role-based access control and multi-user support
  - **Documentation**: [Convex Auth Setup](../external-documentation/convex-auth/setup.md), [Configuration](../external-documentation/convex-auth/configure-auth.md), [Authorization](../external-documentation/convex-auth/authorization.md)
- **Database**: Convex's built-in database with real-time subscriptions for live updates
- **Hosting**: Vercel for frontend deployment, Convex for backend services
- **Computer Vision**: Integration with Brickognize API for Lego part identification
- **File Storage**: Convex file storage for part images and user uploads
- **API Integrations**:
  - Bricklink API with intelligent rate limiting and error handling
  - Brickowl API with intelligent caching and data freshness validation
  - Brickognize API for part identification
- **Security**: Convex authentication with role-based access control, API key management for external services, data encryption at rest and in transit, GDPR compliance
  - **Authentication Implementation**: Follow [Convex Auth patterns](../external-documentation/convex-auth/authorization.md) for backend functions and [Next.js middleware](../external-documentation/convex-auth/authorization-nextjs.md) for route protection
- **Performance**: <3 second page load times, <1 second API response times, 99.9% uptime target
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge) on desktop and mobile
- **Mobile Optimization**: Web-first responsive design with mobile camera integration
- **Real-time Features**: Live inventory updates, order processing, and collaborative features using Convex subscriptions
