# Agentic Test Automation Platform

An AI-driven, multi-user test automation platform for web applications. Ingests Playwright tests, page objects, fixtures, requirements, and execution artifacts into a knowledge graph. Generates tests from requirements, classifies failures, and proposes policy-governed self-healing — all with human review and full audit trails.

## Architecture

See [docs/architecture-plan.md](docs/architecture-plan.md) for the full architecture design and [docs/sprint-plan.md](docs/sprint-plan.md) for detailed implementation progress.

### Tech Stack

| Layer               | Technology                                                     |
| ------------------- | -------------------------------------------------------------- |
| Frontend            | Next.js 15, React 19, TypeScript, shadcn/ui, TanStack Query   |
| API                 | NestJS 11 (TypeScript), GraphQL + REST, Socket.io              |
| Agent Orchestration | LangGraph.js (@langchain/langgraph)                            |
| LLM Gateway         | LiteLLM Proxy (OpenAI-compatible)                              |
| Relational DB       | PostgreSQL 16 (users, execution data, audit)                   |
| Knowledge Graph     | Neo4j 5.x (entities, relationships, vector + full-text search) |
| Queue               | Redis + BullMQ                                                 |
| Object Storage      | MinIO (S3-compatible)                                          |
| Test Execution      | Playwright (Docker containers or native)                       |

### Monorepo Structure

```
packages/
  shared/     # Shared types, constants, RBAC definitions
  api/        # NestJS backend (auth, ingestion, execution, classification, generation, healing, knowledge graph)
  agents/     # LangGraph.js agent orchestration (Analyst, Generator, Reviewer, Healer agents)
  web/        # Next.js 15 frontend (dashboard, triage, generation workbench, knowledge explorer)
```

## What's Implemented

### Phase Status

| Phase | Description               | Status         |
| ----- | ------------------------- | -------------- |
| 0     | Foundation                | ✅ Complete    |
| 1     | Ingestion & Knowledge     | ✅ Complete    |
| 2     | Execution                 | ✅ Complete    |
| 3     | Classification & Triage   | ✅ Complete    |
| 4     | Generation                | ✅ Complete    |
| 5     | Self-Healing              | ✅ Complete    |

### API (`packages/api/`)

| Module              | Endpoints / Features                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Auth**            | `POST /auth/register`, `POST /auth/login`, `GET /auth/profile` — JWT + bcrypt + RBAC guard                   |
| **Projects**        | Full CRUD — `POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`, `DELETE /projects/:id` |
| **Ingestion**       | `POST /ingestion/upload` (single), `POST /ingestion/upload-batch` (up to 50 files) — auto-detect asset type, SHA256 dedup, MinIO storage, Neo4j sync. Git webhook sync (`POST /ingestion/git-webhook/:projectId`). Jira import (`POST /ingestion/jira-import`, `POST /ingestion/jira-import-issue`) |
| **Knowledge**       | `GET /knowledge/graph/:projectId`, `/entities`, `/entity/:id`, `/search`, `/semantic-search`, `/traceability`, `/impact/:id`, `/stats/:projectId`, `/version/:id`, `/diff/:id` |
| **Execution**       | `POST /execution/runs` (create), `GET /execution/runs`, `GET /execution/runs/:id`, `GET /execution/runs/:id/results`, `GET /execution/results/:id`, `POST /execution/runs/:id/cancel`, `GET /execution/stats/:projectId`. WebSocket real-time progress via Socket.io |
| **Classification**  | `POST /classification/classify-run`, `GET /classification/summary/:runId`, `GET /classification/triage/:projectId`, `PATCH /classification/result/:resultId`, `POST /classification/bulk-reclassify`, `GET/POST/DELETE /classification/patterns` |
| **Generation**      | Create generation requests, list/view requests, review/approve/reject generated tests — integrates with LangGraph.js agent pipeline |
| **Healing**         | `POST /healing/heal-run`, proposals CRUD (`GET/PATCH`), `PATCH /healing/proposals/:id/review`, `POST /healing/proposals/bulk-review`, `POST /healing/proposals/:id/apply`, `POST /healing/proposals/:id/revert`, `GET/PATCH /healing/policy/:projectId`, `GET /healing/stats/:projectId` — policy-governed self-healing with cumulative limits and unstable test flagging |
| **Health**          | `GET /health` — PostgreSQL, Neo4j, Redis connectivity + latency                                              |
| **Audit**           | Automatic logging of all state changes (actor, action, before/after snapshots)                                |

