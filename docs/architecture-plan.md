# Agentic AI Test Automation Platform: Architecture Plan

## Context

Design a multi-user, agentic test automation **platform** (not just a framework) for web applications. The platform enables collaborative ingestion of Playwright tests, page objects, fixtures, requirements, defects, and execution artifacts. It builds a knowledge model connecting all assets, generates tests from requirements, classifies failures, applies policy-governed self-healing, and requires human approval for high-risk changes. Greenfield repo at `/Users/garry1/agentic-ai`.

**Key constraints**: no opaque self-healing, no automatic rewriting of business assertions, all changes evidence-backed and reviewable, deterministic workflows preferred over LLM reasoning.

**Environment constraints**: Windows 11 only (all contributors and CI runners on Windows). Docker Compose on Docker Desktop, single-node deployment.

**Scope**: Proof of concept. 3 user roles only: Admin, SDET, Manual QA. Full persona set (Developer, PO, BA, CI Service Account) deferred to post-PoC. Focus on demonstrating the core value loop: ingest assets -> build knowledge model -> generate tests -> execute -> classify failures -> propose healing -> human review.

---

## Part 0: Critical Analysis

### Expert Questions

1. **Target scale?** Designing for a small team: <50 users, 1K-10K tests, 50-200 daily runs. Single-node deployment sufficient; no need for K8s or horizontal auto-scaling. All users on Windows 11.
2. **Which CI/CD systems?** Must be CI-agnostic via adapter layer (GitHub Actions, GitLab CI, Jenkins, Azure DevOps).
3. **LLM deployment model?** Pluggable gateway supporting both cloud APIs (Claude) and self-hosted (vLLM/Ollama).
4. **Risk appetite for autonomous action?** Configurable policy engine with conservative defaults (nothing auto-approved out of box).
5. **Who owns generated code?** Full provenance tracking: which human approved, which model version generated, what evidence was used.
6. **What if the platform is down?** Tests are standard Playwright files executable without the platform. Platform enhances, never gates.

### Challenged Assumptions

| Assumption                                    | Challenge                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Single knowledge model for all artifacts      | Must be a graph of typed references with vector+text search overlays, not a monolithic schema   |
| Self-healing is binary                        | Exists on a spectrum; needs formal taxonomy of change types with explicit risk levels           |
| "Generate maintainable tests" is well-defined | Maintainability is team-specific; must learn from existing conventions, not impose templates    |
| All personas want the same UI                 | PO reviewing coverage vs SDET debugging flakes are different workflows; role-adaptive views     |
| Deterministic always preferable               | Some workflows (NL parsing, visual regression) are inherently probabilistic; be honest about it |

### Failure Modes & Governance Risks

| Failure Mode                          | Mitigation                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM hallucination in test generation  | Traceability links + human review; test against known-good/bad app states                                                                      |
| Self-healing masks real regressions   | Healing never modifies assertions; healed tests require re-validation                                                                          |
| Knowledge graph goes stale            | Automated staleness detection, drift alerts, re-linking on modification                                                                        |
| Permission escalation (self-approve)  | Separation of duties: generator cannot be approver; immutable audit trail                                                                      |
| Vendor lock-in on LLM                 | LLM gateway abstraction with provider-agnostic prompts                                                                                         |
| Runaway compute costs                 | Token budgets per task, circuit breakers, cost attribution                                                                                     |
| Data exfiltration through LLM         | Data classification, sensitive code redaction, self-hosted model support                                                                       |
| Platform becomes bottleneck           | Offline-first: tests are standard Playwright files runnable without platform                                                                   |
| WSL2/Docker Desktop issues on Windows | Playwright can also run natively on Windows 11 as fallback; document WSL2 setup requirements; test Docker Compose on fresh Windows 11 installs |
| Windows path/line-ending issues       | Enforce LF line endings via `.gitattributes`; use path normalization in all file-handling code; test all parsers with Windows-style paths      |

---

## Part 1: User Personas & Permissions Model

### Personas (PoC scope: 3 roles)

