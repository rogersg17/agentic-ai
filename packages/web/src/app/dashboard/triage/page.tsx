'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bug,
  RefreshCw,
  Shuffle,
  Trash2,
  CheckCircle2,
  XCircle,
  Timer,
  Filter,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  classificationApi,
  projectsApi,
  executionApi,
  type Project,
  type TriageItem,
  type ClassificationSummary,
} from '@/lib/api';

// ─── Constants ──────────────────────────────────────────────────────────────────

const CLASSIFICATIONS = [
  'regression',
  'flake',
  'environment',
  'obsolete',
  'unclassified',
] as const;

const CLASSIFICATION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  regression: { bg: 'bg-red-500/10', text: 'text-red-600', label: 'Regression' },
  flake: { bg: 'bg-amber-500/10', text: 'text-amber-600', label: 'Flake' },
  environment: { bg: 'bg-blue-500/10', text: 'text-blue-600', label: 'Environment' },
  obsolete: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'Obsolete' },
  unclassified: { bg: 'bg-purple-500/10', text: 'text-purple-600', label: 'Unclassified' },
};

// ─── Helper components ──────────────────────────────────────────────────────────

function ClassificationBadge({
  classification,
  confidence,
}: {
  classification: string | null;
  confidence: number | null;
}) {
  const cls = classification ?? 'unclassified';
  const style = CLASSIFICATION_STYLES[cls] ?? CLASSIFICATION_STYLES.unclassified;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
      {confidence != null && confidence > 0 && (
        <span className="opacity-70">({Math.round(confidence * 100)}%)</span>
      )}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="mt-2 text-2xl font-bold text-card-foreground">{value}</p>
    </div>
  );
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

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ─── Reclassify Dialog ──────────────────────────────────────────────────────────

