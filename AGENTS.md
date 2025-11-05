# AGENTS.md - AI Agent Guide

This file is designed to help AI agents understand the BrickOps project structure, locate relevant documentation, and follow proper contribution guidelines.

## Project Overview

**BrickOps** is a retail operations platform for managing LEGO parts inventory, orders, and marketplace integrations. It's built with:

- **Frontend**: Next.js (App Router) with React, TypeScript, and shadcn/ui components
- **Backend**: Convex serverless backend with TypeScript
- **Testing**: Jest, Vitest, and Playwright
- **Monorepo**: pnpm workspace

## Documentation Structure

All project documentation is located in the `docs/` directory. Start here for any questions about the project.

### 📋 Product Requirements (PRD)

**Location**: `docs/prd/`

Start here to understand:

- Project goals and background context
- Functional and non-functional requirements
- User interface design goals
- Technical assumptions
- Epic breakdown and feature requirements

**Key Files**:

- `docs/prd/index.md` - Complete PRD table of contents
- `docs/prd/goals-and-background-context.md` - Project vision and goals
- `docs/prd/requirements.md` - Functional requirements
- `docs/prd/epic-list.md` - Feature epics and stories

### 🏗️ Architecture Documentation

**Location**: `docs/architecture/`

Comprehensive technical documentation covering system design, implementation patterns, and best practices.

**Quick Navigation**:

- **New to the project?** Start with `docs/architecture/index.md` for navigation
- **Overview**: `docs/architecture/overview/` - High-level architecture, tech stack, project structure
- **Backend**: `docs/architecture/backend/` - Convex backend architecture, database schema, API specs
- **Frontend**: `docs/architecture/frontend/` - Next.js frontend architecture, components, workflows
- **Development**: `docs/architecture/development/` - Coding standards, development workflow, testing strategy
- **Operations**: `docs/architecture/operations/` - Deployment, monitoring, security

**Critical Files**:

- `docs/architecture/development/coding-standards.md` - **READ THIS FIRST** - Coding conventions and patterns
- `docs/architecture/development/development-workflow.md` - Local setup, testing, CI/CD
- `docs/architecture/backend/architecture.md` - Backend domain organization and patterns
- `docs/architecture/frontend/architecture.md` - Frontend component structure and patterns

### 🔄 User Flows

**Location**: `docs/flows/`

Step-by-step flow documentation for key user workflows:

- Order processing and picking
- Inventory management
- Part identification
- Marketplace synchronization
- Catalog operations

See `docs/flows/README.md` for the complete list of documented flows.

### 📚 External Documentation

**Location**: `docs/external-documentation/`

Documentation for external APIs and frameworks:

- **Bricklink API**: `docs/external-documentation/api-bricklink/` - Marketplace API integration
- **Brickognize API**: `docs/external-documentation/api-brickognize.md` - Part identification service
- **BrickOwl API**: `docs/external-documentation/api-brickowl/` - Marketplace API integration

## Code Structure

### Backend (`convex/`)

Organized by domain:

- `convex/catalog/` - Part catalog management
- `convex/identify/` - Part identification via Brickognize
- `convex/inventory/` - Inventory tracking and sync
- `convex/marketplaces/` - Marketplace integrations (Bricklink, BrickOwl)
- `convex/orders/` - Order management and processing
- `convex/users/` - User management and RBAC
- `convex/ratelimit/` - Rate limiting infrastructure
- `convex/lib/` - Shared utilities and helpers

### Frontend (`src/`)

- `src/app/` - Next.js App Router routes and layouts
- `src/components/` - React components (using shadcn/ui)
- `src/hooks/` - React hooks
- `src/lib/` - Utilities, Convex clients, shared types
- `src/middleware.ts` - Request middleware and guards

### Tests (`__tests__/`)

- `__tests__/frontend/` - Jest + React Testing Library tests
- `__tests__/backend/` - Vitest tests for Convex functions
- `__tests__/e2e/` - Playwright end-to-end tests