| Persona       | Primary Workflows                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Admin**     | User/role management, project config, healing policy config, audit logs, system health. Has all SDET capabilities plus platform administration.                                                        |
| **SDET**      | Manage page objects/helpers/fixtures, configure execution, define healing policies, upload/edit tests and requirements, review ALL generated tests and healings (including high-risk), triage failures |
| **Manual QA** | Upload tests and requirements, review AI-generated tests, triage failures, approve low-risk healings, view execution results and traceability                                                          |

_Post-PoC roles (deferred)_: Developer (test impact for PRs), Product Owner (requirement coverage), Business Analyst (story validation), CI/CD Service Account (automated pipeline triggers).

### RBAC Matrix (PoC: 3 roles)

| Capability                 | Admin | SDET | Manual QA |
| -------------------------- | ----- | ---- | --------- |
| Manage users/roles         | W     | -    | -         |
| Configure project settings | W     | W    | -         |
| Configure healing policies | W     | W    | R         |
| Configure execution infra  | W     | W    | -         |
| Upload/edit requirements   | W     | W    | W         |
| Upload/edit tests          | W     | W    | W         |
| Upload/edit page objects   | W     | W    | R         |
| Approve generated tests    | W     | W    | W         |
| Approve high-risk healings | W     | W    | -         |
| Approve low-risk healings  | W     | W    | W         |
| Trigger test execution     | W     | W    | W         |
| View execution results     | W     | W    | W         |
| View traceability          | W     | W    | W         |
| View audit logs            | W     | W    | R         |

(W = Write/Execute, R = Read-only, - = No Access)

**Implementation**: Simple JWT-based auth with local user store (email/password) for PoC. Keycloak/Auth0 integration deferred to post-PoC. API keys for future CI/CD integration.

---

## Part 2: Reference Architecture

```
              All services run via Docker Compose on Windows 11
              (single host or small VM cluster; no K8s required)

          +---------+---------+          +----------+----------+
          |    Web Frontend   |          |   Nginx Reverse     |
          |  (Next.js 15)    |          |   Proxy             |
          +-------------------+          +----------+----------+
                                                    |
          +--------------------+--------------------+--------------------+
          |                    |                    |                    |
+---------+---------+ +--------+--------+ +--------+--------+ +--------+--------+
|  Core API Service | | Ingestion Svc   | | Execution Svc   | | Agent Orchestr. |
|  (NestJS)         | | (NestJS)        | | (NestJS)        | | (LangGraph.js)  |
+---------+---------+ +---------+-------+ +---------+-------+ +--------+--------+
          All services in TypeScript — single monorepo, no Python
          |                     |                   |                   |
          +----------+----------+-------------------+-------------------+
                     |                              |
          +----------+----------+        +----------+----------+
          |    PostgreSQL 16    |        |    Redis (single)   |
          |  (relational data,  |        |  (Cache, Sessions,  |
          |   auth, audit logs) |        |   Pub/Sub, BullMQ)  |
          +---------------------+        +---------------------+
                     |
          +----------+----------+
          |    Neo4j 5.x       |
          |  (knowledge graph,  |
          |   vector search,    |
          |   traceability)     |
          +---------------------+
                     |
          +----------+----------+        +---------------------+
          |   Object Storage    |        |   LLM Gateway       |
          |  (MinIO or local   |        |   (LiteLLM Proxy)   |
          |   filesystem)      |        +---------------------+
          +---------------------+            |             |
                                     +-------+--+  +-------+------+
                                     | Claude   |  | Self-hosted   |
          +---------------------+    | API      |  | (Ollama on    |
          | Execution Workers   |    +----------+  |  Windows)     |
          | (Docker containers  |                  +---------------+
          |  via Docker Compose |
          |  on Windows 11)    |
          +---------------------+
```

### Services

