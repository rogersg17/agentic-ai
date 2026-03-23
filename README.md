# Agentic Test Automation Platform

**An AI-powered platform that helps teams write, run, and fix automated tests for web applications — with human oversight every step of the way.**

---

## What Is This?

When companies build websites or web apps, they use **automated tests** — small programs that click through pages, fill in forms, and check that everything works correctly. Keeping these tests up to date is a huge time sink: pages change, buttons move, and tests break constantly.

This platform uses **AI to do the heavy lifting** while keeping humans in control:

1. **Upload your project files** — tests, requirements documents (Word, PDF, Markdown), even Jira tickets.
2. **The platform builds a "knowledge map"** connecting requirements to tests, pages, and past failures so you can see what's covered and what's missing.
3. **AI writes new tests** from your requirements — but a human must review and approve every one before it's used.
4. **Run your tests** and get real-time results in a dashboard.
5. **When tests break**, the AI figures out *why* (flaky environment? changed button? real bug?) and sorts failures for you.
6. **AI proposes fixes** for broken tests — but it never changes the important checks (the "business assertions") and every fix must be reviewed by a person.

Everything is logged in a full **audit trail** so you always know who did what and why.

---

## Who Is This For?

The platform supports three roles:

| Role | What they do |
|------|-------------|
| **Admin** | Manages users, projects, and platform settings. Has full access to everything. |
| **SDET** (Test Engineer) | Uploads test files, configures test runs, reviews AI-generated tests and fixes, triages failures. |
| **Manual QA** | Uploads requirements, reviews AI-generated tests, views results and traceability reports. |

---

## Key Principles

- **No black-box changes** — every AI suggestion comes with evidence and must be reviewed by a human.
- **Important checks are never auto-rewritten** — AI can fix *how* a test navigates a page but will never silently change *what* it's checking for.
- **Full audit trail** — every generated test, proposed fix, approval, and rejection is recorded.
- **Your tests remain yours** — tests are standard files that still work without the platform. The platform enhances your workflow; it doesn't lock you in.

---

## What You'll See in the Dashboard

| Screen | What it shows |
|--------|--------------|
| **Dashboard** | Overview of recent test runs, pending reviews, and overall test health percentage. |
| **Assets** | Drag-and-drop file upload for tests, requirements, and page definitions. |
| **Knowledge Explorer** | An interactive visual map showing how requirements, tests, and pages connect to each other. |
| **Traceability Matrix** | A table showing which requirements have tests and which ones still need coverage. |
| **Execution** | Start test runs, watch progress in real time, and view pass/fail results. |
| **Test Generation** | See AI-generated tests, review the code, and approve or reject them. |
| **Failure Triage** | When tests fail, this screen sorts them by cause (environment issue, flaky test, real bug, etc.) with confidence scores. |
| **Self-Healing** | View proposed fixes for broken tests, see exactly what changed, and approve, reject, apply, or revert each one. |

---

## Getting Started

### What You'll Need

Before you begin, make sure you have these installed on your computer:

