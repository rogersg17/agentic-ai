const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Thin wrapper around fetch that adds auth headers and handles errors. */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ──────────────────────── Auth ──────────────────────────────────
export interface LoginPayload {
  email: string;
  password: string;
}
export interface AuthResponse {
  access_token: string;
  user: { id: string; email: string; name: string; role: string };
}

export const authApi = {
  login: (data: LoginPayload) =>
    apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  register: (data: LoginPayload & { name: string; role: string }) =>
    apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  profile: () => apiFetch<AuthResponse['user']>('/auth/profile'),
};

// ──────────────────────── Projects ─────────────────────────────
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  git_repos: unknown[];
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const projectsApi = {
  list: () => apiFetch<Project[]>('/projects'),
  get: (id: string) => apiFetch<Project>(`/projects/${encodeURIComponent(id)}`),
  create: (data: { name: string; slug?: string; description?: string }) =>
    apiFetch<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string }) =>
    apiFetch<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ──────────────────────── Ingestion ────────────────────────────
export interface IngestionResult {
  fileKey: string;
  assetType: string;
  filePath: string;
  fileHash: string;
  nodeIds: string[];
  entities: number;
}

export const ingestionApi = {
  uploadFile: (projectId: string, file: File, assetType?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', projectId);
    if (assetType) form.append('assetType', assetType);
    return apiFetch<IngestionResult>('/ingestion/upload', {
      method: 'POST',
      body: form,
    });
  },
  uploadBatch: (projectId: string, files: File[]) => {
    const form = new FormData();
    form.append('projectId', projectId);
    for (const file of files) {
      form.append('files', file);
    }
    return apiFetch<IngestionResult[]>('/ingestion/upload-batch', {
      method: 'POST',
      body: form,
    });
  },
  ingestContent: (data: {
    projectId: string;
    fileName: string;
    content: string;
    assetType?: string;
  }) =>
    apiFetch<IngestionResult>('/ingestion/ingest-content', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ──────────────────────── Knowledge ────────────────────────────
export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SearchResult {
  id: string;
  label: string;
  title: string;
  score: number;
  properties: Record<string, unknown>;
}

export interface TraceabilityRow {
  requirementId: string;
  requirementTitle: string;
  testCases: Array<{
    id: string;
    title: string;
    status: string;
    origin: string;
    confidence: number;
  }>;
  coverageStatus: 'covered' | 'partial' | 'uncovered';
}

export const knowledgeApi = {
  getGraph: (projectId: string) =>
    apiFetch<GraphData>(`/knowledge/graph/${encodeURIComponent(projectId)}`),
  getEntities: (projectId: string, label: string) =>
    apiFetch<GraphNode[]>(
      `/knowledge/entities/${encodeURIComponent(projectId)}/${encodeURIComponent(label)}`,
    ),
  getEntityDetail: (id: string) =>
    apiFetch<{
      node: GraphNode;
      relationships: Array<{
        direction: 'incoming' | 'outgoing';
        type: string;
        relatedNode: GraphNode;
      }>;
    }>(`/knowledge/entity/${encodeURIComponent(id)}`),
  search: (projectId: string, query: string, limit?: number) =>
    apiFetch<SearchResult[]>(
      `/knowledge/search/${encodeURIComponent(projectId)}?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`,
    ),
  semanticSearch: (projectId: string, query: string, limit?: number) =>
    apiFetch<SearchResult[]>(
      `/knowledge/semantic-search/${encodeURIComponent(projectId)}?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`,
    ),
  getTraceability: (projectId: string) =>
    apiFetch<TraceabilityRow[]>(`/knowledge/traceability/${encodeURIComponent(projectId)}`),
  getImpact: (id: string, depth?: number) =>
    apiFetch<GraphData>(
      `/knowledge/impact/${encodeURIComponent(id)}${depth ? `?depth=${depth}` : ''}`,
    ),
  getStats: (projectId: string) =>
    apiFetch<Record<string, number>>(`/knowledge/stats/${encodeURIComponent(projectId)}`),
  getEntityVersion: (id: string) =>
    apiFetch<{
      id: string;
      label: string;
      filePath: string | null;
      version: number;
      fileHash: string | null;
      previousFileHash: string | null;
      updatedAt: string | null;
    }>(`/knowledge/version/${encodeURIComponent(id)}`),
  getEntityDiff: (id: string) =>
    apiFetch<{
      id: string;
      label: string;
      version: number;
      fileHash: string | null;
      previousFileHash: string | null;
      sourceContent: string | null;
    }>(`/knowledge/diff/${encodeURIComponent(id)}`),
};

// ──────────────────────── Execution ────────────────────────────
export interface BrowserConfig {
  browsers: string[];
  headless: boolean;
  viewport?: { width: number; height: number };
  retries?: number;
  timeout?: number;
  workers?: number;
}

export interface ExecutionRun {
  id: string;
  project_id: string;
  triggered_by: string | null;
  trigger_source: string;
  ci_build_id: string | null;
  git_commit: string | null;
  git_branch: string | null;
  environment: string | null;
  browser_config: BrowserConfig;
  shard_count: number;
  status: string;
  total_tests: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface TestResult {
  id: string;
  run_id: string;
  test_case_neo4j_id: string;
  status: string;
  retry_count: number;
  duration_ms: number | null;
  error_message: string | null;
  stack_trace: string | null;
  failure_classification: string | null;
  classification_confidence: number | null;
  screenshot_url: string | null;
  trace_url: string | null;
  dom_snapshot_url: string | null;
  log_url: string | null;
  shard_index: number | null;
  created_at: string;
}

export interface ExecutionStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  avgDurationMs: number | null;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalFlaky: number;
}

export interface PaginatedRuns {
  runs: ExecutionRun[];
  total: number;
}

export interface PaginatedResults {
  results: TestResult[];
  total: number;
}

export const executionApi = {
  createRun: (data: {
    projectId: string;
    environment?: string;
    gitCommit?: string;
    gitBranch?: string;
    browserConfig: BrowserConfig;
    shardCount?: number;
    testFilter?: string[];
    grepPattern?: string;
  }) =>
    apiFetch<ExecutionRun>('/execution/runs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listRuns: (projectId: string, limit = 20, offset = 0) =>
    apiFetch<PaginatedRuns>(
      `/execution/runs/project/${encodeURIComponent(projectId)}?limit=${limit}&offset=${offset}`,
    ),

  getRun: (runId: string) =>
    apiFetch<ExecutionRun>(`/execution/runs/${encodeURIComponent(runId)}`),

  getRunResults: (runId: string, limit = 100, offset = 0) =>
    apiFetch<PaginatedResults>(
      `/execution/runs/${encodeURIComponent(runId)}/results?limit=${limit}&offset=${offset}`,
    ),

  getTestResult: (resultId: string) =>
    apiFetch<TestResult>(`/execution/results/${encodeURIComponent(resultId)}`),

  cancelRun: (runId: string, reason?: string) =>
    apiFetch<ExecutionRun>(`/execution/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getProjectStats: (projectId: string) =>
    apiFetch<ExecutionStats>(`/execution/stats/${encodeURIComponent(projectId)}`),

  getArtifactUrl: (key: string) =>
    apiFetch<{ url: string }>(`/execution/artifact-url?key=${encodeURIComponent(key)}`),
};

// ──────────────────────── Classification / Triage ──────────────

export interface ClassificationResult {
  classification: string;
  confidence: number;
  reasoning: string;
  matchedPatterns: string[];
  method: 'heuristic' | 'llm' | 'manual';
}

export interface ClassifyRunResponse {
  classified: number;
  results: Array<{ resultId: string; classification: ClassificationResult }>;
}

export interface ClassificationSummary {
  total: number;
  byClassification: Record<string, number>;
  avgConfidence: number;
  triaged: number;
  untriaged: number;
}

export interface TriageItem extends TestResult {
  run: {
    id: string;
    environment: string | null;
    git_branch: string | null;
    git_commit: string | null;
    created_at: string;
  };
}

export interface PaginatedTriageQueue {
  results: TriageItem[];
  total: number;
}

export interface FailurePattern {
  id: string;
  name: string;
  classification: string;
  errorPatterns: string[];
  stackPatterns: string[];
  description: string;
  priority: number;
  enabled: boolean;
}

export const classificationApi = {
  classifyRun: (runId: string) =>
    apiFetch<ClassifyRunResponse>('/classification/classify-run', {
      method: 'POST',
      body: JSON.stringify({ runId }),
    }),

  getRunSummary: (runId: string) =>
    apiFetch<ClassificationSummary>(`/classification/summary/${encodeURIComponent(runId)}`),

  getTriageQueue: (projectId: string, classification?: string, limit = 50, offset = 0) =>
    apiFetch<PaginatedTriageQueue>(
      `/classification/triage/${encodeURIComponent(projectId)}?limit=${limit}&offset=${offset}${classification ? `&classification=${encodeURIComponent(classification)}` : ''}`,
    ),

  reclassifyResult: (resultId: string, classification: string, reason?: string) =>
    apiFetch<TestResult>(`/classification/result/${encodeURIComponent(resultId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ classification, reason }),
    }),

  bulkReclassify: (resultIds: string[], classification: string, reason?: string) =>
    apiFetch<{ updated: number; resultIds: string[] }>('/classification/bulk-reclassify', {
      method: 'POST',
      body: JSON.stringify({ resultIds, classification, reason }),
    }),

  getPatterns: () => apiFetch<FailurePattern[]>('/classification/patterns'),

  addPattern: (data: {
    name: string;
    classification: string;
    errorPatterns: string[];
    stackPatterns: string[];
    description: string;
    priority: number;
  }) =>
    apiFetch<FailurePattern>('/classification/patterns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removePattern: (patternId: string) =>
    apiFetch<{ removed: boolean }>(`/classification/patterns/${encodeURIComponent(patternId)}`, {
      method: 'DELETE',
    }),
};

// ──────────────────────── Generation ───────────────────────────

export interface GenerationRequest {
  id: string;
  project_id: string;
  requested_by: string;
  requirement_neo4j_ids: string[];
  page_object_neo4j_ids: string[];
  style_exemplar_neo4j_ids: string[];
  configuration: Record<string, unknown>;
  status: string;
  generated_test_neo4j_ids: string[];
  llm_model_used: string | null;
  token_usage: { prompt?: number; completion?: number; total?: number };
  created_at: string;
}

export interface AnalysisResult {
  requirementId: string;
  title: string;
  acceptanceCriteria: Array<{
    id: string;
    text: string;
    testable: boolean;
    suggestedTestType: string;
  }>;
  suggestedTestCount: number;
  complexity: string;
  missingContext: string[];
}

export interface GeneratedTest {
  code: string;
  suggestedFilePath: string;
  coveredCriteria: string[];
  model: string;
  tokenUsage: { prompt: number; completion: number; total: number };
}

export interface ReviewResult {
  passed: boolean;
  score: number;
  checks: Array<{
    name: string;
    passed: boolean;
    severity: string;
    message: string;
  }>;
  suggestions: string[];
}

export interface GenerationRequestDetail extends GenerationRequest {
  pipelineResult: {
    status: string;
    analysis: AnalysisResult | null;
    generatedTests: GeneratedTest[];
    reviewResults: ReviewResult[];
    postProcessingResults: Array<{
      passed: boolean;
      checks: Array<{ name: string; passed: boolean; message: string }>;
    }>;
    styleProfile: Record<string, unknown> | null;
    error: string | null;
  } | null;
}

export interface GenerationStats {
  totalRequests: number;
  byStatus: Record<string, number>;
  totalTokensUsed: number;
  testsGenerated: number;
}

export const generationApi = {
  createRequest: (data: {
    projectId: string;
    requirementNeo4jIds: string[];
    pageObjectNeo4jIds?: string[];
    styleExemplarNeo4jIds?: string[];
    configuration?: Record<string, unknown>;
  }) =>
    apiFetch<GenerationRequest>('/generation/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listRequests: (projectId: string, limit = 20, offset = 0) =>
    apiFetch<{ requests: GenerationRequest[]; total: number }>(
      `/generation/requests/project/${encodeURIComponent(projectId)}?limit=${limit}&offset=${offset}`,
    ),

  getRequest: (requestId: string) =>
    apiFetch<GenerationRequestDetail>(
      `/generation/requests/${encodeURIComponent(requestId)}`,
    ),

  approveTest: (requestId: string, testIndex: number, editedCode?: string) =>
    apiFetch<{ nodeId: string; filePath: string }>(
      `/generation/requests/${encodeURIComponent(requestId)}/tests/${testIndex}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', editedCode }),
      },
    ),

  rejectRequest: (requestId: string, feedback?: string) =>
    apiFetch<{ rejected: boolean }>(
      `/generation/requests/${encodeURIComponent(requestId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', feedback }),
      },
    ),

  getStats: (projectId: string) =>
    apiFetch<GenerationStats>(
      `/generation/stats/${encodeURIComponent(projectId)}`,
    ),
};

// ──────────────────────── Healing ──────────────────────────────

export interface HealingProposal {
  id: string;
  test_result_id: string;
  test_case_neo4j_id: string;
  change_type: string;
  risk_level: string;
  original_code: string;
  proposed_code: string;
  unified_diff: string;
  explanation: string;
  confidence_score: number;
  evidence: Record<string, unknown>;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  policy_checks: {
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; message: string }>;
    autoApprovable: boolean;
  };
  created_at: string;
}

export interface HealRunResponse {
  analyzed: number;
  proposals: number;
  skipped: number;
  unstableTests: string[];
}

export interface PaginatedProposals {
  proposals: HealingProposal[];
  total: number;
}

export interface HealingStats {
  totalProposals: number;
  byStatus: Record<string, number>;
  byChangeType: Record<string, number>;
  byRiskLevel: Record<string, number>;
  avgConfidence: number;
  unstableTests: string[];
}

export interface HealingPolicy {
  enabled: boolean;
  maxHealingsPerRun: number;
  maxHealingsPerTest: number;
  minConfidenceThreshold: number;
  rules: Record<string, { autoApproveThreshold: number; requireReview: boolean }>;
  excludedTests: string[];
  excludedSelectors: string[];
  requireDomSnapshot: boolean;
  requireScreenshot: boolean;
}

export const healingApi = {
  healRun: (runId: string) =>
    apiFetch<HealRunResponse>('/healing/heal-run', {
      method: 'POST',
      body: JSON.stringify({ runId }),
    }),

  getRunProposals: (runId: string, status?: string) =>
    apiFetch<PaginatedProposals>(
      `/healing/proposals/run/${encodeURIComponent(runId)}${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),

  getProjectProposals: (projectId: string, status?: string, limit = 50, offset = 0) =>
    apiFetch<PaginatedProposals>(
      `/healing/proposals/project/${encodeURIComponent(projectId)}?limit=${limit}&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    ),

  getProposal: (proposalId: string) =>
    apiFetch<HealingProposal>(
      `/healing/proposals/${encodeURIComponent(proposalId)}`,
    ),

  reviewProposal: (proposalId: string, status: 'approved' | 'rejected', reason?: string) =>
    apiFetch<HealingProposal>(
      `/healing/proposals/${encodeURIComponent(proposalId)}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      },
    ),

  bulkReview: (proposalIds: string[], status: 'approved' | 'rejected', reason?: string) =>
    apiFetch<{ updated: number }>('/healing/proposals/bulk-review', {
      method: 'POST',
      body: JSON.stringify({ proposalIds, status, reason }),
    }),

  applyProposal: (proposalId: string, editedCode?: string) =>
    apiFetch<{ applied: boolean; message: string }>(
      `/healing/proposals/${encodeURIComponent(proposalId)}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({ editedCode }),
      },
    ),

  revertProposal: (proposalId: string, reason: string) =>
    apiFetch<{ reverted: boolean; message: string }>(
      `/healing/proposals/${encodeURIComponent(proposalId)}/revert`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    ),

  getPolicy: (projectId: string) =>
    apiFetch<HealingPolicy>(`/healing/policy/${encodeURIComponent(projectId)}`),

  updatePolicy: (projectId: string, updates: Partial<HealingPolicy>) =>
    apiFetch<HealingPolicy>(`/healing/policy/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  getStats: (projectId: string) =>
    apiFetch<HealingStats>(`/healing/stats/${encodeURIComponent(projectId)}`),
};