- **Web Frontend** (Next.js 15 + App Router): SSR, React Server Components, shadcn/ui, Monaco Editor, TanStack Query
- **Nginx Reverse Proxy**: TLS termination, routing, rate limiting (replaces heavyweight API gateway — Kong is overkill for <50 users)
- **Core API** (NestJS/TS): CRUD, RBAC middleware, GraphQL + REST, WebSocket for realtime, OpenAPI 3.1
- **Ingestion Service** (NestJS): File upload, AST parsing, doc extraction, embedding generation, job queuing
- **Execution Service** (NestJS): Run orchestration, sharding across Docker containers, artifact collection, CI/CD webhooks
- **Agent Orchestrator** (LangGraph.js / `@langchain/langgraph`): AI agent workflows, checkpointing, token budgets — runs as a NestJS module, no gRPC bridge needed

### Data Layer

- **PostgreSQL 16** (+ pg_trgm for fuzzy text search): Relational data — users, roles, projects, execution runs, test results, healing proposals, generation requests, audit logs. Single instance sufficient for PoC.
- **Neo4j 5.x**: Knowledge graph — all domain entities (requirements, test cases, page objects, helpers, fixtures, defects) as nodes with typed relationships. Native vector search index for semantic retrieval. Cypher for traceability queries and impact analysis. Neo4j Browser available for dev/debug visualization.
- **Redis** (single instance): BullMQ queues (`ingestion`, `generation`, `healing`, `analysis`, `execution`), sessions, pub/sub
- **MinIO or local filesystem**: Traces, screenshots, DOM snapshots, uploaded documents (S3-compatible API for future cloud migration)
- **Sync strategy**: When entities are created/updated via the API (PostgreSQL), events are published to a BullMQ queue that updates the corresponding Neo4j nodes/relationships. Neo4j is the read-optimized graph view; PostgreSQL is the transactional source of truth for operational data.

### Infrastructure & Windows 11 Considerations

- **Docker Desktop for Windows** with WSL2 backend — all services containerized via Docker Compose
- **No Kubernetes**: Docker Compose scaling (`docker compose up --scale execution-worker=4`) sufficient for <50 users and <200 daily runs
- **Test execution workers**: Playwright official Docker images (Linux containers on Windows via WSL2). Playwright natively supports Windows but containers provide isolation and reproducibility
- **Self-hosted LLM option**: Ollama runs natively on Windows 11 (no Docker needed for this)
- **Observability**: OpenTelemetry + Prometheus + Grafana (all run in Docker Compose; lightweight stack)
- **Secrets**: Docker secrets or `.env` files for small deployment; Vault only if security policy requires it
- **CI runners**: GitHub Actions Windows runners, or self-hosted Windows 11 runners with Docker

---

## Part 3: Agent Roles & Orchestration

### Five Specialized Agents

| Agent          | Purpose                                                                           | LLM Usage                                        | Key Constraint                                                                    |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Analyst**    | Parse requirements, extract acceptance criteria, map to testable scenarios        | Yes (NLU, entity extraction)                     | Deterministic fallback for structured formats (Gherkin)                           |
| **Generator**  | Produce Playwright tests from requirements using existing POs/helpers/conventions | Yes (code gen with RAG)                          | Never generates business assertions without explicit AC; always uses existing POs |
| **Healer**     | Propose narrowly scoped fixes to failing tests (locators, waits, nav paths)       | Yes, but only after deterministic analysis fails | Cannot modify assertions or test flow logic; policy-governed                      |
| **Classifier** | Classify failures: regression, flake, environment, obsolete                       | Conditional (deterministic heuristics first)     | LLM only for ambiguous cases                                                      |
| **Reviewer**   | Pre-review AI-generated/healed artifacts before human review                      | Yes (code review reasoning)                      | Checklist-based; flags issues but never auto-approves                             |

### Orchestration (LangGraph)

```
                    +-------------------+
                    |  Supervisor Node  |
                    | (Route + Budget)  |
                    +--------+----------+
                             |
           +-----------------+-----------------+
           |                 |                 |
    [Ingestion Subgraph]  [Generation Subgraph]  [Failure Subgraph]
           |                 |                    |
      Analyst Agent     Generator Agent      Classifier Agent
                             |                    |
                        Reviewer Agent        Healer Agent
                                                  |
                                             Reviewer Agent
```

