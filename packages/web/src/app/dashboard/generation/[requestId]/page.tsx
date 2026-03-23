'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Sparkles,
  FileCode,
  ClipboardCheck,
  Edit3,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  generationApi,
  type GenerationRequestDetail,
  type GeneratedTest,
  type ReviewResult,
} from '@/lib/api';

// Dynamically import Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-[#1e1e1e]">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  ),
});

// ─── Code Editor (Monaco) ───────────────────────────────────────────────────────

function CodeEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
}) {
  const lineCount = value.split('\n').length;
  const height = Math.min(Math.max(lineCount * 20, 200), 600);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/50 bg-[#252526] px-3 py-1.5">
        <span className="text-xs text-gray-400">
          {readOnly ? 'Read Only' : 'Edit Mode'} — TypeScript
        </span>
      </div>

      <MonacoEditor
        height={height}
        language="typescript"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange?.(val ?? '')}
        options={{
          readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: 'on',
          wordWrap: 'on',
          tabSize: 2,
          automaticLayout: true,
          renderLineHighlight: readOnly ? 'none' : 'line',
          domReadOnly: readOnly,
        }}
      />
    </div>
  );
}

// ─── Review Checklist ───────────────────────────────────────────────────────────

function ReviewChecklist({ review }: { review: ReviewResult }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Review Checklist
        </h4>
        <span
          className={`text-sm font-medium ${
            review.passed ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {review.score}% — {review.passed ? 'Passed' : 'Failed'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            review.score >= 80
              ? 'bg-emerald-500'
              : review.score >= 50
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`}
          style={{ width: `${review.score}%` }}
        />
      </div>

      <div className="space-y-2">
        {review.checks.map((check, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-sm"
          >
            {check.passed ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : check.severity === 'error' ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            ) : check.severity === 'warning' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            )}
            <div>
              <span className="font-medium">{check.name}</span>
              <span className="text-muted-foreground"> — {check.message}</span>
            </div>
          </div>
        ))}
      </div>

      {review.suggestions.length > 0 && (
        <div className="mt-4 rounded-md bg-amber-500/10 p-3">
          <p className="text-xs font-medium text-amber-700 mb-1">Suggestions:</p>
          {review.suggestions.map((s, i) => (
            <p key={i} className="text-xs text-amber-600">
              • {s}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Analysis Panel ─────────────────────────────────────────────────────────────

function AnalysisPanel({
  request,
}: {
  request: GenerationRequestDetail;
}) {
  const analysis = request.pipelineResult?.analysis;
  if (!analysis) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="text-sm font-medium text-card-foreground mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        Requirement Analysis
      </h4>

      <div className="space-y-3">
        <div>
          <span className="text-xs text-muted-foreground">Requirement</span>
          <p className="text-sm font-medium">{analysis.title}</p>
        </div>

        <div>
          <span className="text-xs text-muted-foreground">Complexity</span>
          <span
            className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              analysis.complexity === 'low'
                ? 'bg-emerald-500/10 text-emerald-600'
                : analysis.complexity === 'medium'
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-red-500/10 text-red-600'
            }`}
          >
            {analysis.complexity}
          </span>
        </div>

        <div>
          <span className="text-xs text-muted-foreground">
            Acceptance Criteria ({analysis.acceptanceCriteria.length})
          </span>
          <div className="mt-1 space-y-1">
            {analysis.acceptanceCriteria.map((ac) => (
              <div
                key={ac.id}
                className="flex items-start gap-2 text-sm rounded-md bg-muted/30 px-2 py-1.5"
              >
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono text-primary">
                  {ac.id}
                </span>
                <span className="text-muted-foreground">{ac.text}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {ac.suggestedTestType}
                </span>
              </div>
            ))}
          </div>
        </div>

        {analysis.missingContext.length > 0 && (
          <div className="rounded-md bg-amber-500/10 p-2">
            <p className="text-xs font-medium text-amber-700">Missing Context:</p>
            {analysis.missingContext.map((ctx, i) => (
              <p key={i} className="text-xs text-amber-600">
                • {ctx}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Test Card (with editor + review) ───────────────────────────────────────────

function TestCard({
  test,
  review,
  testIndex,
  requestId,
  requestStatus,
}: {
  test: GeneratedTest;
  review?: ReviewResult;
  testIndex: number;
  requestId: string;
  requestStatus: string;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(test.code);
  const [feedback, setFeedback] = useState('');

  const approveMutation = useMutation({
    mutationFn: () =>
      generationApi.approveTest(
        requestId,
        testIndex,
        isEditing ? editedCode : undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation-request', requestId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => generationApi.rejectRequest(requestId, feedback || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation-request', requestId] });
    },
  });

  const isReviewable = requestStatus === 'review';

  return (
    <div className="space-y-4">
      {/* Test header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCode className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{test.suggestedFilePath}</p>
            <p className="text-xs text-muted-foreground">
              Covers: {test.coveredCriteria.join(', ')} • Model: {test.model} •{' '}
              {test.tokenUsage.total} tokens
            </p>
          </div>
        </div>

        {isReviewable && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditing(!isEditing);
                if (!isEditing) setEditedCode(test.code);
              }}
            >
              <Edit3 className="h-4 w-4" />
              {isEditing ? 'Cancel Edit' : 'Edit'}
            </Button>
          </div>
        )}
      </div>

      {/* Code editor */}
      <CodeEditor
        value={isEditing ? editedCode : test.code}
        onChange={isEditing ? setEditedCode : undefined}
        readOnly={!isEditing}
      />

      {/* Review checklist */}
      {review && <ReviewChecklist review={review} />}

      {/* Action buttons */}
      {isReviewable && (
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ThumbsUp className="h-4 w-4" />
            )}
            {isEditing ? 'Approve with Edits' : 'Approve'}
          </Button>

          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Rejection reason (optional)"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Mutation feedback */}
      {approveMutation.isSuccess && (
        <p className="text-sm text-emerald-600">
          Test approved and synced to the knowledge graph.
        </p>
      )}
      {approveMutation.isError && (
        <p className="text-sm text-red-600">
          Approval failed: {(approveMutation.error as Error).message}
        </p>
      )}
      {rejectMutation.isSuccess && (
        <p className="text-sm text-red-600">Request rejected.</p>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function GenerationRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;

  const { data: request, isLoading } = useQuery({
    queryKey: ['generation-request', requestId],
    queryFn: () => generationApi.getRequest(requestId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll while generating
      return status === 'queued' || status === 'generating' ? 3000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground">Request not found</p>
        <Link href="/dashboard/generation">
          <Button variant="outline">Back to Generation</Button>
        </Link>
      </div>
    );
  }

  const pipeline = request.pipelineResult;
  const isGenerating = request.status === 'queued' || request.status === 'generating';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/generation">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">
              Generation Request
            </h2>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {request.id} •{' '}
            {new Date(request.created_at).toLocaleDateString()}{' '}
            {new Date(request.created_at).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Generating indicator */}
      {isGenerating && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Generating tests...
            </p>
            <p className="text-xs text-amber-600">
              The AI pipeline is analyzing requirements and generating tests. This page will update automatically.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {pipeline?.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Pipeline Error
          </p>
          <p className="text-xs text-red-600">{pipeline.error}</p>
        </div>
      )}

      {/* Analysis panel */}
      {pipeline?.analysis && <AnalysisPanel request={request} />}

      {/* Generated tests */}
      {pipeline?.generatedTests && pipeline.generatedTests.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-foreground">
            Generated Tests ({pipeline.generatedTests.length})
          </h3>

          {pipeline.generatedTests.map((test, i) => (
            <TestCard
              key={i}
              test={test}
              review={pipeline.reviewResults?.[i]}
              testIndex={i}
              requestId={requestId}
              requestStatus={request.status}
            />
          ))}
        </div>
      )}

      {/* Post-processing details */}
      {pipeline?.postProcessingResults &&
        pipeline.postProcessingResults.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-medium text-card-foreground mb-3">
              Post-Processing Results
            </h4>
            {pipeline.postProcessingResults.map((pp, i) => (
              <div key={i} className="space-y-1">
                {pp.checks.map((check, j) => (
                  <div key={j} className="flex items-center gap-2 text-sm">
                    {check.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className="text-muted-foreground">
                      {check.name}: {check.message}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// Reuse StatusBadge from parent page
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-slate-500/10 text-slate-600',
    generating: 'bg-amber-500/10 text-amber-600',
    review: 'bg-blue-500/10 text-blue-600',
    approved: 'bg-emerald-500/10 text-emerald-600',
    rejected: 'bg-red-500/10 text-red-600',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.queued}`}
    >
      {status}
    </span>
  );
}