## Contribution Guidelines

### Before Making Changes

1. **Read the relevant documentation**:

   - For architecture questions: `docs/architecture/`
   - For feature requirements: `docs/prd/`
   - For user flows: `docs/flows/`

2. **Understand coding standards**: Read `docs/architecture/development/coding-standards.md`

3. **Check development workflow**: See `docs/architecture/development/development-workflow.md`

### Critical Coding Rules

⚠️ **MUST FOLLOW**:

1. **Convex Function Patterns** (from `docs/architecture/backend/architecture.md`):

   - Queries: Read-only, pure functions (no writes, no scheduling)
   - Mutations: Handle all database writes and scheduling
   - Actions: Orchestrate external APIs, call mutations to persist
   - Internal functions: Server-only building blocks
   - Always await promises (no fire-and-forget)

2. **Type Safety**:

   - Backend validators are the single source of truth
   - Frontend types MUST be derived from validators, never duplicated
   - Use `Infer` from `convex/values` in validator files to derive TypeScript types
   - Export types from validator files (e.g., `export type AddInventoryItemArgs = Infer<typeof addInventoryItemArgs>`)
   - Frontend imports and uses these exported types from backend validator files

3. **Component Usage**:

   - **ALWAYS use shadcn/ui components** - This is mandatory for all UI components
   - **Use the ShadCN MCP server** to discover available components and their APIs
   - Never install Radix UI directly (shadcn/ui provides all Radix components we need)
   - Follow component patterns in `docs/architecture/frontend/components.md`
   - Before creating a custom component, check if a shadcn/ui component exists via the MCP server

4. **Error Handling**:

   - Use structured error objects
   - Follow patterns in `docs/architecture/development/error-handling.md`

5. **Testing**:
   - Write tests for new features
   - Follow testing strategy in `docs/architecture/development/testing-strategy.md`
   - Run `pnpm test:coverage` before committing

### Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run all tests
pnpm test

# Run frontend tests
pnpm test:frontend

# Run backend tests
pnpm test:backend

# Run E2E tests (requires dev server)
pnpm test:e2e

# Format code
pnpm format