- **Supervisor**: Routes tasks, enforces token budgets, implements circuit breakers (fail N times = halt + escalate)
- **State**: LangGraph threads with checkpointed state persisted to PostgreSQL for full auditability and replay
- **Communication**: Direct TypeScript function calls — LangGraph.js runs as a NestJS module within the same process, no inter-process communication needed

---

## Part 4: Ingestion Pipeline

```
Upload/API/Webhook --> Intake Router (type detection) -->
  TS/JS Parser (AST) | Markdown/Doc Parser | Trace Parser | Image Proc | Jira Adapter
    --> Normalization Layer (entity extraction, relationship detection, metadata enrichment)
      --> Knowledge Graph (AGE) + Vector Index (pgvector) + Full-Text Index (pg_trgm)
```

### By Asset Type

- **Playwright Tests**: TS Compiler API AST extraction -> test names, describe blocks, assertions, PO imports, fixtures, locators, `@requirement` annotations
- **Page Objects/Helpers**: AST -> class names, method signatures, locator definitions -> "selector registry" mapping strategies to pages/components
- **Fixtures**: Name, scope, provides, dependencies
- **Requirements (MD/DOCX/PDF/Gherkin)**: Parse + Analyst Agent for AC extraction, testable assertion identification, requirement-to-test mapping suggestions
- **Defects (Jira/API)**: Map to internal schema, link to tests by explicit links + semantic similarity + component overlap
- **Execution Artifacts**: Traces (extract action traces, network, console), screenshots (metadata-tagged), DOM snapshots (indexed for Healer), logs (error pattern parsing)

### Versioning & Provenance

Every asset gets: content-addressed SHA-256 hash, monotonic version number, ingestion record (who/when/channel/status), immutable audit entry. Old versions soft-deleted with TTL.

### Sync Modes

- **Bulk**: ZIP upload or Git repo clone, parallel processing via BullMQ
- **Incremental**: Git webhook triggers differential ingestion
- **Scheduled**: Cron-based re-sync as fallback

---

## Part 5: UI/Workbench Design

### Key Screens (PoC: 7 screens)

1. **Dashboard** (role-adaptive): Manual QA sees failure triage queue + pending reviews; SDET sees system health + policy alerts; Admin sees user management + audit summary
2. **Knowledge Explorer**: Interactive graph (D3.js/vis.js), filter by entity type, click for detail panel, impact analysis mode, traceability matrix
3. **Asset Detail View**: Split-pane (source + metadata/relationships), Monaco editor for code, version diff, relationship panel, actions (Edit, Review, Generate, Link)
4. **Test Generation Workbench**: Select requirements + POs + helpers, configure generation, preview with inline annotations, side-by-side with existing tests, approve/edit/reject
5. **Failure Triage Dashboard**: Queue with classification labels + confidence, evidence panel (error, trace, screenshot, DOM diff), healing proposals with approve/reject, bulk actions
6. **Healing Review Panel**: Unified diff, evidence (before/after DOM/screenshots), explanation + confidence + risk, policy compliance checklist, approve/reject/modify/escalate
7. **Execution Management**: Configure runs (suite, env, browsers), real-time progress, results breakdown, artifact browser

_Deferred to post-PoC_: Analytics & Reporting dashboard, detailed Administration UI (PoC uses a simple admin settings page).

---

## Part 6: Data Model (Dual-Store: PostgreSQL + Neo4j)

### PostgreSQL Tables (operational/transactional data)

