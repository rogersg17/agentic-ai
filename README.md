# Agentic Test Automation Platform

An AI-driven, multi-user test automation platform for web applications. Ingests Playwright tests, page objects, fixtures, requirements, and execution artifacts into a knowledge graph. Generates tests from requirements, classifies failures, and proposes policy-governed self-healing — all with human review and full audit trails.

## Architecture

See [docs/architecture-plan.md](docs/architecture-plan.md) for the full architecture design.

### Tech Stack

| Layer               | Technology                                                     |
| ------------------- | -------------------------------------------------------------- |
| Frontend            | Next.js 15, React 19, TypeScript, shadcn/ui, TanStack Query   |
| API                 | NestJS 11 (TypeScript), GraphQL + REST, Socket.io              |
| Agent Orchestration | LangGraph.js (@langchain/langgraph)                            |
| LLM Gateway         | LiteLLM Proxy                                                  |
| Relational DB       | PostgreSQL 16 (users, execution data, audit)                   |
| Knowledge Graph     | Neo4j 5.x (entities, relationships, vector + full-text search) |
| Queue               | Redis + BullMQ                                                 |
| Object Storage      | MinIO (S3-compatible)                                          |
| Test Execution      | Playwright (Docker containers or native)                       |

### Monorepo Structure

```
packages/
  shared/     # Shared types, constants, RBAC definitions
  api/        # NestJS backend (auth, ingestion, execution, knowledge graph)
  agents/     # LangGraph.js agent orchestration (placeholder — Phase 4)
  web/        # Next.js 15 frontend (dashboard, triage, generation workbench)
```

## What's Implemented

### API (`packages/api/`)

| Module           | Endpoints                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| **Auth**         | `POST /auth/register`, `POST /auth/login`, `GET /auth/profile` — JWT + bcrypt + RBAC guard                   |
| **Projects**     | Full CRUD — `POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`, `DELETE /projects/:id` |
| **Ingestion**    | `POST /ingestion/upload` (single), `POST /ingestion/upload-batch` (up to 50 files) — auto-detect asset type, SHA256 dedup, MinIO storage, Neo4j sync |
| **Knowledge**    | `GET /knowledge/graph/:projectId`, `/entities`, `/entity/:id`, `/search`, `/semantic-search`, `/traceability` |
| **Health**       | `GET /health` — PostgreSQL, Neo4j, Redis connectivity + latency                                              |
| **Audit**        | Automatic logging of all state changes (actor, action, before/after snapshots)                                |

**Asset Parsers:** Playwright tests, page objects, helpers, fixtures, and requirements (Markdown).

### Web Frontend (`packages/web/`)

| Page                     | Features                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **Login**                | Email/password authentication with redirect                                         |
| **Dashboard**            | Stat cards (recent runs, pending reviews, test health %, triage queue), run history |
| **Assets Management**    | Drag-and-drop upload, batch ingestion, project selector, real-time progress         |
| **Knowledge Explorer**   | Graph + list view, full-text & semantic search, entity detail panel, type filters   |
| **Traceability Matrix**  | Requirement-to-test coverage, partial/full indicators, per-requirement test list    |

### Shared Types (`packages/shared/`)

- Entity types: Requirements, Tests, PageObjects, Helpers, Fixtures, Defects
- Enums: test origin, test type, defect severity, entity status, execution status, failure classification
- RBAC: 3 roles (Admin, SDET, Manual QA) × 18 granular capabilities
- Healing policy: change types, risk levels, approval thresholds, circuit breakers

### Database Schema (PostgreSQL + Drizzle ORM)

`users` · `projects` · `execution_runs` · `test_results` · `healing_proposals` · `generation_requests` · `audit_log`

### Knowledge Graph (Neo4j)

**Nodes:** Requirement, TestCase, PageObject, Helper, Fixture, Defect
**Relationships:** COVERED_BY, USES_PAGE_OBJECT, USES_FIXTURE, USES_HELPER, BLOCKED_BY, RELATED_TO, DEPENDS_ON, EXTENDS
**Search:** Full-text indexes + vector similarity via embeddings (text-embedding-3-small with hash fallback)

## Prerequisites

- Node.js >= 22
- Docker Desktop
- npm 11+

## Quick Start

```bash
# 1. Clone and install dependencies
npm install

# 2. Copy environment config
cp .env.example .env

# 3. Start infrastructure (PostgreSQL, Neo4j, Redis, MinIO)
docker compose up -d

# 4. Run database migrations
npm run -w @agentic/api db:migrate

# 5. Start all services in development mode
npm run dev
```

### Service URLs

| Service            | URL                            |
| ------------------ | ------------------------------ |
| Web UI             | http://localhost:3000           |
| API                | http://localhost:3001           |
| API Docs (Swagger) | http://localhost:3001/api/docs  |
| Neo4j Browser      | http://localhost:7474           |
| MinIO Console      | http://localhost:9001           |

## Development

```bash
npm run dev            # Start all services in dev mode
npm run build          # Build all packages
npm run typecheck      # Type-check all packages
npm run lint           # Lint all packages
npm run test           # Run tests across all packages
npm run format         # Format code with Prettier

# Database operations (API package)
npm run -w @agentic/api db:generate   # Generate migrations
npm run -w @agentic/api db:migrate    # Run migrations
npm run -w @agentic/api db:studio     # Open Drizzle Studio
```

## Key Constraints

- **No opaque self-healing** — all changes are evidence-backed and reviewable
- **Business assertions are never automatically rewritten**
- **Deterministic workflows preferred** — LLM reasoning only where it adds clear value
- **Full audit trail** for every generated or healed artifact

## Roles & Permissions

| Capability              | Admin | SDET  | Manual QA |
| ----------------------- | ----- | ----- | --------- |
| User management         | Write | —     | —         |
| Project configuration   | Write | Write | Read      |
| Test / asset uploads    | Write | Write | Read      |
| Generation & healing    | Write | Write | Read      |
| Execution trigger       | Write | Write | —         |
| Results & traceability  | Read  | Read  | Read      |
| Audit log               | Read  | Read  | —         |

## License

Private — not for redistribution.