1. **Node.js** (version 22 or newer) — [Download here](https://nodejs.org/)
2. **Docker Desktop** — [Download here](https://www.docker.com/products/docker-desktop/) — this runs the databases and supporting services in the background.
3. **npm** (version 11 or newer) — this comes bundled with Node.js.
4. **Git** — to clone the repository. [Download here](https://git-scm.com/) if you don't already have it.

### Step-by-Step Setup

Open a **terminal** (Terminal on Mac, Command Prompt or PowerShell on Windows) and run these commands one at a time:

```bash
# 1. Clone the repository (download the project files)
git clone <repository-url>
cd agentic-ai

# 2. Install all dependencies (libraries the project needs)
npm install

# 3. Create your local settings file
cp .env.example .env
#    On Windows Command Prompt, use: copy .env.example .env

# 4. Start the background services (databases, file storage, etc.)
#    Make sure Docker Desktop is running first!
docker compose up -d

# 5. Set up the database tables
npm run -w @agentic/api db:migrate

# 6. Start the platform
npm run dev
```

### Opening the Platform

Once everything is running, open your web browser and go to:

| What | Address |
|------|---------|
| **Platform UI** (main interface) | http://localhost:3000 |
| **API documentation** (technical reference) | http://localhost:3001/api/docs |

Register an account from the login page and you're ready to go!

### Stopping the Platform

To stop everything:

1. Press `Ctrl + C` in the terminal where you ran `npm run dev`.
2. Stop the background services:
   ```bash
   docker compose down
   ```

---

## How It Works (The Big Picture)

```
  You upload files          AI builds a            AI writes new tests
  (tests, requirements,     knowledge map          from your requirements
   page objects, Jira)       connecting them all     ──────────────────►  Human reviews
        │                        │                                        & approves
        ▼                        ▼                                            │
  ┌──────────┐           ┌──────────────┐        ┌──────────────┐            ▼
  │  Upload   │──────────►│  Knowledge   │───────►│  Generation  │───►  Approved tests
  │  & Ingest │           │  Graph       │        │  (AI Agents) │      are saved
  └──────────┘           └──────────────┘        └──────────────┘
                                │                                            │
                                ▼                                            ▼
                         ┌──────────────┐        ┌──────────────┐    ┌──────────────┐
                         │  Traceability │        │  Execution   │───►│  Failure      │
                         │  Reports      │        │  (Run Tests) │    │  Triage (AI)  │
                         └──────────────┘        └──────────────┘    └──────┬───────┘
                                                                           │
                                                                           ▼
                                                                    ┌──────────────┐
                                                                    │  Self-Healing │
                                                                    │  (AI proposes │───► Human reviews
                                                                    │   fixes)      │     & approves
                                                                    └──────────────┘
```

---

## Complete Workflow Guide

This section walks you through everything you can do with the platform, step by step.

### Step 1: Create a Project and Upload Your Files

**Where:** Dashboard → **Assets** page

Before the platform can help you, it needs to know about your web application. You do this by uploading files that describe your app and its requirements.

#### What you can upload

| File type | What it is | Examples |
|-----------|-----------|---------|
| **Requirements** | Documents describing what your app should do | Word docs (`.docx`), PDFs (`.pdf`), Markdown files (`.md`), Gherkin feature files (`.feature`) |
| **Tests** | Existing automated test scripts | Playwright test files (`.spec.ts`, `.test.ts`) |
| **Page objects** | Descriptions of web pages and their interactive elements | TypeScript classes that map page elements (`.ts`) |
| **Helpers** | Reusable utility code used across tests | TypeScript utility files (`.ts`) |
| **Fixtures** | Test setup/teardown code and shared test state | Playwright fixture files (`.ts`) |

#### How to upload

1. Open the **Assets** page from the sidebar.
2. **Select a project** using the dropdown at the top, or click **"New Project"** to create one.
3. **Drag and drop** your files into the upload zone — or click **"browse"** to select them from your file explorer. You can upload up to 50 files at once.
4. The platform **automatically detects** what kind of file each one is (test, requirement, page object, etc.) — you don't need to label them.
5. After upload, you'll see a confirmation for each file showing:
   - The file path
   - What type of asset it was detected as (e.g., "test", "requirement")
   - How many entities were extracted (e.g., a requirements doc might contain 5 separate requirements)

#### What happens behind the scenes

When you upload a file, the platform:

- **Parses the content** — for example, a Word document is broken into individual requirements; a test file is analyzed to find each test case and what pages/helpers it uses.
- **Stores the file** securely in the platform's file storage.
- **Adds it to the knowledge graph** — a map that connects requirements to tests, tests to pages, and so on. This is what powers traceability and test generation.
- **Detects duplicates** — if you upload the same file again, it recognizes unchanged content (via file fingerprinting) and skips re-processing.

> **Tip:** You can also connect a **Git repository** so that files sync automatically when code changes, or import issues directly from **Jira**.

---

### Step 2: Explore the Knowledge Map

**Where:** Dashboard → **Knowledge Explorer** page

After uploading files, the platform builds a visual map showing how everything connects.

#### What you'll see

- An **interactive graph** where each circle (node) represents an entity — a requirement, test, page object, helper, fixture, or defect. Each type has a different color.
- **Lines between nodes** show relationships — for example, a test "covers" a requirement, or "uses" a page object.
- A **search bar** to find specific items by name.
- **Type filters** — toggle which entity types are visible (e.g., show only requirements and tests).

#### How to use it

1. **Pan and zoom** — drag to move around, scroll to zoom in/out.
2. **Click a node** to select it — a detail panel appears showing the entity's title, file path, properties, and all its connections.
3. **Search** for a specific requirement or test by typing its name.
4. **Filter** by entity type using the toggle buttons to reduce clutter.

This view is especially useful for understanding your test coverage at a glance — you can quickly see which requirements have tests connected to them and which ones are orphaned.

---

### Step 3: Check Traceability (Coverage Gaps)

**Where:** Dashboard → **Traceability Matrix** page

This page gives you a structured table view of which requirements have automated tests and which ones don't.

#### What you'll see

- **Summary cards** at the top:
  - Total number of requirements
  - How many are **covered** (have associated tests) ✅
  - How many are **partially covered** (some acceptance criteria tested) ⚠️
  - How many are **uncovered** (no tests at all) ❌
- A **coverage percentage bar** showing overall test coverage.
- A **table** listing every requirement, its coverage status, and which test cases are linked to it.

#### How to use it

1. Select your project from the dropdown.
2. Scan the summary cards to understand your coverage at a glance.
3. Look at the **uncovered** requirements — these are prime candidates for AI test generation (Step 4).
4. Click any requirement row to expand it and see the specific test cases covering it.

---

### Step 4: Generate Tests from Requirements (AI-Powered)

**Where:** Dashboard → **Test Generation** page

This is where the AI creates new automated tests based on your requirements — no coding required from you.

#### How to generate tests

1. Click **"New Generation"** to open the generation dialog.
2. **Select requirements** — check the boxes next to the requirements you want tests for. You can select multiple requirements at once.
3. **(Optional) Select page objects** — if you want the AI to use specific page descriptions when writing tests. If you skip this, the platform includes all available page objects automatically.
4. **(Optional) Select style exemplars** — pick existing tests whose coding style you'd like the AI to match. This helps the AI write tests that look consistent with your team's conventions.
5. Click **Confirm** to kick off generation.

#### What happens next

The platform runs a multi-step AI pipeline:

1. **Analyst AI** reads your requirements and breaks them into specific, testable acceptance criteria.
2. **Style Extractor** studies your exemplar tests (if provided) to learn your team's coding patterns — import style, assertion preferences, naming conventions, page object usage.
3. **Generator AI** writes the actual test code, using your requirements as the specification, your page objects for interacting with the page, and your style preferences for consistency.
4. **Post-Processor** automatically validates the generated code — checking for correct imports, proper assertions, no accidental secrets in code, and traceability back to requirements.
5. **Reviewer AI** evaluates each test against a checklist: Is it complete? Are the assertions valid? Are the page selectors correct?

#### Reviewing generated tests

Once generation is complete (status changes from "generating" to "review"), click the request to open the detail page. For each generated test, you'll see:

- The **test code** in a full code editor.
- A **review checklist** with pass/fail/warning indicators for completeness, assertion quality, import correctness, and more.
- **Metadata**: the suggested file name, which acceptance criteria it covers, which AI model was used, and how many tokens it consumed.

#### Your decision

You have three choices for each generated test:

- ✅ **Approve** — accept the test as-is. It gets saved to the knowledge graph and becomes a real test in your project.
- ✏️ **Edit and approve** — unlock the code editor, make adjustments, then approve your modified version.
- ❌ **Reject** — decline the test with optional feedback explaining why (this helps improve future generation).

> **Important:** The AI never auto-approves its own tests. A human always makes the final call.

---

### Step 5: Run Your Tests

**Where:** Dashboard → **Execution** page

Once you have tests (either uploaded or AI-generated), you can run them against your web application.

#### How to start a test run

1. Click **"New Run"** to open the configuration dialog.
2. Configure the run:

   | Setting | What it means | Default |
   |---------|--------------|---------|
   | **Browsers** | Which browsers to test in (Chromium, Firefox, WebKit) | Chromium |
   | **Headless** | Run without opening a visible browser window (faster) | On |
   | **Retries** | How many times to retry a failing test before marking it as failed | 0 |
   | **Timeout** | Maximum time (milliseconds) a single test can take | 30,000 (30 sec) |
   | **Workers** | How many tests run simultaneously (parallel execution) | 4 |
   | **Shards** | Split the test suite across multiple processes for speed | 1 |
   | **Environment** | A label for which environment you're testing (e.g., "staging") | "default" |
   | **Grep pattern** | Filter tests by name or tag (e.g., `@smoke` runs only smoke tests) | (all tests) |

3. Click **Confirm** to start the run.

#### Watching results in real time

After starting a run, click on it to open the **run detail page**. You'll see:

- A **progress bar** filling up as tests complete — green for passed, red for failed, gray for skipped.
- A **live results table** that updates automatically via WebSocket (no need to refresh the page):
  - Status badge (passed / failed / skipped / timed out)
  - Test name
  - Duration
  - Retry count
- **Expandable rows** — click a failed test to see the error message and stack trace.
- **Artifact buttons** for each test:
  - 📸 **Screenshot** — a snapshot of the page at the point of failure
  - 🔍 **Trace** — a Playwright trace file you can open in Playwright's Inspector tool to replay the test step-by-step
  - 📄 **Log** — console output from the test

#### After the run completes

You'll see the final summary: total tests, passed, failed, skipped, and total duration. You can also cancel a running test at any time.

---

### Step 6: Triage Failures (AI-Classified)

**Where:** Dashboard → **Failure Triage** page

When tests fail, the platform's AI automatically sorts the failures by likely cause so you know where to focus your attention.

#### How failures are classified

The platform analyzes each failure's error message and stack trace and assigns it to one of these categories:

| Category | What it means | Example |
|----------|--------------|---------|
| 🔴 **Regression** | A real bug — something that used to work is now broken | An assertion fails: "Expected 'Welcome' but got 'Error'" |
| 🟡 **Flake** | An intermittent/unreliable test — it passes sometimes and fails other times | "Element is not attached to the DOM", timeouts that pass on retry |
| 🔵 **Environment** | The test environment had a problem, not the app itself | Connection refused, DNS failures, server 500 errors, browser crashes |
| ⚫ **Obsolete** | The test references something that no longer exists in the app | Selector for a removed element |
| ⚪ **Unclassified** | The AI couldn't confidently determine the cause | Ambiguous or unusual error messages |

Each classification comes with a **confidence score** (e.g., 87%) so you can see how sure the AI is about its assessment.

#### What you can do

1. **Review the triage table** — failures are sorted by category, with confidence percentages and error details.
2. **Override a classification** — if you disagree with the AI, click a result and reclassify it manually (e.g., from "flake" to "regression").
3. **Bulk reclassify** — select multiple results and reclassify them all at once.

This saves you from manually reading through hundreds of error logs — the AI does the first pass, and you make the final judgment.

---

### Step 7: Self-Healing (AI-Proposed Fixes)

**Where:** Dashboard → **Self-Healing** page

When tests break due to changes in the web application (not bugs), the AI can propose minimal fixes to get them working again.

#### What triggers healing

After a test run with failures, you can click **"Heal Run"** to ask the AI to analyze the failures and propose fixes.

#### What the AI does

For each failed test, the AI:

1. **Diagnoses the failure** — determines what kind of change happened:
   - **Selector update** — a button or element moved or was renamed
   - **Wait condition** — timing changed and the test needs to wait differently
   - **Navigation path** — a URL or page flow changed
   - **Frame switch** — content moved into or out of an iframe
   - **Element structure** — the page layout changed

2. **Generates a minimal fix** — the smallest possible change to make the test work again.

3. **Runs safety checks** via the Policy Engine:
   - ✅ Is the project's healing policy enabled?
   - ✅ Does the confidence score meet the threshold?
   - ✅ Is the test under the per-test healing limit? (prevents endless fix loops)
   - ✅ Is the run under the per-run healing limit?
   - ✅ Is the test NOT on the exclusion list?
   - ✅ **Critical: Were NO business assertions changed?** (The AI will never modify what your test is checking for — only how it navigates to check it.)

#### Reviewing healing proposals

Each proposal appears on the Self-Healing page with:

- A **status badge** (pending review, approved, rejected, applied, or reverted).
- The **change type** and **risk level** (low / medium / high).
- A **confidence score** indicating how sure the AI is about the fix.
- A **code diff** showing exactly what lines changed — old code in red, new code in green.
- An **explanation** from the AI describing why this fix should work.
- **Policy check results** — a list of all safety checks and whether they passed or failed.
- **Evidence** — DOM comparison data, error analysis, and matched patterns.

#### Your options for each proposal

| Action | What it does |
|--------|-------------|
| ✅ **Approve** | Mark the proposal as accepted. |
| ❌ **Reject** | Decline the fix (with optional reason). |
| 🚀 **Apply** | Actually apply the fix to the test code in the project. |
| ↩️ **Revert** | Undo a previously applied fix if it turns out to be wrong. |

You can also **bulk review** — select multiple proposals and approve or reject them together.

#### Safety guardrails

- **Business assertions are sacred** — the AI will never change an `expect()` call or any assertion that validates business logic. If a proposed fix touches an assertion, it is automatically blocked.
- **Unstable test detection** — if a test has been healed more than 5 times, the platform flags it as "unstable" and stops proposing fixes. This is a signal that the test needs manual attention.
- **Configurable policy** — admins and SDETs can tune the healing policy per project: confidence thresholds, healing limits, evidence requirements, excluded tests, and more.

---

### Putting It All Together: A Typical Testing Cycle

Here's how a QA team typically uses the platform day-to-day:

1. **Upload requirements** — product owner writes requirements in Word/Markdown, QA uploads them to the platform.
2. **Check coverage** — use the Traceability Matrix to see which requirements lack tests.
3. **Generate tests** — pick the uncovered requirements and let the AI write tests. Review and approve them.
4. **Run tests** — execute the full test suite against your staging environment before a release.
5. **Triage failures** — the AI classifies failures. Focus on regressions first (real bugs), flag flakes for investigation, ignore environment issues.
6. **Heal broken tests** — for tests broken by UI changes (not bugs), let the AI propose fixes. Review the diffs, approve the good ones, reject the rest.
7. **Repeat** — as the app evolves, upload updated requirements, generate new tests, and keep the cycle going.

---

## Project Structure (For the Curious)

The project is organized into four main packages:

| Folder | Purpose |
|--------|---------|
| `packages/web/` | The web interface you interact with in your browser. |
| `packages/api/` | The backend server that handles data, authentication, and business logic. |
| `packages/agents/` | The AI agents that analyze requirements, generate tests, review code, and propose fixes. |
| `packages/shared/` | Common definitions shared across all the other packages. |

---

## Common Commands Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts the platform in development mode. |
| `npm run build` | Builds all packages for production. |
| `npm run test` | Runs the automated test suite. |
| `npm run lint` | Checks code for style issues. |
| `docker compose up -d` | Starts the background services (databases, etc.). |
| `docker compose down` | Stops the background services. |

---

## Detailed Technical Reference

For developers and contributors, see:

- [Architecture Plan](docs/architecture-plan.md) — full system design and technical decisions
- [Sprint Plan](docs/sprint-plan.md) — implementation progress and milestone tracking

### Technology Overview

| Layer | Technology |
|-------|-----------|
| Web interface | Next.js 15, React 19, TypeScript |
| Backend API | NestJS 11, GraphQL + REST, WebSockets |
| AI agents | LangGraph.js |
| Relational database | PostgreSQL 16 |
| Knowledge graph | Neo4j 5.x |
| Job queue | Redis + BullMQ |
| File storage | MinIO (S3-compatible) |
| Test runner | Playwright |

### Roles & Permissions (Detailed)

| Capability | Admin | SDET | Manual QA |
|---|---|---|---|
| User management | Full | — | — |
| Project configuration | Full | Full | View only |
| Test / asset uploads | Full | Full | View only |
| Generation & healing | Full | Full | View only |
| Execution trigger | Full | Full | — |
| Results & traceability | View | View | View |
| Audit log | View | View | — |

### All Service URLs (Development)

| Service | URL |
|---------|-----|
| Web UI | http://localhost:3000 |
| API | http://localhost:3001 |
| API Docs (Swagger) | http://localhost:3001/api/docs |
| Neo4j Browser | http://localhost:7474 |
| MinIO Console | http://localhost:9001 |

---

## License

Private — not for redistribution.
