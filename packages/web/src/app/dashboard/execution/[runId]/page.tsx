'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
  Loader2,
  Eye,
  Image,
  FileText,
  Download,
  AlertTriangle,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  executionApi,
  type ExecutionRun,
  type TestResult,
} from '@/lib/api';
import { io, type Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-slate-500/10 text-slate-600',
    running: 'bg-amber-500/10 text-amber-600',
    completed: 'bg-emerald-500/10 text-emerald-600',
    failed: 'bg-red-500/10 text-red-600',
    cancelled: 'bg-gray-500/10 text-gray-500',
    passed: 'bg-emerald-500/10 text-emerald-600',
    skipped: 'bg-slate-500/10 text-slate-500',
    timed_out: 'bg-orange-500/10 text-orange-600',
  };

  const icons: Record<string, React.ReactNode> = {
    running: <Loader2 className="h-3 w-3 animate-spin" />,
    completed: <CheckCircle2 className="h-3 w-3" />,
    passed: <CheckCircle2 className="h-3 w-3" />,
    failed: <XCircle className="h-3 w-3" />,
    skipped: <SkipForward className="h-3 w-3" />,
    timed_out: <Timer className="h-3 w-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.queued}`}
    >
      {icons[status]}
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

function ProgressBar({ passed, failed, skipped, total }: {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}) {
  if (total === 0) return null;
  const passW = (passed / total) * 100;
  const failW = (failed / total) * 100;
  const skipW = (skipped / total) * 100;

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div className="flex h-full">
        <div
          className="bg-emerald-500 transition-all duration-300"
          style={{ width: `${passW}%` }}
        />
        <div
          className="bg-red-500 transition-all duration-300"
          style={{ width: `${failW}%` }}
        />
        <div
          className="bg-slate-400 transition-all duration-300"
          style={{ width: `${skipW}%` }}
        />
      </div>
    </div>
  );
}

function ArtifactButton({
  url,
  icon,
  label,
}: {
  url: string | null;
  icon: React.ReactNode;
  label: string;
}) {
  const [resolved, setResolved] = useState<string | null>(null);

  const handleClick = async () => {
    if (!url) return;
    try {
      const { url: presigned } = await executionApi.getArtifactUrl(url);
      setResolved(presigned);
      window.open(presigned, '_blank');
    } catch {
      // silently fail
    }
  };

  if (!url) return null;

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} title={label}>
      {icon}
    </Button>
  );
}