function ReclassifyDialog({
  resultIds,
  onClose,
  onSuccess,
}: {
  resultIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedClassification, setSelectedClassification] = useState('');
  const [reason, setReason] = useState('');

  const reclassifyMutation = useMutation({
    mutationFn: async () => {
      if (resultIds.length === 1) {
        await classificationApi.reclassifyResult(
          resultIds[0],
          selectedClassification,
          reason || undefined,
        );
      } else {
        await classificationApi.bulkReclassify(
          resultIds,
          selectedClassification,
          reason || undefined,
        );
      }
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-card-foreground">
          Reclassify {resultIds.length > 1 ? `${resultIds.length} failures` : 'failure'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Change the classification and provide a reason.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-card-foreground">
              New Classification
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CLASSIFICATIONS.map((c) => {
                const style = CLASSIFICATION_STYLES[c];
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedClassification(c)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedClassification === c
                        ? `border-current ${style.bg} ${style.text}`
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-card-foreground">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being reclassified?"
              rows={2}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => reclassifyMutation.mutate()}
            disabled={!selectedClassification || reclassifyMutation.isPending}
          >
            {reclassifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reclassify
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Failure Detail Panel ───────────────────────────────────────────────────────

function FailureDetailPanel({
  item,
  onClose,
}: {
  item: TriageItem;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-2xl border-l border-border bg-card shadow-xl overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <h3 className="text-lg font-semibold text-card-foreground">Failure Details</h3>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="space-y-6 p-6">
        {/* Test info */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Test Case</h4>
          <p className="mt-1 font-mono text-sm text-card-foreground">
            {item.test_case_neo4j_id}
          </p>
        </div>

        {/* Classification */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Classification</h4>
          <div className="mt-1">
            <ClassificationBadge
              classification={item.failure_classification}
              confidence={item.classification_confidence}
            />
          </div>
        </div>

        {/* Run context */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Run</h4>
            <p className="mt-1 text-sm text-card-foreground">{item.run.id.slice(0, 8)}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Environment</h4>
            <p className="mt-1 text-sm text-card-foreground">{item.run.environment ?? '—'}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Branch</h4>
            <p className="mt-1 text-sm text-card-foreground">{item.run.git_branch ?? '—'}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Duration</h4>
            <p className="mt-1 text-sm text-card-foreground">{formatDuration(item.duration_ms)}</p>
          </div>
        </div>

        {/* Error message */}
        {item.error_message && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Error Message</h4>
            <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-xs font-mono text-destructive">
              {item.error_message}
            </pre>
          </div>
        )}

        {/* Stack trace */}
        {item.stack_trace && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Stack Trace</h4>
            <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-muted/50 p-3 text-xs font-mono text-muted-foreground">
              {item.stack_trace}
            </pre>
          </div>
        )}

        {/* Artifacts */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Artifacts</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.trace_url && (
              <ArtifactButton label="Trace" artifactKey={item.trace_url} />
            )}
            {item.screenshot_url && (
              <ArtifactButton label="Screenshot" artifactKey={item.screenshot_url} />
            )}
            {item.log_url && (
              <ArtifactButton label="Log" artifactKey={item.log_url} />
            )}
            {!item.trace_url && !item.screenshot_url && !item.log_url && (
              <p className="text-sm text-muted-foreground">No artifacts available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtifactButton({ label, artifactKey }: { label: string; artifactKey: string }) {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['artifact-url', artifactKey],
    queryFn: () => executionApi.getArtifactUrl(artifactKey),
    enabled: false,
  });

  const handleClick = async () => {
    const result = await refetch();
    if (result.data?.url) {
      window.open(result.data.url, '_blank', 'noopener');
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isFetching}>
      {isFetching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Eye className="mr-1 h-3 w-3" />}
      {label}
    </Button>
  );
}

// ─── Main Triage Page ───────────────────────────────────────────────────────────

export default function TriagePage() {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [filterClassification, setFilterClassification] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<TriageItem | null>(null);
  const [showReclassifyDialog, setShowReclassifyDialog] = useState(false);

  // ── Projects ────────────────────────────────────────────────────────────────
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  // Auto-select first project
  const projectId = selectedProject || projects?.[0]?.id || '';

  // ── Triage queue ────────────────────────────────────────────────────────────
  const { data: triageData, isLoading: isLoadingQueue } = useQuery({
    queryKey: ['triage-queue', projectId, filterClassification],
    queryFn: () =>
      classificationApi.getTriageQueue(
        projectId,
        filterClassification || undefined,
      ),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });

  // ── Summary for selected run (we show project-level aggregated stats) ─────
  const { data: recentRuns } = useQuery({
    queryKey: ['execution-runs', projectId],
    queryFn: () => executionApi.listRuns(projectId, 5, 0),
    enabled: !!projectId,
  });

  const latestRunId = recentRuns?.runs?.[0]?.id;

  const { data: summary } = useQuery({
    queryKey: ['classification-summary', latestRunId],
    queryFn: () => classificationApi.getRunSummary(latestRunId!),
    enabled: !!latestRunId,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const classifyMutation = useMutation({
    mutationFn: (runId: string) => classificationApi.classifyRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triage-queue'] });
      queryClient.invalidateQueries({ queryKey: ['classification-summary'] });
    },
  });

  // ── Selection handlers ──────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!triageData?.results) return;
    if (selectedItems.size === triageData.results.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(triageData.results.map((r) => r.id)));
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['triage-queue'] });
    queryClient.invalidateQueries({ queryKey: ['classification-summary'] });
    setSelectedItems(new Set());
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Failure Triage</h1>
          <p className="text-sm text-muted-foreground">
            Classify, review, and manage test failures across runs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Project selector */}
          <select
            value={projectId}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setSelectedItems(new Set());
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {projects?.map((p: Project) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Classify latest run button */}
          {latestRunId && (
            <Button
              variant="outline"
              onClick={() => classifyMutation.mutate(latestRunId)}
              disabled={classifyMutation.isPending}
            >
              {classifyMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="mr-2 h-4 w-4" />
              )}
              Classify Latest Run
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Total Failures"
            value={summary.total}
            icon={XCircle}
            color="text-red-500"
          />
          <StatCard
            label="Regressions"
            value={summary.byClassification.regression ?? 0}
            icon={Bug}
            color="text-red-600"
          />
          <StatCard
            label="Flakes"
            value={summary.byClassification.flake ?? 0}
            icon={Shuffle}
            color="text-amber-500"
          />
          <StatCard
            label="Environment"
            value={summary.byClassification.environment ?? 0}
            icon={AlertTriangle}
            color="text-blue-500"
          />
          <StatCard
            label="Unclassified"
            value={summary.byClassification.unclassified ?? 0}
            icon={Timer}
            color="text-purple-500"
          />
          <StatCard
            label="Triaged"
            value={summary.triaged}
            icon={CheckCircle2}
            color="text-emerald-500"
          />
        </div>
      )}

      {/* Avg confidence bar */}
      {summary && summary.total > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">Avg Classification Confidence</span>
            <span className="font-semibold text-card-foreground">
              {Math.round(summary.avgConfidence * 100)}%
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${summary.avgConfidence * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter + bulk actions toolbar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setFilterClassification('')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filterClassification === ''
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              All
            </button>
            {CLASSIFICATIONS.map((c) => {
              const style = CLASSIFICATION_STYLES[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterClassification(c)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterClassification === c
                      ? `${style.bg} ${style.text}`
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {style.label}
                </button>
              );
            })}
          </div>
        </div>

        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedItems.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReclassifyDialog(true)}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Bulk Reclassify
            </Button>
          </div>
        )}
      </div>

      {/* Triage queue table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoadingQueue ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : triageData?.results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-2" />
            <p className="text-sm font-medium">No failures to triage</p>
            <p className="text-xs">
              {filterClassification
                ? 'No failures match the selected filter.'
                : 'All caught up! No failed tests in recent runs.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      triageData != null &&
                      triageData.results.length > 0 &&
                      selectedItems.size === triageData.results.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-input"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Test
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Classification
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Error
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Run
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Duration
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  When
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {triageData?.results.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-border transition-colors hover:bg-muted/20 ${
                    selectedItems.has(item.id) ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-input"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-card-foreground truncate max-w-[200px]">
                        {item.test_case_neo4j_id}
                      </span>
                      {item.retry_count > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {item.retry_count} retries
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ClassificationBadge
                      classification={item.failure_classification}
                      confidence={item.classification_confidence}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[250px] truncate text-xs text-muted-foreground">
                      {item.error_message ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-card-foreground">
                        {item.run.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.run.environment ?? 'default'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDuration(item.duration_ms)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatTimeAgo(item.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailItem(item)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination info */}
        {triageData && triageData.total > 0 && (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Showing {triageData.results.length} of {triageData.total} failures
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detailItem && (
        <FailureDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
      )}

      {/* Reclassify dialog */}
      {showReclassifyDialog && selectedItems.size > 0 && (
        <ReclassifyDialog
          resultIds={Array.from(selectedItems)}
          onClose={() => setShowReclassifyDialog(false)}
          onSuccess={invalidateAll}
        />
      )}
    </div>
  );
}
