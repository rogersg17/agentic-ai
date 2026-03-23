'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import {
  knowledgeApi,
  projectsApi,
  type GraphData,
  type GraphNode,
  type SearchResult,
} from '@/lib/api';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LABEL_COLORS: Record<string, string> = {
  Requirement: '#3b82f6',
  TestCase: '#22c55e',
  PageObject: '#a855f7',
  Helper: '#f59e0b',
  Fixture: '#06b6d4',
  Defect: '#ef4444',
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('list');
  const [filterLabel, setFilterLabel] = useState<string | null>(null);

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

  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ['knowledge-graph', selectedProjectId],
    queryFn: () => knowledgeApi.getGraph(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const { data: searchResults } = useQuery({
    queryKey: ['knowledge-search', selectedProjectId, searchQuery],
    queryFn: () => knowledgeApi.search(selectedProjectId, searchQuery),
    enabled: !!selectedProjectId && searchQuery.length >= 2,
  });

  const { data: stats } = useQuery({
    queryKey: ['knowledge-stats', selectedProjectId],
    queryFn: () => knowledgeApi.getStats(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const { data: entityDetail } = useQuery({
    queryKey: ['knowledge-entity', selectedNodeId],
    queryFn: () => knowledgeApi.getEntityDetail(selectedNodeId!),
    enabled: !!selectedNodeId,
  });

  const filteredNodes = graphData?.nodes?.filter((n) => !filterLabel || n.label === filterLabel);

  const displayNodes: GraphNode[] =
    searchQuery.length >= 2 && searchResults
      ? searchResults.map((sr) => ({
          id: sr.id,
          label: sr.label,
          properties: { title: sr.title, ...sr.properties } as Record<string, unknown>,
        }))
      : (filteredNodes ?? []);

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
                onClick={() => setFilterLabel(filterLabel === label ? null : label)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  filterLabel === label ? 'ring-2 ring-ring' : 'hover:opacity-80',
                )}
                style={{
                  backgroundColor: `${LABEL_COLORS[label] ?? '#666'}20`,
                  color: LABEL_COLORS[label] ?? '#666',
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
            onClick={() => setViewMode('list')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
              viewMode === 'graph' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
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
                ? 'No entities found. Upload assets to get started.'
                : 'Select a project'}
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
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted',
                        selectedNodeId === node.id && 'bg-muted',
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
                          {node.properties.filePath ? ` · ${node.properties.filePath}` : ''}
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
        {viewMode === 'graph' ? (
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

// ────────────────── Interactive Graph Visualization (D3 Force) ──────

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: string;
}

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
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    node: SimNode | null;
    startX: number;
    startY: number;
    isPan: boolean;
  }>({ node: null, startX: 0, startY: 0, isPan: false });
  const hoveredRef = useRef<string | null>(null);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build simulation nodes/links when data changes
  useEffect(() => {
    if (!data?.nodes?.length) {
      nodesRef.current = [];
      linksRef.current = [];
      simRef.current?.stop();
      return;
    }

    const nodeMap = new Map<string, SimNode>();
    const nodes: SimNode[] = data.nodes.map((n) => {
      const existing = nodesRef.current.find((e) => e.id === n.id);
      const sn: SimNode = {
        id: n.id,
        label: n.label,
        properties: n.properties,
        x: existing?.x ?? undefined,
        y: existing?.y ?? undefined,
        vx: existing?.vx,
        vy: existing?.vy,
      };
      nodeMap.set(n.id, sn);
      return sn;
    });

    const links: SimLink[] = (data.edges ?? [])
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        type: e.type,
      }));

    nodesRef.current = nodes;
    linksRef.current = links;

    simRef.current?.stop();
    const sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(120),
      )
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>(25))
      .alphaDecay(0.03);

    simRef.current = sim;

    sim.on('tick', () => {
      renderCanvas();
    });

    // Clean up on unmount or data change
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Re-render when selectedNodeId changes (without restarting sim)
  useEffect(() => {
    renderCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // Zoom handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = transformRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newK = Math.max(0.1, Math.min(8, t.k * scaleFactor));

      // Zoom towards mouse position
      t.x = mx - ((mx - t.x) / t.k) * newK;
      t.y = my - ((my - t.y) / t.k) * newK;
      t.k = newK;

      renderCanvas();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fit graph when data first loads
  useEffect(() => {
    if (!data?.nodes?.length) return;
    const timer = setTimeout(() => fitToView(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    const nodes = nodesRef.current;
    if (!canvas || nodes.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      if (n.x != null && n.y != null) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
    }
    if (!isFinite(minX)) return;

    const pad = 60;
    const gw = maxX - minX || 1;
    const gh = maxY - minY || 1;
    const k = Math.min((rect.width - 2 * pad) / gw, (rect.height - 2 * pad) / gh, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    transformRef.current = {
      k,
      x: rect.width / 2 - cx * k,
      y: rect.height / 2 - cy * k,
    };
    renderCanvas();
  }, []);

  /** Convert canvas mouse coords to graph coords */
  const toGraphCoords = useCallback(
    (canvasX: number, canvasY: number): [number, number] => {
      const t = transformRef.current;
      return [(canvasX - t.x) / t.k, (canvasY - t.y) / t.k];
    },
    [],
  );

  /** Find node under mouse */
  const hitTest = useCallback(
    (gx: number, gy: number): SimNode | null => {
      const hitRadius = 14;
      for (let i = nodesRef.current.length - 1; i >= 0; i--) {
        const n = nodesRef.current[i];
        if (n.x == null || n.y == null) continue;
        const dx = gx - n.x;
        const dy = gy - n.y;
        if (dx * dx + dy * dy < hitRadius * hitRadius) return n;
      }
      return null;
    },
    [],
  );

  const renderCanvas = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const t = transformRef.current;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const nodes = nodesRef.current;
      const links = linksRef.current;

      // Draw edges
      ctx.lineWidth = 1.2 / t.k;
      for (const link of links) {
        const s = link.source as SimNode;
        const tgt = link.target as SimNode;
        if (s.x == null || s.y == null || tgt.x == null || tgt.y == null) continue;

        const isHighlighted =
          s.id === selectedNodeId || tgt.id === selectedNodeId;
        ctx.strokeStyle = isHighlighted ? '#6366f1' : '#d1d5db';
        ctx.globalAlpha = isHighlighted ? 0.9 : 0.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();

        // Draw arrow
        if (isHighlighted || t.k > 0.5) {
          const dx = tgt.x - s.x;
          const dy = tgt.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            const arrowSize = 6 / t.k;
            const ratio = (len - 10) / len;
            const ax = s.x + dx * ratio;
            const ay = s.y + dy * ratio;
            const angle = Math.atan2(dy, dx);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(
              ax - arrowSize * Math.cos(angle - Math.PI / 6),
              ay - arrowSize * Math.sin(angle - Math.PI / 6),
            );
            ctx.lineTo(
              ax - arrowSize * Math.cos(angle + Math.PI / 6),
              ay - arrowSize * Math.sin(angle + Math.PI / 6),
            );
            ctx.closePath();
            ctx.fillStyle = isHighlighted ? '#6366f1' : '#d1d5db';
            ctx.fill();
          }
        }

        // Draw edge label if zoomed in
        if (isHighlighted && t.k > 0.6) {
          const mx = ((s.x as number) + (tgt.x as number)) / 2;
          const my = ((s.y as number) + (tgt.y as number)) / 2;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#6366f1';
          ctx.font = `${10 / t.k}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(link.type, mx, my - 4 / t.k);
        }
      }

      ctx.globalAlpha = 1;

      // Draw nodes
      for (const node of nodes) {
        if (node.x == null || node.y == null) continue;

        const isSelected = node.id === selectedNodeId;
        const isHovered = node.id === hoveredRef.current;
        const color = LABEL_COLORS[node.label] ?? '#666';
        const r = (isSelected || isHovered ? 10 : 7);

        // Glow for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
          ctx.fillStyle = color + '30';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        if (isSelected || isHovered) {
          ctx.strokeStyle = isSelected ? '#1e293b' : color;
          ctx.lineWidth = 2 / t.k;
          ctx.stroke();
        }

        // Label
        const title =
          (node.properties.title as string) ??
          (node.properties.className as string) ??
          (node.properties.name as string) ??
          '';
        if (title && t.k > 0.35) {
          ctx.fillStyle = '#374151';
          ctx.font = `${11 / t.k}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(title.slice(0, 35), node.x, node.y + r + 3);
        }
      }

      ctx.restore();

      // Draw legend in screen space
      const labels = [...new Set(nodes.map((n) => n.label))];
      if (labels.length > 0) {
        const lx = 12, ly = rect.height - labels.length * 20 - 8;
        ctx.font = '11px Inter, sans-serif';
        labels.forEach((label, i) => {
          const y = ly + i * 20;
          ctx.beginPath();
          ctx.arc(lx + 6, y + 6, 5, 0, 2 * Math.PI);
          ctx.fillStyle = LABEL_COLORS[label] ?? '#666';
          ctx.fill();
          ctx.fillStyle = '#374151';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, lx + 16, y + 6);
        });
      }
    });
  }, [selectedNodeId]);

  // Mouse interaction handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const [gx, gy] = toGraphCoords(cx, cy);
      const hit = hitTest(gx, gy);

      if (hit) {
        // Start dragging a node
        dragRef.current = { node: hit, startX: cx, startY: cy, isPan: false };
        hit.fx = hit.x;
        hit.fy = hit.y;
        simRef.current?.alphaTarget(0.3).restart();
      } else {
        // Start panning
        dragRef.current = { node: null, startX: cx, startY: cy, isPan: true };
      }
    },
    [toGraphCoords, hitTest],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const drag = dragRef.current;

      if (drag.node) {
        const [gx, gy] = toGraphCoords(cx, cy);
        drag.node.fx = gx;
        drag.node.fy = gy;
        return;
      }

      if (drag.isPan) {
        const dx = cx - drag.startX;
        const dy = cy - drag.startY;
        transformRef.current.x += dx;
        transformRef.current.y += dy;
        drag.startX = cx;
        drag.startY = cy;
        renderCanvas();
        return;
      }

      // Hover detection
      const [gx, gy] = toGraphCoords(cx, cy);
      const hit = hitTest(gx, gy);
      const newHovered = hit?.id ?? null;
      if (newHovered !== hoveredRef.current) {
        hoveredRef.current = newHovered;
        canvas.style.cursor = newHovered ? 'pointer' : 'grab';
        renderCanvas();
      }
    },
    [toGraphCoords, hitTest, renderCanvas],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      if (drag.node) {
        // If it was a click (not a drag), select the node
        const dist = Math.sqrt(
          (cx - drag.startX) ** 2 + (cy - drag.startY) ** 2,
        );
        if (dist < 5) {
          onSelectNode(drag.node.id);
        }
        drag.node.fx = null;
        drag.node.fy = null;
        simRef.current?.alphaTarget(0);
      } else if (!drag.isPan) {
        // Click on empty space — deselect
        const [gx, gy] = toGraphCoords(cx, cy);
        if (!hitTest(gx, gy)) {
          onSelectNode('');
        }
      }

      dragRef.current = { node: null, startX: 0, startY: 0, isPan: false };
    },
    [onSelectNode, toGraphCoords, hitTest],
  );

  return (
    <div className="flex h-full flex-col" ref={containerRef}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Network className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Knowledge Graph</span>
        <span className="text-xs text-muted-foreground">
          {data?.nodes?.length ?? 0} nodes · {data?.edges?.length ?? 0} edges
        </span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={fitToView}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            title="Fit to view"
          >
            Fit
          </button>
          <button
            onClick={() => {
              transformRef.current = { x: 0, y: 0, k: 1 };
              renderCanvas();
            }}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            title="Reset zoom"
          >
            Reset
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {data?.nodes?.length ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            style={{ cursor: 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              if (dragRef.current.node) {
                dragRef.current.node.fx = null;
                dragRef.current.node.fy = null;
                simRef.current?.alphaTarget(0);
              }
              dragRef.current = { node: null, startX: 0, startY: 0, isPan: false };
            }}
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
      direction: 'incoming' | 'outgoing';
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
    ([key]) => !['embedding', 'sourceContent', 'astSummary', 'id', 'projectId'].includes(key),
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" style={{ color: LABEL_COLORS[node.label] }} />
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {node.label} · {node.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Properties */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Properties</h3>
        <dl className="space-y-1.5">
          {displayProps.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-sm">
              <dt className="shrink-0 font-medium text-muted-foreground w-32 truncate">{key}</dt>
              <dd className="min-w-0 truncate">
                {typeof value === 'string'
                  ? value.slice(0, 200)
                  : String(JSON.stringify(value) ?? '').slice(0, 200)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Source Content (collapsible) */}
      {typeof node.properties.sourceContent === 'string' && (
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
                      {rel.direction === 'outgoing' ? '→' : '←'}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">{rel.type}</span>
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
