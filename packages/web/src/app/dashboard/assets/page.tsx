'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ingestionApi, projectsApi, type IngestionResult, type Project } from '@/lib/api';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  Plus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AssetsPage() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [results, setResults] = useState<IngestionResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  // Auto-select first project
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const createProjectMutation = useMutation({
    mutationFn: (name: string) => projectsApi.create({ name }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelectedProjectId(project.id);
      setNewProjectName('');
      setShowCreateProject(false);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) =>
      files.length === 1
        ? ingestionApi.uploadFile(selectedProjectId, files[0]).then((r) => [r])
        : ingestionApi.uploadBatch(selectedProjectId, files),
    onSuccess: (data) => {
      setResults((prev) => [...data, ...prev]);
      queryClient.invalidateQueries({ queryKey: ['knowledge-graph'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] });
    },
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (!selectedProjectId) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        uploadMutation.mutate(files);
      }
    },
    [selectedProjectId, uploadMutation],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedProjectId || !e.target.files?.length) return;
      const files = Array.from(e.target.files);
      uploadMutation.mutate(files);
      e.target.value = '';
    },
    [selectedProjectId, uploadMutation],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Asset Ingestion</h1>
      </div>

      {/* Project Selection */}
      <div className="flex items-center gap-3">
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
        <button
          onClick={() => setShowCreateProject(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Create Project Inline */}
      {showCreateProject && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            placeholder="Project name"
            className="flex-1 bg-transparent text-sm outline-none"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newProjectName.trim()) {
                createProjectMutation.mutate(newProjectName.trim());
              }
              if (e.key === 'Escape') setShowCreateProject(false);
            }}
          />
          <button
            onClick={() => {
              if (newProjectName.trim()) createProjectMutation.mutate(newProjectName.trim());
            }}
            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
            disabled={createProjectMutation.isPending}
          >
            Create
          </button>
          <button
            onClick={() => setShowCreateProject(false)}
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={cn(
          'relative rounded-xl border-2 border-dashed p-12 text-center transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          !selectedProjectId && 'pointer-events-none opacity-50',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Ingesting files...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Drag & drop files here, or{' '}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary underline underline-offset-4"
                >
                  browse
                </button>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports: .ts, .tsx, .js, .md, .feature files
              </p>
              <p className="text-xs text-muted-foreground">
                Tests, Page Objects, Helpers, Fixtures, Requirements
              </p>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".ts,.tsx,.js,.jsx,.md,.feature,.gherkin,.txt"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Upload Error */}
      {uploadMutation.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>Upload failed: {(uploadMutation.error as Error).message}</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ingestion Results</h2>
            <button
              onClick={() => setResults([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-1.5">
            {results.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.filePath}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.assetType} · {r.entities} entities · {r.fileHash.slice(0, 8)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
