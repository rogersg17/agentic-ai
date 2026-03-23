'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileCode,
  ChevronRight,
  Play,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  projectsApi,
  knowledgeApi,
  generationApi,
  type Project,
  type GraphNode,
  type GenerationRequest,
} from '@/lib/api';

// ─── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-slate-500/10 text-slate-600',
    generating: 'bg-amber-500/10 text-amber-600',
    review: 'bg-blue-500/10 text-blue-600',
    approved: 'bg-emerald-500/10 text-emerald-600',
    rejected: 'bg-red-500/10 text-red-600',
  };

  const icons: Record<string, React.ReactNode> = {
    queued: <Clock className="h-3 w-3" />,
    generating: <Loader2 className="h-3 w-3 animate-spin" />,
    review: <Eye className="h-3 w-3" />,
    approved: <CheckCircle2 className="h-3 w-3" />,
    rejected: <XCircle className="h-3 w-3" />,
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

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── New Generation Dialog ──────────────────────────────────────────────────────

function NewGenerationDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([]);
  const [selectedPageObjects, setSelectedPageObjects] = useState<string[]>([]);
  const [selectedExemplars, setSelectedExemplars] = useState<string[]>([]);

  // Fetch requirements
  const { data: requirements } = useQuery({
    queryKey: ['entities', projectId, 'Requirement'],
    queryFn: () => knowledgeApi.getEntities(projectId, 'Requirement'),
  });

  // Fetch page objects
  const { data: pageObjects } = useQuery({
    queryKey: ['entities', projectId, 'PageObject'],
    queryFn: () => knowledgeApi.getEntities(projectId, 'PageObject'),
  });

  // Fetch test cases for exemplars
  const { data: testCases } = useQuery({
    queryKey: ['entities', projectId, 'TestCase'],
    queryFn: () => knowledgeApi.getEntities(projectId, 'TestCase'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      generationApi.createRequest({
        projectId,
        requirementNeo4jIds: selectedRequirements,
        pageObjectNeo4jIds: selectedPageObjects.length > 0 ? selectedPageObjects : undefined,
        styleExemplarNeo4jIds: selectedExemplars.length > 0 ? selectedExemplars : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation-requests', projectId] });
      onClose();
    },
  });

  const toggleItem = (
    id: string,
    selected: string[],
    setter: (ids: string[]) => void,
  ) => {
    setter(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-card-foreground">Generate Tests</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select requirements and context for AI-powered test generation.
        </p>

        <div className="mt-6 space-y-6">
          {/* Requirements (required) */}
          <div>
            <label className="text-sm font-medium text-card-foreground">
              Requirements <span className="text-red-500">*</span>
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Select the requirements to generate tests for
            </p>
            <div className="max-h-48 overflow-y-auto rounded-md border border-input p-2 space-y-1">
              {(requirements ?? []).length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground text-center">
                  No requirements ingested yet. Upload requirements first.
                </p>
              )}
              {(requirements ?? []).map((req) => (
                <label
                  key={req.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedRequirements.includes(req.id)}
                    onChange={() =>
                      toggleItem(req.id, selectedRequirements, setSelectedRequirements)
                    }
                    className="rounded border-input"
                  />
                  <span className="truncate">
                    {(req.properties.title as string) ?? req.id}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {(req.properties.type as string) ?? ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Page Objects (optional) */}
          <div>
            <label className="text-sm font-medium text-card-foreground">
              Page Objects <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Select specific POs to include. Leave empty to auto-include all project POs.
            </p>
            <div className="max-h-36 overflow-y-auto rounded-md border border-input p-2 space-y-1">
              {(pageObjects ?? []).length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground text-center">
                  No page objects available
                </p>
              )}
              {(pageObjects ?? []).map((po) => (
                <label
                  key={po.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPageObjects.includes(po.id)}
                    onChange={() =>
                      toggleItem(po.id, selectedPageObjects, setSelectedPageObjects)
                    }
                    className="rounded border-input"
                  />
                  <span className="truncate">
                    {(po.properties.className as string) ?? po.id}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground truncate max-w-32">
                    {(po.properties.filePath as string) ?? ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Style Exemplars (optional) */}
          <div>
            <label className="text-sm font-medium text-card-foreground">
              Style Exemplars <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Select existing tests to match their coding style. Leave empty for auto-selection.
            </p>
            <div className="max-h-36 overflow-y-auto rounded-md border border-input p-2 space-y-1">
              {(testCases ?? []).length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground text-center">
                  No existing tests available
                </p>
              )}
              {(testCases ?? []).map((tc) => (
                <label
                  key={tc.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedExemplars.includes(tc.id)}
                    onChange={() =>
                      toggleItem(tc.id, selectedExemplars, setSelectedExemplars)
                    }
                    className="rounded border-input"
                  />
                  <span className="truncate">
                    {(tc.properties.title as string) ?? tc.id}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={
              createMutation.isPending || selectedRequirements.length === 0
            }
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Tests
          </Button>
        </div>

        {createMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            Failed: {(createMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Stats Cards ────────────────────────────────────────────────────────────────

function StatsCards({ projectId }: { projectId: string }) {
  const { data: stats } = useQuery({
    queryKey: ['generation-stats', projectId],
    queryFn: () => generationApi.getStats(projectId),
    refetchInterval: 10_000,
  });

  const cards = [
    {
      label: 'Total Requests',
      value: stats?.totalRequests ?? 0,
      icon: FileCode,
      color: 'text-blue-600',
    },
    {
      label: 'Tests Generated',
      value: stats?.testsGenerated ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-600',
    },
    {
      label: 'Pending Review',
      value: stats?.byStatus?.review ?? 0,
      icon: Eye,
      color: 'text-amber-600',
    },
    {
      label: 'Tokens Used',
      value: stats?.totalTokensUsed
        ? stats.totalTokensUsed > 1000
          ? `${(stats.totalTokensUsed / 1000).toFixed(1)}k`
          : stats.totalTokensUsed
        : 0,
      icon: Sparkles,
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{card.label}</span>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </div>
          <p className="mt-2 text-2xl font-semibold text-card-foreground">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Requests Table ─────────────────────────────────────────────────────────────

function RequestsTable({
  requests,
}: {
  requests: GenerationRequest[];
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
              Requirements
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Model
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Tests Generated
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Created
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-12 text-center text-sm text-muted-foreground"
              >
                No generation requests yet. Click &ldquo;Generate Tests&rdquo; to get started.
              </td>
            </tr>
          )}
          {requests.map((req) => (
            <tr
              key={req.id}
              className="border-b border-border last:border-b-0 hover:bg-muted/20"
            >
              <td className="px-4 py-3">
                <StatusBadge status={req.status} />
              </td>
              <td className="px-4 py-3 text-sm">
                {(req.requirement_neo4j_ids as string[]).length} requirement(s)
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {req.llm_model_used ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm">
                {(req.generated_test_neo4j_ids as string[]).length}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {formatTimeAgo(req.created_at)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/dashboard/generation/${req.id}`}>
                  <Button variant="ghost" size="sm">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function GenerationPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Fetch projects
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  // Auto-select first project
  const projectId = selectedProjectId || projects?.[0]?.id || '';

  // Fetch generation requests
  const { data: requestData } = useQuery({
    queryKey: ['generation-requests', projectId],
    queryFn: () => generationApi.listRequests(projectId),
    enabled: !!projectId,
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Test Generation
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-powered test generation from requirements with human review
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Project selector */}
          <select
            value={projectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {!projectId && <option value="">Select a project...</option>}
            {(projects ?? []).map((p: Project) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <Button
            onClick={() => setShowNewDialog(true)}
            disabled={!projectId}
          >
            <Sparkles className="h-4 w-4" />
            Generate Tests
          </Button>
        </div>
      </div>

      {/* Stats */}
      {projectId && <StatsCards projectId={projectId} />}

      {/* Requests table */}
      {projectId && (
        <RequestsTable requests={requestData?.requests ?? []} />
      )}

      {/* New generation dialog */}
      {showNewDialog && projectId && (
        <NewGenerationDialog
          projectId={projectId}
          onClose={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
