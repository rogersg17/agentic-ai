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