- **User**: id, email, password_hash, name, role (admin/sdet/manual_qa), status, created_at
- **Project**: id, name, slug, git_repos (jsonb[]), settings (jsonb)
- **ExecutionRun**: id, project_id, triggered_by, trigger_source, ci_build_id, git_commit, git_branch, environment, browser_config (jsonb), shard_count, status, pass/fail/skip/flaky counts, duration_ms
- **TestResult**: id, run_id, test_case_id (references Neo4j node ID), status, retry_count, duration_ms, error_message, stack_trace, failure_classification, classification_confidence, artifact URLs (screenshot, trace, DOM, log), shard_index
- **HealingProposal**: id, test_result_id, test_case_id, change_type, risk_level, original_code, proposed_code, unified_diff, explanation, confidence_score, evidence (jsonb), status, reviewed_by, policy_checks (jsonb)
- **GenerationRequest**: id, project_id, requested_by, requirement_ids[], page_object_ids[], style_exemplar_ids[], config (jsonb), status, generated_test_ids[], llm_model_used, token_usage (jsonb)
- **AuditLog**: id, project_id, actor_id, actor_type (human/system/agent), action, entity_type, entity_id, before_state (jsonb), after_state (jsonb), metadata (jsonb), created_at (immutable, append-only)

### Neo4j Knowledge Graph (domain entities + relationships + vector search)

**Node types:**

```cypher
(:Requirement {id, projectId, externalId, title, body, type, status, priority, ownerId, version, embedding})
(:TestCase {id, projectId, filePath, fileHash, title, describeBlock, testType, status, origin, confidenceScore, version, sourceContent, astSummary, locatorsUsed, fixturesUsed, embedding})
(:PageObject {id, projectId, filePath, fileHash, className, methods, selectors, version, sourceContent, embedding})
(:Helper {id, projectId, filePath, exportedFunctions, version, sourceContent})
(:Fixture {id, projectId, name, filePath, scope, provides, dependencies, version, sourceContent})
(:Defect {id, projectId, externalId, title, description, severity, status, affectedComponent, embedding})
```

**Relationship types:**

```cypher
(:Requirement)-[:COVERED_BY {linkOrigin, confidence}]->(:TestCase)
(:Requirement)-[:PARTIALLY_COVERED_BY {linkOrigin, confidence}]->(:TestCase)
(:TestCase)-[:USES_PAGE_OBJECT]->(:PageObject)
(:TestCase)-[:USES_HELPER]->(:Helper)
(:TestCase)-[:USES_FIXTURE]->(:Fixture)
(:Requirement)-[:BLOCKED_BY]->(:Defect)
(:Requirement)-[:RELATED_TO]->(:Defect)
(:TestCase)-[:EXPOSED]->(:Defect)
(:Requirement)-[:PARENT_OF]->(:Requirement)
(:Requirement)-[:DEPENDS_ON]->(:Requirement)
(:PageObject)-[:EXTENDS]->(:PageObject)
(:PageObject)-[:USES]->(:PageObject)
```

**Vector search index** (Neo4j native, since 5.11):

```cypher
CREATE VECTOR INDEX requirement_embedding FOR (r:Requirement) ON (r.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}

CREATE VECTOR INDEX testcase_embedding FOR (t:TestCase) ON (t.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}
```

**Full-text index** (Neo4j native):

```cypher
CREATE FULLTEXT INDEX requirement_fulltext FOR (r:Requirement) ON EACH [r.title, r.body]
CREATE FULLTEXT INDEX testcase_fulltext FOR (t:TestCase) ON EACH [t.title, t.sourceContent]
```

### Retrieval Strategy

Three modes combined, all served by Neo4j:

1. **Exact match**: Cypher queries with property filters (by project, status, type)
2. **Full-text search**: Neo4j native full-text index with Lucene scoring
3. **Semantic search**: Neo4j vector search index for natural language queries ("find tests related to user login flow")
4. **Graph traversal**: Cypher path queries for traceability and impact analysis (e.g., "which requirements are affected if this page object changes?" → `MATCH (po:PageObject {id: $id})<-[:USES_PAGE_OBJECT]-(t:TestCase)<-[:COVERED_BY]-(r:Requirement) RETURN r`)

For agent workflows (generation, healing), retrieval combines all four: exact match for scoping, semantic search for style exemplars, full-text for keyword matching, and graph traversal for transitively related assets.

---

## Part 7: Generation Strategy