# Lint code
pnpm lint
```

### Testing Requirements

- **Unit tests**: Required for new business logic
- **Component tests**: Required for new UI components
- **E2E tests**: Run manually when touching auth/routing/hydration (see `docs/architecture/development/development-workflow.md`)

## Where to Find Information

### "How do I...?"

- **Understand the project goals**: `docs/prd/goals-and-background-context.md`
- **Learn the architecture**: `docs/architecture/overview/high-level-architecture.md`
- **See the tech stack**: `docs/architecture/overview/tech-stack.md`
- **Understand project structure**: `docs/architecture/overview/project-structure.md`
- **Find coding standards**: `docs/architecture/development/coding-standards.md`
- **See development workflow**: `docs/architecture/development/development-workflow.md`
- **Understand backend domains**: `docs/architecture/backend/architecture.md`
- **See database schema**: `docs/architecture/backend/database-schema.md`
- **Find API specifications**: `docs/architecture/backend/api-specification.md`
- **Understand frontend architecture**: `docs/architecture/frontend/architecture.md`
- **See component structure**: `docs/architecture/frontend/components.md`
- **Find shadcn/ui components**: Use the ShadCN MCP server to discover available components
- **Understand user flows**: `docs/flows/`
- **Find external API docs**: `docs/external-documentation/`
- **Inspect database/backend**: Use the Convex MCP server to view tables, functions, and data

### Feature Implementation

When implementing a feature:

1. Check the PRD: `docs/prd/` for requirements and acceptance criteria
2. Review related flows: `docs/flows/` for user workflow documentation
3. Check architecture: `docs/architecture/` for implementation patterns
4. Review external APIs: `docs/external-documentation/` if integrating with external services

## Quick Reference

| Need to know...                  | Go to...                                                |
| -------------------------------- | ------------------------------------------------------- |
| Project goals and requirements   | `docs/prd/`                                             |
| Architecture and design patterns | `docs/architecture/`                                    |
| User workflows                   | `docs/flows/`                                           |
| External API integration         | `docs/external-documentation/`                          |
| Coding standards                 | `docs/architecture/development/coding-standards.md`     |
| Development setup                | `docs/architecture/development/development-workflow.md` |
| Testing strategy                 | `docs/architecture/development/testing-strategy.md`     |
| Database schema                  | `docs/architecture/backend/database-schema.md`          |
| **Database/backend inspection**  | **Convex MCP server** (see Available Tools section)     |
| **UI components discovery**      | **ShadCN MCP server** (see Available Tools section)     |

## Available Tools and MCP Servers

### 🔵 Convex MCP Server

**Use the Convex MCP server to interact with your Convex deployment and database.**

The Convex MCP server provides direct access to:

- **Database tables**: List tables, read data, inspect schemas
- **Convex functions**: List all functions (queries, mutations, actions), view their specifications
- **Deployment status**: Check deployment health and status
- **Environment variables**: View and manage environment variables
- **Logs**: View function execution logs
- **Run queries**: Execute one-off queries for debugging

**When to use the Convex MCP server:**

- Need to inspect database schema or data
- Want to understand what Convex functions are available
- Need to check function signatures and return types
- Debugging by viewing logs or running test queries
- Understanding the current state of the database

**Example use cases:**

- "What tables exist in the database?"
- "What functions are available in the orders domain?"
- "Show me the schema for the inventory table"
- "What data is currently in the orders table?"
- "What are the environment variables configured?"

Always use the Convex MCP server instead of guessing about database structure or available functions.

### 🎨 ShadCN UI MCP Server

**Use the ShadCN MCP server to discover and use shadcn/ui components.**

The ShadCN MCP server provides:

- **Component discovery**: List all available shadcn/ui components
- **Component documentation**: Get detailed API docs for each component
- **Usage examples**: See how to use components correctly
- **Component information**: Props, variants, and styling options

**When to use the ShadCN MCP server:**

- Before creating any UI component - check if one exists
- Need to understand component props and API
- Want to see usage examples for a component
- Need to find the right component for a UI pattern
- Understanding component variants and styling options

**Example queries:**

- "What components are available?"
- "Show me the Button component API"
- "What components can I use for forms?"
- "How do I use the Dialog component?"
- "What table components are available?"

**CRITICAL**: Always check the ShadCN MCP server before:

- Creating a new UI component
- Installing a new UI library
- Building custom form controls, dialogs, or data displays

## Best Practices for AI Agents

1. **Always check documentation first** before making assumptions
2. **Use the Convex MCP server** to inspect database and functions instead of guessing
3. **Use the ShadCN MCP server** to find components before creating custom UI
4. **Follow the coding standards** strictly, especially Convex function patterns
5. **Derive types from validators using `Infer`** - Export types from validator files, never duplicate type definitions
6. **Write tests** for new functionality
7. **Use existing patterns** - check similar code in the codebase before implementing
8. **Reference the PRD** when implementing features to ensure requirements are met
9. **Check user flows** to understand the complete workflow before implementing UI changes

## Questions?

If you need information that's not in this guide:

1. **For database/backend questions**: Use the Convex MCP server to inspect tables, functions, and data
2. **For UI component questions**: Use the ShadCN MCP server to find and understand components
3. Check the `docs/` directory structure above
4. Read the relevant index files (e.g., `docs/architecture/index.md`, `docs/prd/index.md`)
5. Search the codebase for similar implementations
6. Review the external documentation for API-specific questions

---

**Remember**: The documentation in `docs/` is the source of truth. Always refer to it when making changes or answering questions about the project.
