'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HeartPulse,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  Undo2,
  Eye,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileCode,
  BarChart3,
  Play,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  healingApi,
  projectsApi,
  executionApi,
  type Project,
  type HealingProposal,
  type HealingStats,
} from '@/lib/api';

// ─── Constants ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'applied', 'reverted'] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-500/10', text: 'text-amber-600', label: 'Pending' },
  approved: { bg: 'bg-green-500/10', text: 'text-green-600', label: 'Approved' },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-600', label: 'Rejected' },
  applied: { bg: 'bg-blue-500/10', text: 'text-blue-600', label: 'Applied' },
  reverted: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'Reverted' },
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  selector_update: 'Selector Update',
  wait_condition: 'Wait Condition',
  frame_switch: 'Frame Switch',
  navigation_path: 'Navigation Path',
  element_structure: 'Element Structure',
};

const RISK_STYLES: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-green-500/10', text: 'text-green-600' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  high: { bg: 'bg-red-500/10', text: 'text-red-600' },
};

// ─── Helper components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const style = RISK_STYLES[risk] ?? RISK_STYLES.medium;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {risk.charAt(0).toUpperCase() + risk.slice(1)} Risk
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
  value: number | string;
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

// ─── Diff Viewer ────────────────────────────────────────────────────────────────

function DiffViewer({ diff }: { diff: string }) {
  if (!diff) return <p className="text-sm text-muted-foreground">No diff available</p>;

  const lines = diff.split('\n');
  return (
    <pre className="overflow-auto rounded-lg bg-muted/30 p-3 text-xs font-mono leading-relaxed">
      {lines.map((line, i) => {
        let className = 'text-muted-foreground';
        if (line.startsWith('+') && !line.startsWith('+++')) className = 'text-green-600 bg-green-500/5';
        else if (line.startsWith('-') && !line.startsWith('---')) className = 'text-red-600 bg-red-500/5';
        else if (line.startsWith('@@')) className = 'text-blue-500';
        else if (line.startsWith('---') || line.startsWith('+++')) className = 'text-muted-foreground font-semibold';

        return (
          <div key={i} className={className}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

// ─── Policy Checks Panel ────────────────────────────────────────────────────────

function PolicyChecksPanel({ checks }: { checks: HealingProposal['policy_checks'] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Policy Checks</span>
        {checks.passed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" /> Passed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        )}
        {checks.autoApprovable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">
            Auto-approved
          </span>
        )}
      </div>
      <div className="space-y-1">
        {checks.checks.map((check, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {check.passed ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 shrink-0 text-red-500" />
            )}
            <span className="text-muted-foreground">{check.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Proposal Detail Panel ──────────────────────────────────────────────────────

function ProposalDetailPanel({
  proposal,
  onClose,
  onReview,
  onApply,
  onRevert,
}: {
  proposal: HealingProposal;
  onClose: () => void;
  onReview: (id: string, status: 'approved' | 'rejected', reason?: string) => void;
  onApply: (id: string) => void;
  onRevert: (id: string, reason: string) => void;
}) {
  const [revertReason, setRevertReason] = useState('');
  const [reviewReason, setReviewReason] = useState('');

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-3xl border-l border-border bg-card shadow-xl overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-card-foreground">Healing Proposal</h3>
          <StatusBadge status={proposal.status} />
          <RiskBadge risk={proposal.risk_level} />
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="space-y-6 p-6">
        {/* Test info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Test Case</h4>
            <p className="mt-1 font-mono text-sm text-card-foreground">
              {proposal.test_case_neo4j_id}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Change Type</h4>
            <p className="mt-1 text-sm text-card-foreground">
              {CHANGE_TYPE_LABELS[proposal.change_type] ?? proposal.change_type}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Confidence</h4>
            <p className="mt-1 text-sm text-card-foreground">
              {Math.round(proposal.confidence_score * 100)}%
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Created</h4>
            <p className="mt-1 text-sm text-card-foreground">
              {formatTimeAgo(proposal.created_at)}
            </p>
          </div>
        </div>

        {/* Explanation */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Explanation</h4>
          <p className="mt-1 text-sm text-card-foreground">{proposal.explanation}</p>
        </div>

        {/* Unified diff */}
        <div>
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">Code Changes</h4>
          <DiffViewer diff={proposal.unified_diff} />
        </div>

        {/* Policy checks */}
        <PolicyChecksPanel checks={proposal.policy_checks} />

        {/* Evidence */}
        {proposal.evidence && Object.keys(proposal.evidence).length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">Evidence</h4>
            <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-xs font-mono text-muted-foreground">
              {JSON.stringify(proposal.evidence, null, 2)}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-border pt-4 space-y-3">
          {proposal.status === 'pending' && (
            <>
              <div>
                <label className="text-sm font-medium text-card-foreground">
                  Review Comment (optional)
                </label>
                <textarea
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Why are you approving/rejecting this proposal?"
                  rows={2}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => onReview(proposal.id, 'approved', reviewReason || undefined)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => onReview(proposal.id, 'rejected', reviewReason || undefined)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </>
          )}

          {proposal.status === 'approved' && (
            <Button onClick={() => onApply(proposal.id)}>
              <Play className="mr-2 h-4 w-4" />
              Apply Healing
            </Button>
          )}

          {proposal.status === 'applied' && (
            <div className="space-y-2">
              <textarea
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                placeholder="Reason for reverting this healing..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                variant="outline"
                onClick={() => revertReason && onRevert(proposal.id, revertReason)}
                disabled={!revertReason}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Revert
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Healing Page ──────────────────────────────────────────────────────────

export default function HealingPage() {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [detailProposal, setDetailProposal] = useState<HealingProposal | null>(null);

  // ── Projects ────────────────────────────────────────────────────────────────
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });
  const projectId = selectedProject || projects?.[0]?.id || '';

  // ── Recent runs (for heal-run action) ───────────────────────────────────────
  const { data: recentRuns } = useQuery({
    queryKey: ['execution-runs', projectId],
    queryFn: () => executionApi.listRuns(projectId, 5, 0),
    enabled: !!projectId,
  });
  const latestRunId = recentRuns?.runs?.[0]?.id;

  // ── Proposals ───────────────────────────────────────────────────────────────
  const { data: proposalsData, isLoading: isLoadingProposals } = useQuery({
    queryKey: ['healing-proposals', projectId, statusFilter],
    queryFn: () =>
      healingApi.getProjectProposals(
        projectId,
        statusFilter === 'all' ? undefined : statusFilter,
      ),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['healing-stats', projectId],
    queryFn: () => healingApi.getStats(projectId),
    enabled: !!projectId,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const healRunMutation = useMutation({
    mutationFn: (runId: string) => healingApi.healRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['healing-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['healing-stats'] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: 'approved' | 'rejected'; reason?: string }) =>
      healingApi.reviewProposal(id, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['healing-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['healing-stats'] });
      setDetailProposal(null);
    },
  });

  const bulkReviewMutation = useMutation({
    mutationFn: ({ status, reason }: { status: 'approved' | 'rejected'; reason?: string }) =>
      healingApi.bulkReview(Array.from(selectedItems), status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['healing-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['healing-stats'] });
      setSelectedItems(new Set());
    },
  });

  const applyMutation = useMutation({
    mutationFn: (id: string) => healingApi.applyProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['healing-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['healing-stats'] });
      setDetailProposal(null);
    },
  });

  const revertMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      healingApi.revertProposal(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['healing-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['healing-stats'] });
      setDetailProposal(null);
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
    if (!proposalsData?.proposals) return;
    const pendingIds = proposalsData.proposals.filter((p) => p.status === 'pending').map((p) => p.id);
    if (selectedItems.size === pendingIds.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(pendingIds));
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Self-Healing</h1>
          <p className="text-sm text-muted-foreground">
            Review, approve, and manage healing proposals for failed tests.
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

          {/* Heal latest run button */}
          {latestRunId && (
            <Button
              variant="outline"
              onClick={() => healRunMutation.mutate(latestRunId)}
              disabled={healRunMutation.isPending}
            >
              {healRunMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <HeartPulse className="mr-2 h-4 w-4" />
              )}
              Heal Latest Run
            </Button>
          )}
        </div>
      </div>

      {/* Heal run result */}
      {healRunMutation.data && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-card-foreground">
              Analyzed {healRunMutation.data.analyzed} failures,
              created {healRunMutation.data.proposals} proposals,
              skipped {healRunMutation.data.skipped}
            </span>
            {healRunMutation.data.unstableTests.length > 0 && (
              <span className="text-amber-600">
                ({healRunMutation.data.unstableTests.length} unstable tests flagged)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Total Proposals"
            value={stats.totalProposals}
            icon={FileCode}
            color="text-blue-500"
          />
          <StatCard
            label="Pending Review"
            value={stats.byStatus.pending ?? 0}
            icon={Clock}
            color="text-amber-500"
          />
          <StatCard
            label="Approved"
            value={stats.byStatus.approved ?? 0}
            icon={CheckCircle2}
            color="text-green-500"
          />
          <StatCard
            label="Applied"
            value={stats.byStatus.applied ?? 0}
            icon={Play}
            color="text-blue-600"
          />
          <StatCard
            label="Rejected"
            value={stats.byStatus.rejected ?? 0}
            icon={XCircle}
            color="text-red-500"
          />
          <StatCard
            label="Unstable Tests"
            value={stats.unstableTests.length}
            icon={AlertTriangle}
            color="text-orange-500"
          />
        </div>
      )}

      {/* Avg confidence bar */}
      {stats && stats.totalProposals > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">Avg Proposal Confidence</span>
            <span className="font-semibold text-card-foreground">
              {Math.round(stats.avgConfidence * 100)}%
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${stats.avgConfidence * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Unstable tests warning */}
      {stats && stats.unstableTests.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              {stats.unstableTests.length} test(s) flagged as unstable (healed 5+ times)
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.unstableTests.slice(0, 10).map((testId) => (
              <span
                key={testId}
                className="inline-flex rounded-md bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-700"
              >
                {testId}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter + bulk actions toolbar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? s === 'all'
                      ? 'bg-primary/10 text-primary'
                      : `${(STATUS_STYLES[s] ?? STATUS_STYLES.pending).bg} ${(STATUS_STYLES[s] ?? STATUS_STYLES.pending).text}`
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {s === 'all' ? 'All' : (STATUS_STYLES[s] ?? STATUS_STYLES.pending).label}
              </button>
            ))}
          </div>
        </div>

        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selectedItems.size} selected</span>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => bulkReviewMutation.mutate({ status: 'approved' })}
              disabled={bulkReviewMutation.isPending}
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Approve All
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => bulkReviewMutation.mutate({ status: 'rejected' })}
              disabled={bulkReviewMutation.isPending}
            >
              <Ban className="mr-1 h-3 w-3" />
              Reject All
            </Button>
          </div>
        )}
      </div>

      {/* Proposals table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoadingProposals ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : proposalsData?.proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <HeartPulse className="h-10 w-10 mb-2" />
            <p className="text-sm font-medium">No healing proposals</p>
            <p className="text-xs">
              {statusFilter !== 'all'
                ? 'No proposals match the selected filter.'
                : 'Run healing on a failed execution to generate proposals.'}
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
                      proposalsData != null &&
                      proposalsData.proposals.filter((p) => p.status === 'pending').length > 0 &&
                      selectedItems.size === proposalsData.proposals.filter((p) => p.status === 'pending').length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-input"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Test</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Change</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Risk</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Confidence</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Explanation</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {proposalsData?.proposals.map((proposal) => (
                <tr
                  key={proposal.id}
                  className={`border-b border-border transition-colors hover:bg-muted/20 ${
                    selectedItems.has(proposal.id) ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    {proposal.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selectedItems.has(proposal.id)}
                        onChange={() => toggleSelect(proposal.id)}
                        className="rounded border-input"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-card-foreground truncate max-w-[180px] block">
                      {proposal.test_case_neo4j_id}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-card-foreground">
                    {CHANGE_TYPE_LABELS[proposal.change_type] ?? proposal.change_type}
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={proposal.risk_level} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-12 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${proposal.confidence_score * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(proposal.confidence_score * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={proposal.status} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {proposal.explanation}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatTimeAgo(proposal.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailProposal(proposal)}
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
        {proposalsData && proposalsData.total > 0 && (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Showing {proposalsData.proposals.length} of {proposalsData.total} proposals
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detailProposal && (
        <ProposalDetailPanel
          proposal={detailProposal}
          onClose={() => setDetailProposal(null)}
          onReview={(id, status, reason) =>
            reviewMutation.mutate({ id, status, reason })
          }
          onApply={(id) => applyMutation.mutate(id)}
          onRevert={(id, reason) => revertMutation.mutate({ id, reason })}
        />
      )}
    </div>
  );
}
