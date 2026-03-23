# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-driven, multi-user test automation platform for web applications that ingests Playwright tests, page objects, fixtures, and requirements into a knowledge graph. It generates tests from requirements, classifies failures, and proposes policy-governed self-healing with human review and full audit trails.

## Architecture

**Monorepo structure using Turbo and npm workspaces:**
- `packages/shared/` - Shared types, constants, RBAC definitions
- `packages/api/` - NestJS backend (auth, ingestion, execution, knowledge graph)
- `packages/agents/` - LangGraph.js agent orchestration
- `packages/web/` - Next.js 15 frontend (dashboard, triage, generation workbench)

**Tech Stack:**
- Frontend: Next.js 15, React 19, TypeScript, shadcn/ui, TanStack Query
- API: NestJS 11, GraphQL + REST, Socket.io, PostgreSQL + Drizzle ORM
- Knowledge Graph: Neo4j 5.x with vector + full-text search
- Agent Orchestration: LangGraph.js (@langchain/langgraph)
- Queue: Redis + BullMQ
- Object Storage: MinIO (S3-compatible)

## Common Commands

```bash
# Development
npm run dev                    # Start all services in dev mode
npm run build                  # Build all packages
npm run typecheck             # Type-check all packages
npm run lint                  # Lint all packages
npm run test                  # Run tests across all packages
npm run format               # Format code with Prettier

# Infrastructure
docker compose up -d          # Start PostgreSQL, Neo4j, Redis, MinIO

# Database operations (API package)
npm run -w @agentic/api db:generate  # Generate migrations
npm run -w @agentic/api db:migrate   # Run migrations
npm run -w @agentic/api db:studio    # Open Drizzle Studio
```

## Development Setup

1. Requires Node.js >= 22 and npm 11+
2. Copy `.env.example` to `.env` and configure
3. Start infrastructure: `docker compose up -d`
4. Run migrations: `npm run -w @agentic/api db:migrate`
5. Start development: `npm run dev`

**Service URLs:**
- Web UI: http://localhost:3000
- API: http://localhost:3001
- API Docs: http://localhost:3001/api/docs
- Neo4j Browser: http://localhost:7474
- MinIO Console: http://localhost:9001

## Key Constraints

- **No opaque self-healing** - All changes are evidence-backed and reviewable
- **Business assertions are never automatically rewritten**
- **Deterministic workflows preferred** - LLM reasoning only where it adds clear value
- **Full audit trail** for every generated or healed artifact
- **Windows 11 environment** - All development and deployment on Windows with WSL2

## Package-Specific Notes

**API (`@agentic/api`):**
- Uses NestJS 11 with Drizzle ORM for PostgreSQL
- Neo4j integration for knowledge graph operations
- JWT authentication with RBAC guard system
- GraphQL + REST hybrid API design

**Shared (`@agentic/shared`):**
- Must be built before other packages can use it
- Contains all type definitions and constants
- RBAC role definitions and permissions

**Testing:**
- Uses Jest for unit tests
- API tests should use NestJS testing utilities
- All packages have individual test scripts