**Asset Parsers:** Playwright tests, page objects, helpers, fixtures, requirements (Markdown, DOCX, PDF), and defects (Jira).

### Agent Orchestration (`packages/agents/`)

| Component              | Description                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| **Analyst Agent**      | Parses requirements and extracts testable acceptance criteria; LLM for complex cases, deterministic fallback |
| **Generator Agent**    | Produces Playwright test code from requirements using RAG context (page objects, helpers, fixtures, style exemplars) |
| **Reviewer Agent**     | Pre-review checklist: assertion checks, import validation, traceability, secret scanning + optional LLM quality assessment. Never auto-approves |
| **Generation Graph**   | LangGraph.js StateGraph: Analyst → Style Extraction → Generator → Post-Processing → Reviewer with checkpointed, auditable state transitions |
| **Post-Processor**     | Deterministic validation: import validation, assertion presence, traceability verification, secret scanning |
| **Style Extractor**    | Analyzes test exemplars to derive style profile (import style, assert type, naming conventions, page object patterns) |
| **Healer Agent**       | Diagnoses test failures (6 patterns: selector, strict-mode, navigation, frame-switch, wait-condition, element-structure), proposes minimal fixes with deterministic strategies + LLM fallback |
| **Healing Graph**      | LangGraph.js StateGraph: Diagnose → Generate Proposal → Validate with assertion immutability guard, policy engine, and syntax validation |
| **Policy Engine**      | 9-check healing policy evaluator: confidence threshold, run/test limits, exclusions, DOM/screenshot requirements, assertion guard, auto-approve eligibility |
| **Assertion Guard**    | Ensures business assertions are never rewritten — detects Playwright expect(), Jest assert, and all Playwright-specific matchers |
| **DOM Diff**           | Compares before/after DOM snapshots, detects element changes, suggests alternative selectors via text-match, test-id, and Jaccard bigram similarity |
| **LLM Service**        | LiteLLM proxy gateway client (OpenAI-compatible API) with deterministic stub fallback for dev    |

### Web Frontend (`packages/web/`)

| Page                        | Features                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| **Login**                   | Email/password authentication with redirect                                                      |
| **Dashboard**               | Stat cards (recent runs, pending reviews, test health %, generation requests), run history        |
| **Assets Management**       | Drag-and-drop upload, batch ingestion, project selector/creation, real-time progress              |
| **Knowledge Explorer**      | Interactive D3.js force-directed graph visualization, full-text & semantic search, entity detail panel, type filters, pan/zoom |
| **Traceability Matrix**     | Requirement-to-test coverage, partial/full indicators, per-requirement test list, coverage summary cards |
| **Execution**               | New run dialog (browser/env/grep/workers/shards), stats cards, paginated runs table, cancel action, 5s polling |
| **Execution Run Detail**    | WebSocket real-time updates, filter tabs (all/passed/failed/skipped), expandable results with error/stack, artifact buttons (trace/screenshot/log with presigned URLs) |
| **Test Generation**         | Generation request list, status filtering, React Query pagination, analysis details              |
| **Generation Detail**       | Code editor (Monaco), review workflow, approval/rejection UI, test result cards                   |
| **Failure Triage**          | Summary cards (6 metrics), confidence progress bar, classification filter tabs, selectable results table with detail panel, bulk reclassify dialog |
| **Self-Healing**            | Project selector, stat cards (proposals, pending, approved, applied, rejected, unstable tests), confidence bar, status filter tabs, proposals table with diff viewer, detail panel (unified diff, policy checks, evidence), approve/reject/apply/revert actions, bulk review |

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
**Versioning:** SHA-256 hash comparison on re-ingestion, version tracking with diff endpoints

### Failure Classification

- 14 built-in heuristic patterns: flake (4), environment (5), obsolete (1), regression (1)
- Priority-ranked matching with confidence scoring (0.6–0.95)
- Retry-aware flake detection
- Extensible custom pattern system (add/remove/disable via API)
- LLM fallback architecture ready for ambiguous failures

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
- **Human review required** — the Reviewer Agent never auto-approves generated tests

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