### Pipeline: Requirement -> Context Assembly -> Style Extraction -> Prompt Construction -> LLM Generation -> Post-Processing -> Reviewer Agent -> Human Review

**Context Assembly**: Retrieve full requirement + related requirements (graph), existing covering tests (avoid duplication), matching page objects (by URL/component pattern), relevant helpers and fixtures.

**Style Extraction**: Select 2-3 existing tests as style exemplars (semantic similarity + recency). Extract style profile: import organization, describe/test structure, assertion style, PO usage patterns, naming conventions, comment density, test.step usage.

**Prompt Structure**: System prompt defining conventions, requirement text, numbered acceptance criteria, available PO method signatures, helper signatures, fixture definitions, existing tests to avoid duplication. Instruction to use `// @covers AC-{n}` annotations and `test.step()` for readability. TODO comments for missing PO methods.

**Post-Processing (Deterministic)**:

1. `tsc --noEmit` compilation check
2. Import resolution validation
3. Selector validation (all selectors exist in referenced POs)
4. Assertion presence check (>=1 per test)
5. Traceability check (every AC has >=1 covering test)
6. ESLint check
7. Secret/hardcoded data scan

**Human Review**: Approve / Edit+Approve / Request regeneration with feedback / Reject with reason. Only approved tests become "active".

---

## Part 8: Self-Healing Policy

### Healing Taxonomy

| Change Type              | Risk          | Auto-Heal Eligible     | Example                     |
| ------------------------ | ------------- | ---------------------- | --------------------------- |
| Selector update          | Low           | Yes (if policy allows) | `data-testid` value changed |
| Wait condition           | Low           | Yes (if policy allows) | Add `waitForLoadState`      |
| Frame/iframe switch      | Medium        | Requires review        | New iframe wrapper          |
| Navigation path change   | Medium        | Requires review        | URL path changed            |
| Element structure change | High          | Requires SDET review   | Form restructured           |
| **Business assertion**   | **FORBIDDEN** | **Never**              | Expected text/count/state   |
| **Test flow logic**      | **FORBIDDEN** | **Never**              | Step order, conditionals    |

### Policy Engine (configurable per project)

```typescript
interface HealingPolicy {
  enabled: boolean;
  maxHealingsPerRun: number; // Circuit breaker (default: 10)
  maxHealingsPerTest: number; // Default: 2
  minConfidenceThreshold: number; // Default: 0.7
  rules: {
    selector_update: {
      autoApproveThreshold: number;
      requireReview: boolean;
      allowedReviewers: Role[];
    };
    wait_condition: {
      /* same */
    };
    navigation_path: {
      /* same */
    };
    // ...
  };
  excludedTests: string[];
  excludedSelectors: string[];
  requireDomSnapshot: boolean;
  requireScreenshot: boolean;
}
```

**Default**: `autoApproveThreshold: 0` for all types (nothing auto-approved). `requireReview: true` for all.

### Healing Process

1. Test fails -> Classifier says "not a regression"
2. Evidence gathered: error, stack, DOM snapshot, screenshot, trace, test source, PO source, app diff
3. **Deterministic analysis first**: matching testid elsewhere in DOM, ARIA-based selector fallback, timeout heuristics
4. **LLM analysis only if deterministic inconclusive**
5. Policy engine validates proposal against rules
6. Route: auto-approve (if enabled + high confidence) OR human review queue OR reject
7. **Post-healing validation**: re-execute healed test; if still fails, auto-revert

### Guardrails

- **Assertion immutability**: AST parser marks all `expect()` nodes as immutable; diffs touching them are rejected at code level
- **Blast radius**: Max 1 file per healing proposal
- **Auto-revert**: Healing reverted if test fails within N subsequent runs
- **Cumulative limit**: Test healed >M times in window -> flagged "unstable", removed from healing eligibility

---

## Part 9: Review & Approval Workflow

### Generated Test Review

Generator -> Reviewer Agent pre-check -> Review queue -> Assigned reviewer (by component ownership or manual) -> Approve / Edit+Approve / Request changes / Reject -> Audit log

