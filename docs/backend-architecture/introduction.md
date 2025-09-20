# Introduction

This document outlines the overall project architecture for BrickOps, including backend systems, shared services, and non-UI specific concerns. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development, ensuring consistency and adherence to chosen patterns and technologies.

**Relationship to Frontend Architecture:**
If the project includes a significant user interface, a separate Frontend Architecture Document will detail the frontend-specific design and MUST be used in conjunction with this document. Core technology stack choices documented herein (see "Tech Stack") are definitive for the entire project, including any frontend components.

## Starter Template or Existing Project

Based on review of the PRD, BrickOps will be built as a Next.js 14+ application with Convex for backend services. No specific starter template was identified in the requirements - the project will be built from standard Next.js and Convex initialization.

**Decision:** Starting from Next.js standard setup with Convex integration, allowing for maximum customization of the complex inventory management and API integration features required.

## Change Log

| Date       | Version | Description                            | Author              |
| ---------- | ------- | -------------------------------------- | ------------------- |
| 2025-01-20 | 1.0     | Initial architecture document creation | Winston (Architect) |