function ResultsTable({ results }: { results: TestResult[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Test
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Duration
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Retries
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Artifacts
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <>
              <tr
                key={r.id}
                className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-sm text-card-foreground font-mono">
                  {r.test_case_neo4j_id}
                </td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                  {formatDuration(r.duration_ms)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                  {r.retry_count > 0 ? r.retry_count : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ArtifactButton
                      url={r.trace_url}
                      icon={<Eye className="h-4 w-4" />}
                      label="View Trace"
                    />
                    <ArtifactButton
                      url={r.screenshot_url}
                      icon={<Image className="h-4 w-4" />}
                      label="View Screenshot"
                    />
                    <ArtifactButton
                      url={r.log_url}
                      icon={<FileText className="h-4 w-4" />}
                      label="View Log"
                    />
                  </div>
                </td>
              </tr>
              {/* Expanded error details */}
              {expandedId === r.id && r.error_message && (
                <tr key={`${r.id}-detail`}>
                  <td colSpan={5} className="bg-red-50/50 px-4 py-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-red-700">Error</p>
                      <pre className="overflow-x-auto rounded-lg bg-red-100/50 p-3 text-xs text-red-800">
                        {r.error_message}
                      </pre>
                      {r.stack_trace && (
                        <>
                          <p className="text-sm font-medium text-red-700">Stack Trace</p>
                          <pre className="overflow-x-auto rounded-lg bg-red-100/50 p-3 text-xs text-red-800 max-h-48 overflow-y-auto">
                            {r.stack_trace}
                          </pre>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
          {results.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                No test results yet. Results will appear as tests complete.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');

  const runQuery = useQuery({
    queryKey: ['execution-run', runId],
    queryFn: () => executionApi.getRun(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'queued' ? 3_000 : false;
    },
  });

  const resultsQuery = useQuery({
    queryKey: ['execution-results', runId],
    queryFn: () => executionApi.getRunResults(runId, 500),
    refetchInterval: (query) => {
      const runStatus = runQuery.data?.status;
      return runStatus === 'running' ? 5_000 : false;
    },
  });

  // WebSocket for real-time updates
  useEffect(() => {
    const socket: Socket = io(`${API_BASE}/execution`, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('subscribe:run', { runId });
    });

    socket.on('execution:test_completed', () => {
      queryClient.invalidateQueries({ queryKey: ['execution-results', runId] });
    });

    socket.on('execution:run_completed', () => {
      queryClient.invalidateQueries({ queryKey: ['execution-run', runId] });
      queryClient.invalidateQueries({ queryKey: ['execution-results', runId] });
    });

    socket.on('execution:run_progress', () => {
      queryClient.invalidateQueries({ queryKey: ['execution-run', runId] });
    });

    return () => {
      socket.emit('unsubscribe:run', { runId });
      socket.disconnect();
    };
  }, [runId, queryClient]);

  const run = runQuery.data;
  const allResults = resultsQuery.data?.results ?? [];

  const filteredResults =
    filter === 'all'
      ? allResults
      : allResults.filter((r) => r.status === filter);

  const failedCount = allResults.filter((r) => r.status === 'failed').length;
  const passedCount = allResults.filter((r) => r.status === 'passed').length;
  const skippedCount = allResults.filter((r) => r.status === 'skipped').length;

  if (runQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runQuery.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-2 text-sm text-red-700">
          Failed to load run: {(runQuery.error as Error).message}
        </p>
        <Link href="/dashboard/execution">
          <Button variant="outline" className="mt-4">
            Back to Execution
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/execution">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Execution Run
            </h2>
            {run && <StatusBadge status={run.status} />}
          </div>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">
            {runId}
          </p>
        </div>
      </div>

      {/* Run metadata */}
      {run && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Environment</p>
            <p className="mt-1 text-lg font-semibold text-card-foreground">
              {run.environment ?? 'default'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Branch / Commit</p>
            <p className="mt-1 text-sm font-mono text-card-foreground">
              {run.git_branch ?? '—'}
              {run.git_commit && (
                <span className="text-muted-foreground"> ({run.git_commit.slice(0, 8)})</span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Duration</p>
            <p className="mt-1 text-lg font-semibold text-card-foreground">
              {formatDuration(run.duration_ms)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Shards / Trigger
            </p>
            <p className="mt-1 text-sm text-card-foreground">
              {run.shard_count} shard{run.shard_count !== 1 ? 's' : ''} &middot;{' '}
              {run.trigger_source}
            </p>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {run && run.total_tests > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {run.passed + run.failed + run.skipped} / {run.total_tests} tests
            </span>
            <div className="flex gap-4">
              <span className="text-emerald-600">{run.passed} passed</span>
              <span className="text-red-600">{run.failed} failed</span>
              <span className="text-slate-500">{run.skipped} skipped</span>
              {run.flaky > 0 && (
                <span className="text-amber-600">{run.flaky} flaky</span>
              )}
            </div>
          </div>
          <ProgressBar
            passed={run.passed}
            failed={run.failed}
            skipped={run.skipped}
            total={run.total_tests}
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {[
          { key: 'all', label: `All (${allResults.length})` },
          { key: 'passed', label: `Passed (${passedCount})` },
          { key: 'failed', label: `Failed (${failedCount})` },
          { key: 'skipped', label: `Skipped (${skippedCount})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {resultsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ResultsTable results={filteredResults} />
      )}
    </div>
  );
}
