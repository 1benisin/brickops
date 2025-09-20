# Test Strategy and Standards

## Testing Philosophy

- **Approach:** Test-after development with immediate test creation following feature completion - prioritizes development speed while ensuring comprehensive coverage
- **Coverage Goals:** 80% unit test coverage, 60% integration test coverage, 100% coverage for critical paths (inventory sync, order processing, payment workflows)
- **Test Pyramid:** 70% unit tests (fast feedback), 25% integration tests (API interactions), 5% end-to-end tests (critical user journeys)

## Test Types and Organization

### Unit Tests

- **Framework:** Vitest 1.2.0+ with TypeScript support and Vite's fast hot module replacement
- **File Convention:** `*.test.ts` co-located with source files for maintainability
- **Location:** Adjacent to source files in respective directories (convex functions, React components, utility libraries)
- **Mocking Library:** Vitest's built-in mocking with manual mocks for external APIs
- **Coverage Requirement:** 80% statement coverage with emphasis on business logic functions

**AI Agent Requirements:**

- Generate tests for all public methods and React component interfaces
- Cover edge cases and error conditions (empty states, API failures, validation errors)
- Follow AAA pattern (Arrange, Act, Assert) with descriptive test names
- Mock all external dependencies (APIs, file system, timers) for isolation

### Integration Tests

- **Scope:** Cross-component interactions, database operations, and external API integrations with real network calls to staging environments
- **Location:** `__tests__/integration/` directory organized by feature domain
- **Test Infrastructure:**
  - **Convex Database:** Test deployment with isolated data per test suite
  - **External APIs:** Sandbox/staging endpoints for Brickognize, Bricklink, Brickowl
  - **Authentication:** Test user accounts with limited permissions for safety

### End-to-End Tests

- **Framework:** Playwright 1.40.0+ with cross-browser testing (Chrome, Firefox, Safari)
- **Scope:** Critical user journeys - part identification → inventory addition → order fulfillment → marketplace sync
- **Environment:** Staging environment with test marketplace accounts and sample data
- **Test Data:** Seed data with known part numbers and controlled marketplace orders for predictable results

## Test Data Management

- **Strategy:** Factory functions generate consistent test data with realistic part numbers, customer information, and order structures
- **Fixtures:** Static test data files for common scenarios (sample parts catalog, typical orders, error responses)
- **Factories:** Dynamic test data generation using libraries like `@faker-js/faker` for user information and randomized inventory quantities
- **Cleanup:** Automatic test data cleanup after each suite with Convex test utilities for database reset

## Continuous Testing

- **CI Integration:** GitHub Actions pipeline with parallel test execution - unit tests (2-3 minutes), integration tests (5-8 minutes), E2E tests (10-15 minutes)
- **Performance Tests:** Load testing for marketplace sync operations handling 1000+ orders using Artillery or similar tools
- **Security Tests:** Automated dependency scanning with npm audit and basic penetration testing for authentication endpoints