### Healing Approval

Healer -> Policy engine -> [auto-approve if eligible] OR review queue -> Reviewer sees diff + evidence + explanation + confidence + policy compliance -> Approve / Reject / Modify -> Post-apply validation (re-execute; revert on failure)

### Separation of Duties

- Generator cannot be sole approver of their generation request
- High-risk healings require SDET role
- High-risk changes require step-up re-authentication

### Notifications

- In-app (WebSocket), email digests, Slack/Teams webhooks
- SLA escalation: unacted review >24h -> escalate to team lead

---

## Part 10: Metrics & Evaluation Harness

### Platform Effectiveness

| Metric                                    | Target                   |
| ----------------------------------------- | ------------------------ |
| Generation acceptance rate (no edits)     | >60% at maturity         |
| Healing accuracy (valid after 7 days)     | >90%                     |
| Healing revert rate                       | <5%                      |
| Classification accuracy vs human override | >85%                     |
| Mean time to triage                       | <30 min (auto)           |
| Mean time to heal (with review)           | <2 hrs                   |
| Coverage completeness                     | >80% requirements linked |
| Flake rate                                | <3%                      |

### AI Evaluation

- **Generation**: Mutation testing against intentionally broken app, Istanbul coverage comparison, AST-based style conformance scoring
- **Healing**: Shadow validation (run fix against current DOM before proposing), regression detection (full suite post-heal), historical accuracy tracking
- **Classification**: Confusion matrix, human override rate tracking

### Dashboards (PoC)

Basic metrics displayed in-app on the Dashboard screen. Grafana integration deferred to post-PoC. Key PoC metrics to track: generation acceptance rate, healing accuracy, classification accuracy, basic pass/fail/flake rates per run.

---

## Part 11: Phased Delivery Roadmap

### PoC Roadmap (compressed; 3 roles, Windows 11, Docker Compose)

| Phase                          | Weeks | Milestone                            | Key Deliverables                                                                                                                                                                                                                                                               |
| ------------------------------ | ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0: Foundation**              | 1-4   | Core infra running on Windows 11     | Monorepo (Turborepo), PG schema + migrations (Drizzle), NestJS API with JWT auth (local user store, 3 roles), RBAC middleware, audit logging, Next.js app shell + shadcn/ui design system, Redis + BullMQ, MinIO, **Docker Compose** (all services), basic CI (GitHub Actions) |
| **1: Ingestion & Knowledge**   | 5-10  | Assets ingested, indexed, searchable | TS AST parser (tests, POs, helpers, fixtures), Markdown/Gherkin parser, embedding pipeline, file upload API + UI, Git repo sync, knowledge graph (entities + relationships), Knowledge Explorer UI (graph + search + detail), traceability matrix, versioning                  |
| **2: Execution**               | 8-12  | Tests executable with results        | Execution service, Docker Compose worker scaling, Playwright in Docker (WSL2) or native Windows, artifact collection (traces, screenshots, logs to MinIO), results API + UI, embedded Trace Viewer, real-time progress (WebSocket)                                             |
| **3: Classification + Triage** | 11-15 | Failures classified and triageable   | Classifier Agent (deterministic heuristics + LLM fallback), flake/env pattern DB, failure triage dashboard, bulk triage actions, classification confidence display                                                                                                             |
| **4: Generation**              | 13-19 | Tests generated with human review    | LangGraph.js orchestrator (NestJS module), Analyst + Generator + Reviewer Agents (all TypeScript), LiteLLM gateway, style extraction from existing tests, generation workbench UI, approve/edit/reject workflow                                                                |
| **5: Self-Healing**            | 17-22 | Healing proposals with policy gates  | Healer Agent, healing policy engine, healing review UI (diff + evidence), post-heal validation + auto-revert, assertion immutability enforcement                                                                                                                               |

**Total PoC: ~22 weeks**

### Post-PoC Phases (deferred)

