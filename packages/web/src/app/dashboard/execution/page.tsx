'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  StopCircle,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { executionApi, projectsApi, type ExecutionRun, type Project } from '@/lib/api';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-slate-500/10 text-slate-600',
    running: 'bg-amber-500/10 text-amber-600',
    completed: 'bg-emerald-500/10 text-emerald-600',
    failed: 'bg-red-500/10 text-red-600',
    cancelled: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.queued}`}
    >
      {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'failed' && <XCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewRunDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [browsers, setBrowsers] = useState(['chromium']);
  const [headless, setHeadless] = useState(true);
  const [retries, setRetries] = useState(0);
  const [workers, setWorkers] = useState(4);
  const [shardCount, setShardCount] = useState(1);
  const [environment, setEnvironment] = useState('');
  const [grepPattern, setGrepPattern] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      executionApi.createRun({
        projectId,
        environment: environment || undefined,
        browserConfig: {
          browsers,
          headless,
          retries,
          workers,
        },
        shardCount,
        grepPattern: grepPattern || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution-runs', projectId] });
      onClose();
    },
  });

  const toggleBrowser = (b: string) => {
    setBrowsers((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-card-foreground">Configure Test Run</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and launch a new Playwright test execution.
        </p>

        <div className="mt-6 space-y-4">
          {/* Browsers */}
          <div>
            <label className="text-sm font-medium text-card-foreground">Browsers</label>
            <div className="mt-1.5 flex gap-2">
              {['chromium', 'firefox', 'webkit'].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBrowser(b)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    browsers.includes(b)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Environment */}
          <div>
            <label className="text-sm font-medium text-card-foreground">Environment</label>
            <input
              type="text"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              placeholder="e.g. staging, production"
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Grep pattern */}
          <div>
            <label className="text-sm font-medium text-card-foreground">
              Grep Pattern (optional)
            </label>
            <input
              type="text"
              value={grepPattern}
              onChange={(e) => setGrepPattern(e.target.value)}
              placeholder="e.g. @smoke or login"
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Config row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-card-foreground">Retries</label>
              <input
                type="number"
                min={0}
                max={5}
                value={retries}
                onChange={(e) => setRetries(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-card-foreground">Workers</label>
              <input
                type="number"
                min={1}
                max={16}
                value={workers}
                onChange={(e) => setWorkers(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-card-foreground">Shards</label>
              <input
                type="number"
                min={1}
                max={20}
                value={shardCount}
                onChange={(e) => setShardCount(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Headless toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={headless}
              onChange={(e) => setHeadless(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-card-foreground">Headless mode</span>
          </label>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || browsers.length === 0}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start Run
          </Button>
        </div>

        {createMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            Failed to create run: {(createMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}

function RunsTable({
  runs,
  onCancel,
}: {
  runs: ExecutionRun[];
  onCancel: (runId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Environment
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Branch
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Tests
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              <span className="text-emerald-600">Pass</span> /{' '}
              <span className="text-red-600">Fail</span> /{' '}
              <span className="text-slate-500">Skip</span>
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Duration
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Started
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
            >
              <td className="px-4 py-3">
                <StatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3 text-sm text-card-foreground">
                {run.environment ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                {run.git_branch ?? '—'}
              </td>
              <td className="px-4 py-3 text-right text-sm text-card-foreground">
                {run.total_tests}
              </td>
              <td className="px-4 py-3 text-right text-sm">
                <span className="text-emerald-600">{run.passed}</span>
                {' / '}
                <span className="text-red-600">{run.failed}</span>
                {' / '}
                <span className="text-slate-500">{run.skipped}</span>
              </td>
              <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                {formatDuration(run.duration_ms)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                {run.started_at ? formatTimeAgo(run.started_at) : formatTimeAgo(run.created_at)}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  {(run.status === 'queued' || run.status === 'running') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onCancel(run.id)}
                      title="Cancel run"
                    >
                      <StopCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                  <Link href={`/dashboard/execution/${run.id}`}>
                    <Button variant="ghost" size="icon" title="View details">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                No execution runs yet. Start a new test run to see results here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ExecutionPage() {
  const [showNewRun, setShowNewRun] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  // Auto-select first project
  const projectId = selectedProject ?? projectsQuery.data?.[0]?.id;

  const runsQuery = useQuery({
    queryKey: ['execution-runs', projectId],
    queryFn: () => executionApi.listRuns(projectId!, 50),
    enabled: !!projectId,
    refetchInterval: 5_000, // Poll every 5s for status updates
  });

  const statsQuery = useQuery({
    queryKey: ['execution-stats', projectId],
    queryFn: () => executionApi.getProjectStats(projectId!),
    enabled: !!projectId,
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: string) => executionApi.cancelRun(runId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['execution-runs', projectId] }),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Test Execution
          </h2>
          <p className="text-muted-foreground">
            Configure, run, and monitor Playwright test suites.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['execution-runs'] })
            }
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNewRun(true)} disabled={!projectId}>
            <Play className="h-4 w-4" />
            New Run
          </Button>
        </div>
      </div>

      {/* Project selector */}
      {projectsQuery.data && projectsQuery.data.length > 1 && (
        <div>
          <select
            value={projectId ?? ''}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {projectsQuery.data.map((p: Project) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats summary */}
      {statsQuery.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Runs</p>
              <Play className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-bold text-card-foreground">
              {statsQuery.data.totalRuns ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Pass Rate</p>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {statsQuery.data.totalPassed &&
              (statsQuery.data.totalPassed + statsQuery.data.totalFailed) > 0
                ? `${Math.round((statsQuery.data.totalPassed / (statsQuery.data.totalPassed + statsQuery.data.totalFailed)) * 100)}%`
                : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Failed Runs</p>
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <p className="mt-1 text-2xl font-bold text-red-600">
              {statsQuery.data.failedRuns ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Avg Duration</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-bold text-card-foreground">
              {formatDuration(statsQuery.data.avgDurationMs)}
            </p>
          </div>
        </div>
      )}

      {/* Runs table */}
      {runsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : runsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-2 text-sm text-red-700">
            Failed to load runs: {(runsQuery.error as Error).message}
          </p>
        </div>
      ) : (
        <RunsTable
          runs={runsQuery.data?.runs ?? []}
          onCancel={(runId) => cancelMutation.mutate(runId)}
        />
      )}

      {/* New run dialog */}
      {showNewRun && projectId && (
        <NewRunDialog projectId={projectId} onClose={() => setShowNewRun(false)} />
      )}
    </div>
  );
}
