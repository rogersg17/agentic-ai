# Agentic Test Automation Platform

An AI-driven, multi-user test automation platform for web applications. Ingests Playwright tests, page objects, fixtures, requirements, and execution artifacts into a knowledge graph. Generates tests from requirements, classifies failures, and proposes policy-governed self-healing — all with human review and full audit trails.

## Architecture

See [docs/architecture-plan.md](docs/architecture-plan.md) for the full architecture design.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, shadcn/ui, TanStack Query |
| API | NestJS 11 (TypeScript), GraphQL + REST, Socket.io |
| Agent Orchestration | LangGraph.js (@langchain/langgraph) |
| LLM Gateway | LiteLLM Proxy |
| Relational DB | PostgreSQL 16 (users, execution data, audit) |
| Knowledge Graph | Neo4j 5.x (entities, relationships, vector + full-text search) |
| Queue | Redis + BullMQ |
| Object Storage | MinIO (S3-compatible) |
| Test Execution | Playwright (Docker containers or native Windows 11) |

### Monorepo Structure

```
packages/
  shared/     # Shared types, constants, RBAC definitions
  api/        # NestJS backend (auth, ingestion, execution, knowledge graph)
  agents/     # LangGraph.js agent orchestration (Analyst, Generator, Healer, Classifier, Reviewer)
  web/        # Next.js 15 frontend (dashboard, triage, generation workbench)
```

## Prerequisites

- Node.js >= 22
- Docker Desktop with WSL2 (for Windows 11)
- npm 11+

## Quick Start

```bash
# 1. Clone and install dependencies
npm install

# 2. Start infrastructure (PostgreSQL, Neo4j, Redis, MinIO)
docker compose up -d

# 3. Run database migrations
npm run -w @agentic/api db:migrate

# 4. Start all services in development mode
npm run dev
```

### Service URLs

| Service | URL |
|---|---|
| Web UI | http://localhost:3000 |
| API | http://localhost:3001 |
| API Docs (Swagger) | http://localhost:3001/api/docs |
| Neo4j Browser | http://localhost:7474 |
| MinIO Console | http://localhost:9001 |

## PoC Scope

**3 user roles**: Admin, SDET, Manual QA

**Core value loop**: Ingest assets → Build knowledge model → Generate tests → Execute → Classify failures → Propose healing → Human review

### Key Constraints

- No opaque self-healing — all changes are evidence-backed and reviewable
- Business assertions are never automatically rewritten
- Deterministic workflows preferred; LLM reasoning only where it adds clear value
- Full audit trail for every generated or healed artifact

## Development

```bash
# Type-check all packages
npm run typecheck

# Format code
npm run format

# Run tests
npm run test
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

See `.env.example` for all available configuration options.

## License

Private — not for redistribution.