| Phase                     | Scope                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| **Analytics & Reporting** | Full metrics dashboard, mutation testing evaluation, coverage gap analysis, exportable reports      |
| **Extended Roles**        | Developer (PR test impact), PO (requirement coverage), BA (story validation), CI/CD Service Account |
| **Notifications**         | Email digests, Slack/Teams webhooks, SLA escalation                                                 |
| **Enterprise**            | Keycloak/Auth0 SSO, SAML/SCIM, self-hosted LLM, custom ABAC roles, data retention                   |

---

## Technology Stack Summary

| Layer                    | Technology                                                                        |
| ------------------------ | --------------------------------------------------------------------------------- |
| Frontend                 | Next.js 15, React 19, TypeScript, shadcn/ui, TanStack Query, Monaco Editor, D3.js |
| API                      | NestJS (TypeScript), GraphQL + REST, Socket.io                                    |
| Agent Orchestration      | LangGraph.js (@langchain/langgraph — TypeScript, no Python needed)                |
| LLM Gateway              | LiteLLM Proxy                                                                     |
| Relational DB            | PostgreSQL 16 + pg_trgm (users, execution data, audit, proposals)                 |
| Knowledge Graph + Vector | Neo4j 5.x (domain entities, relationships, vector search, full-text)              |
| Cache/Queue              | Redis (single instance) + BullMQ                                                  |
| Object Storage           | MinIO (or local filesystem; S3-compatible API)                                    |
| ORM                      | Drizzle ORM                                                                       |
| Auth                     | Keycloak (self-hosted) or Auth0 (managed)                                         |
| AST Parsing              | TypeScript Compiler API                                                           |
| Test Execution           | Playwright (Docker containers via WSL2, or native Windows 11 execution)           |
| Deployment               | Docker Compose on Windows 11 (Docker Desktop + WSL2)                              |
| Observability            | OpenTelemetry + Prometheus + Grafana + Loki                                       |

---

## Critical Files (to create)

- `packages/api/src/modules/database/pg-schema.ts` - PostgreSQL schema (Drizzle ORM — users, execution runs, results, proposals, audit)
- `packages/api/src/modules/knowledge-graph/neo4j-schema.cypher` - Neo4j constraints, indexes, vector indexes
- `packages/api/src/modules/knowledge-graph/neo4j.service.ts` - Neo4j driver wrapper and typed Cypher query methods
- `packages/agents/src/orchestrator/orchestrator.graph.ts` - LangGraph.js supervisor (TypeScript)
- `packages/api/src/modules/ingestion/parsers/playwright-ast-parser.ts` - TS AST parser
- `packages/agents/src/healer/healing-policy-engine.ts` - Policy engine
- `packages/web/src/app/(dashboard)/triage/page.tsx` - Failure triage dashboard
- `docker-compose.yml` - All services including Neo4j, PostgreSQL, Redis, MinIO

## Verification (all on Windows 11 with Docker Desktop)

- **Phase 0**: `docker compose up` on Windows 11 starts all services; API healthcheck returns 200; create Admin/SDET/QA users; login with each role; verify RBAC restrictions
- **Phase 1**: Upload a Playwright test file + page object + Markdown requirement; verify all appear in Knowledge Explorer with parsed metadata, relationships, and search works
- **Phase 2**: Trigger a test run from UI; verify execution completes, artifacts (traces, screenshots) stored in MinIO and viewable in UI
- **Phase 3**: Inject a known flaky test; verify Classifier labels it correctly; verify triage dashboard displays classification with evidence
- **Phase 4**: Create a requirement with ACs; generate a test; verify it compiles, uses existing POs, has traceability annotations; approve through review workflow
- **Phase 5**: Break a selector in the target app; verify Healer proposes a diff that doesn't touch assertions; verify policy gate blocks auto-approve; approve manually; verify healed test passes on re-run
- **End-to-end PoC demo**: Walk through the complete loop with all 3 roles — Admin configures project, SDET uploads POs/fixtures and configures healing policy, Manual QA uploads requirements and triggers generation, all three review and approve, execute, triage, heal
