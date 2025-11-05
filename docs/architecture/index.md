# BrickOps Architecture Documentation

Welcome to the BrickOps architecture documentation. This documentation is organized to help you quickly understand the system and find the information you need.

## Quick Start

**New to the project?** Start here:

1. [Introduction](./overview/introduction.md) - Project overview and change log
2. [High Level Architecture](./overview/high-level-architecture.md) - System overview and architectural patterns
3. [Tech Stack](./overview/tech-stack.md) - Technology choices and versions
4. [Project Structure](./overview/project-structure.md) - Source code organization

**Working on a specific area?** Jump to:

- [Backend Architecture](./backend/architecture.md) - Convex serverless backend
- [Frontend Architecture](./frontend/architecture.md) - Next.js frontend
- [Development Workflow](./development/development-workflow.md) - Local setup and development

## Documentation Structure

### Overview

High-level documentation for onboarding and understanding the system:

- [Introduction](./overview/introduction.md) - Project context and history
- [High Level Architecture](./overview/high-level-architecture.md) - System design and patterns
- [Tech Stack](./overview/tech-stack.md) - Technology choices with versions
- [Project Structure](./overview/project-structure.md) - Source code organization

### Backend

Convex serverless backend architecture and domains:

- [Architecture](./backend/architecture.md) - Backend overview, domain organization, and patterns
- [Database Schema](./backend/database-schema.md) - Full database schema documentation
- [API Specification](./backend/api-specification.md) - Function specifications and contracts

**Backend Domains:**

- Catalog - Part catalog management
- Identify - Part identification via Brickognize
- Inventory - Inventory tracking and sync
- Marketplaces - Marketplace integrations and orchestration
  - Bricklink - Marketplace integration with OAuth 1.0a
  - BrickOwl - Marketplace integration with API keys
  - Shared - Shared marketplace orchestration and types
- Orders - Order management and processing
- Users - User management and RBAC
- Rate Limit - Global rate limiting infrastructure

### Frontend

Next.js frontend architecture and components:

- [Architecture](./frontend/architecture.md) - Frontend overview, components, state management, routing
- [Components](./frontend/components.md) - Service layer and component structure
- [Core Workflows](./frontend/core-workflows.md) - User workflow documentation (Mermaid diagrams)

### Development

Developer-focused documentation:

- [Development Workflow](./development/development-workflow.md) - Local setup, commands, environment
- [Coding Standards](./development/coding-standards.md) - Code conventions and standards
- [Testing Strategy](./development/testing-strategy.md) - Testing approach and organization
- [Error Handling](./development/error-handling.md) - Error handling patterns

### Operations

Deployment, security, and monitoring:

- [Deployment](./operations/deployment.md) - Deployment strategy and CI/CD
- [Security and Performance](./operations/security-and-performance.md) - Security requirements and performance optimization
- [Monitoring](./operations/monitoring.md) - Monitoring and observability setup

### Data

Data models and structures:

- [Data Models](./data/data-models.md) - TypeScript interfaces and business entities

## External Documentation

- [External APIs](../external/apis/) - Brickognize, Bricklink, Brickowl API documentation
- [Convex Auth Setup](../external-documentation/convex-auth/setup.md) - Authentication configuration
- [Convex Auth Authorization](../external-documentation/convex-auth/authorization.md) - Authorization patterns
