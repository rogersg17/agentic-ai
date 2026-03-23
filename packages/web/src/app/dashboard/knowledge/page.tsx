"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  knowledgeApi,
  projectsApi,
  type GraphData,
  type GraphNode,
  type SearchResult,
} from "@/lib/api";
import {
  Search,
  Network,
  List,
  ChevronRight,
  FileText,
  TestTube2,
  Layers,
  Wrench,
  Puzzle,
  Bug,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LABEL_COLORS: Record<string, string> = {
  Requirement: "#3b82f6",
  TestCase: "#22c55e",
  PageObject: "#a855f7",
  Helper: "#f59e0b",
  Fixture: "#06b6d4",
  Defect: "#ef4444",
};

const LABEL_ICONS: Record<string, typeof FileText> = {
  Requirement: FileText,
  TestCase: TestTube2,
  PageObject: Layers,
  Helper: Wrench,
  Fixture: Puzzle,
  Defect: Bug,
};

export default function KnowledgeExplorerPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"graph" | "list">("list");
  const [filterLabel, setFilterLabel] = useState<string | null>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });

  // Auto-select first project
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ["knowledge-graph", selectedProjectId],
    queryFn: () => knowledgeApi.getGraph(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const { data: searchResults } = useQuery({
    queryKey: ["knowledge-search", selectedProjectId, searchQuery],
    queryFn: () => knowledgeApi.search(selectedProjectId, searchQuery),
    enabled: !!selectedProjectId && searchQuery.length >= 2,
  });

  const { data: stats } = useQuery({
    queryKey: ["knowledge-stats", selectedProjectId],
    queryFn: () => knowledgeApi.getStats(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const { data: entityDetail } = useQuery({
    queryKey: ["knowledge-entity", selectedNodeId],
    queryFn: () => knowledgeApi.getEntityDetail(selectedNodeId!),
    enabled: !!selectedNodeId,
  });

  const filteredNodes = graphData?.nodes?.filter(
    (n) => !filterLabel || n.label === filterLabel,
  );

  const displayNodes: GraphNode[] = searchQuery.length >= 2 && searchResults
    ? searchResults.map((sr) => ({
        id: sr.id,
        label: sr.label,
        properties: { title: sr.title, ...sr.properties } as Record<string, unknown>,
      }))
    : filteredNodes ?? [];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left Panel: Controls + Entity List */}
      <div className="flex w-80 flex-col gap-4 overflow-hidden">
        {/* Project Selector */}
        <select
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={selectedProjectId}
          onChange={(e) => {
            setSelectedProjectId(e.target.value);
            setSelectedNodeId(null);
          }}
        >
          <option value="">Select Project</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search entities..."
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats).map(([label, count]) => (
              <button
                key={label}
                onClick={() =>
                  setFilterLabel(filterLabel === label ? null : label)
                }
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  filterLabel === label
                    ? "ring-2 ring-ring"
                    : "hover:opacity-80",
                )}
                style={{
                  backgroundColor: `${LABEL_COLORS[label] ?? "#666"}20`,
                  color: LABEL_COLORS[label] ?? "#666",
                }}
              >
                {label}
                <span className="font-bold">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* View Toggle */}
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => setViewMode("graph")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
              viewMode === "graph"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            <Network className="h-3.5 w-3.5" /> Graph
          </button>
        </div>

        {/* Entity List */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-background">
          {graphLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : displayNodes.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              {selectedProjectId
                ? "No entities found. Upload assets to get started."
                : "Select a project"}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {displayNodes.map((node) => {
                const Icon = LABEL_ICONS[node.label] ?? FileText;
                const title =
                  (node.properties.title as string) ??
                  (node.properties.className as string) ??
                  (node.properties.name as string) ??
                  (node.properties.filePath as string) ??
                  node.id;
                return (
                  <li key={node.id}>
                    <button
                      onClick={() => setSelectedNodeId(node.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                        selectedNodeId === node.id && "bg-muted",
                      )}
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: LABEL_COLORS[node.label] }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {node.label}
                          {node.properties.filePath
                            ? ` · ${node.properties.filePath}`
                            : ""}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
        {viewMode === "graph" ? (
          <GraphView
            data={graphData}
            onSelectNode={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
          />
        ) : (
          <DetailPanel
            entityDetail={entityDetail ?? null}
            selectedNodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            onNavigate={setSelectedNodeId}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────── Graph Visualization (Canvas-based) ──────────────

function GraphView({
  data,
  onSelectNode,
  selectedNodeId,
}: {
  data?: GraphData;
  onSelectNode: (id: string) => void;
  selectedNodeId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  useEffect(() => {
    if (!data?.nodes?.length) return;

    // Simple force-directed layout initialization
    const pos: Record<string, { x: number; y: number }> = {};
    const width = 800;
    const height = 600;
    const radius = Math.min(width, height) * 0.35;

    data.nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / data.nodes.length;
      pos[node.id] = {
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle),
      };
    });

    setPositions(pos);
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.nodes?.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw edges
    for (const edge of data.edges ?? []) {
      const from = positions[edge.source];
      const to = positions[edge.target];
      if (!from || !to) continue;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw nodes
    for (const node of data.nodes) {
      const pos = positions[node.id];
      if (!pos) continue;

      const isSelected = node.id === selectedNodeId;
      const color = LABEL_COLORS[node.label] ?? "#666";

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 10 : 7, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      const title =
        (node.properties.title as string) ??
        (node.properties.className as string) ??
        (node.properties.name as string) ??
        "";
      if (title) {
        ctx.fillStyle = "#374151";
        ctx.font = "11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title.slice(0, 30), pos.x, pos.y + 20);
      }
    }
  }, [data, positions, selectedNodeId]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!data?.nodes) return;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const node of data.nodes) {
        const pos = positions[node.id];
        if (!pos) continue;
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist < 12) {
          onSelectNode(node.id);
          return;
        }
      }
    },
    [data, positions, onSelectNode],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Network className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Knowledge Graph</span>
        <span className="text-xs text-muted-foreground">
          {data?.nodes?.length ?? 0} nodes · {data?.edges?.length ?? 0} edges
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        {data?.nodes?.length ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full cursor-pointer"
            onClick={handleCanvasClick}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No graph data. Upload assets to populate the knowledge graph.
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────── Detail Panel ────────────────────────────────

function DetailPanel({
  entityDetail,
  selectedNodeId,
  onClose,
  onNavigate,
}: {
  entityDetail: {
    node: GraphNode;
    relationships: Array<{
      direction: "incoming" | "outgoing";
      type: string;
      relatedNode: GraphNode;
    }>;
  } | null;
  selectedNodeId: string | null;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  if (!selectedNodeId || !entityDetail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an entity from the list to view details.
      </div>
    );
  }

  const { node, relationships } = entityDetail;
  const Icon = LABEL_ICONS[node.label] ?? FileText;
  const title =
    (node.properties.title as string) ??
    (node.properties.className as string) ??
    (node.properties.name as string) ??
    node.id;

  // Properties to display (exclude large fields)
  const displayProps = Object.entries(node.properties).filter(
    ([key]) =>
      !["embedding", "sourceContent", "astSummary", "id", "projectId"].includes(
        key,
      ),
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon
            className="h-5 w-5"
            style={{ color: LABEL_COLORS[node.label] }}
          />
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {node.label} · {node.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Properties */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Properties
        </h3>
        <dl className="space-y-1.5">
          {displayProps.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-sm">
              <dt className="shrink-0 font-medium text-muted-foreground w-32 truncate">
                {key}
              </dt>
              <dd className="min-w-0 truncate">
                {typeof value === "string"
                  ? value.slice(0, 200)
                  : String(JSON.stringify(value) ?? "").slice(0, 200)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Source Content (collapsible) */}
      {typeof node.properties.sourceContent === "string" && (
        <details className="border-b border-border px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground">
            Source Content
          </summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs">
            {(node.properties.sourceContent as string).slice(0, 5000)}
          </pre>
        </details>
      )}

      {/* Relationships */}
      <div className="px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Relationships ({relationships.length})
        </h3>
        {relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relationships</p>
        ) : (
          <ul className="space-y-1">
            {relationships.map((rel, i) => {
              const RelIcon = LABEL_ICONS[rel.relatedNode.label] ?? FileText;
              const relTitle =
                (rel.relatedNode.properties.title as string) ??
                (rel.relatedNode.properties.className as string) ??
                (rel.relatedNode.properties.name as string) ??
                rel.relatedNode.id;
              return (
                <li key={i}>
                  <button
                    onClick={() => onNavigate(rel.relatedNode.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="text-xs text-muted-foreground">
                      {rel.direction === "outgoing" ? "→" : "←"}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {rel.type}
                    </span>
                    <RelIcon
                      className="h-3.5 w-3.5"
                      style={{ color: LABEL_COLORS[rel.relatedNode.label] }}
                    />
                    <span className="truncate">{relTitle}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
