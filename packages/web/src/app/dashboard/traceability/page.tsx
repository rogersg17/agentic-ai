'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi, projectsApi, type TraceabilityRow } from '@/lib/api';
import { CheckCircle2, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TraceabilityPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['traceability', selectedProjectId],
    queryFn: () => knowledgeApi.getTraceability(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const coveredCount = matrix?.filter((r) => r.coverageStatus === 'covered').length ?? 0;
  const partialCount = matrix?.filter((r) => r.coverageStatus === 'partial').length ?? 0;
  const uncoveredCount = matrix?.filter((r) => r.coverageStatus === 'uncovered').length ?? 0;
  const total = matrix?.length ?? 0;
  const coveragePercent = total > 0 ? Math.round((coveredCount / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Traceability Matrix</h1>
        <select
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          <option value="">Select Project</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Coverage Summary */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Total Requirements"
          value={total}
          icon={<FileText className="h-5 w-5 text-muted-foreground" />}
        />
        <SummaryCard
          label="Covered"
          value={coveredCount}
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
          accent="green"
        />
        <SummaryCard
          label="Partial"
          value={partialCount}
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          accent="amber"
        />
        <SummaryCard
          label="Uncovered"
          value={uncoveredCount}
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          accent="red"
        />
      </div>

      {/* Coverage Bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall Coverage</span>
            <span className="font-bold">{coveragePercent}%</span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Matrix Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Requirement</th>
              <th className="px-4 py-3 text-left font-medium">Covering Tests</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : !matrix?.length ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  No requirements found. Upload requirements to build the traceability matrix.
                </td>
              </tr>
            ) : (
              matrix.map((row) => (
                <tr key={row.requirementId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <CoverageIcon status={row.coverageStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{row.requirementTitle}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {row.requirementId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.testCases.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.testCases.map((tc) => (
                          <li key={tc.id} className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-block h-2 w-2 rounded-full',
                                tc.status === 'active' ? 'bg-green-500' : 'bg-muted-foreground',
                              )}
                            />
                            <span className="truncate">{tc.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {tc.origin === 'ai_generated' ? 'AI' : 'Human'}
                            </span>
                            {tc.confidence > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({Math.round(tc.confidence * 100)}%)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CoverageIcon({ status }: { status: TraceabilityRow['coverageStatus'] }) {
  switch (status) {
    case 'covered':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'partial':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'uncovered':
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}
