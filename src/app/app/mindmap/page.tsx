'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Network, Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  ChevronRight, Tag, Layers, Search, X, Pin,
  MessageSquare, FileText, Globe, Type, BookOpenCheck, FileBox, Gem,
} from 'lucide-react';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────────

interface TopicNode {
  id: string;
  label: string;
  keywords: string[];
  memoryCount: number;
  memories: SimplifiedMemory[];
  children: TopicNode[];
  sourceTypes: Record<string, number>;
  coherence: number;
}

interface SimplifiedMemory {
  id: string;
  title: string;
  preview: string;
  sourceType: string;
  sourceTitle: string;
  pinned: boolean;
}

interface MindMapTree {
  id: string;
  label: string;
  memoryCount: number;
  children: TopicNode[];
}

interface CrossConnection {
  source: string;
  target: string;
  strength: number;
}

interface MindMapData {
  tree: MindMapTree;
  connections: CrossConnection[];
  stats: {
    totalMemories: number;
    topicCount: number;
    subTopicCount: number;
    maxDepth: number;
    avgTopicSize: number;
    largestTopic: string;
    largestTopicSize: number;
    connectionCount: number;
  };
}

// ─── Layout Constants ────────────────────────────────────────────

const TOPIC_COLORS = [
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#38bdf8', // sky
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#22d3ee', // light cyan
  '#2dd4bf', // teal-lighter
  '#60a5fa', // blue-lighter
  '#fb923c', // orange-lighter
];

const SOURCE_ICONS: Record<string, { icon: typeof FileText; color: string }> = {
  chatgpt: { icon: MessageSquare, color: '#10b981' },
  file: { icon: FileText, color: '#3b82f6' },
  url: { icon: Globe, color: '#f59e0b' },
  text: { icon: Type, color: '#38bdf8' },
  kindle: { icon: BookOpenCheck, color: '#f59e0b' },
  document: { icon: FileBox, color: '#3b82f6' },
  obsidian: { icon: Gem, color: '#14b8a6' },
  reddit: { icon: MessageSquare, color: '#f97316' },
};

// ─── Radial Layout Engine ────────────────────────────────────────

interface LayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  depth: number;
  memoryCount: number;
  parentId: string | null;
  topic: TopicNode | null;
  isRoot: boolean;
}

interface LayoutEdge {
  from: string;
  to: string;
  color: string;
  width: number;
  isCross: boolean;
}

function computeRadialLayout(
  tree: MindMapTree,
  connections: CrossConnection[],
  expandedIds: Set<string>,
  centerX: number,
  centerY: number,
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // Root node
  nodes.push({
    id: 'root',
    label: tree.label,
    x: centerX,
    y: centerY,
    radius: 32,
    color: '#14b8a6',
    depth: 0,
    memoryCount: tree.memoryCount,
    parentId: null,
    topic: null,
    isRoot: true,
  });

  const topics = tree.children;
  if (topics.length === 0) return { nodes, edges };

  // Primary ring — topics
  const primaryRadius = 220;
  const angleStep = (2 * Math.PI) / topics.length;
  const angleOffset = -Math.PI / 2; // Start from top

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const angle = angleOffset + i * angleStep;
    const x = centerX + primaryRadius * Math.cos(angle);
    const y = centerY + primaryRadius * Math.sin(angle);
    const color = TOPIC_COLORS[i % TOPIC_COLORS.length];

    // Size based on memory count (relative to largest)
    const maxCount = topics[0].memoryCount || 1;
    const sizeRatio = topic.memoryCount / maxCount;
    const nodeRadius = 18 + sizeRatio * 14;

    nodes.push({
      id: topic.id,
      label: topic.label,
      x,
      y,
      radius: nodeRadius,
      color,
      depth: 1,
      memoryCount: topic.memoryCount,
      parentId: 'root',
      topic,
      isRoot: false,
    });

    edges.push({
      from: 'root',
      to: topic.id,
      color,
      width: 1.5 + sizeRatio * 1.5,
      isCross: false,
    });

    // Sub-topics (if expanded)
    if (expandedIds.has(topic.id) && topic.children.length > 0) {
      const subRadius = 100;
      const subAngleSpan = Math.min(angleStep * 0.8, Math.PI * 0.6);
      const subStep = subAngleSpan / Math.max(topic.children.length - 1, 1);
      const subStart = angle - subAngleSpan / 2;

      for (let j = 0; j < topic.children.length; j++) {
        const sub = topic.children[j];
        const subAngle = topic.children.length === 1 ? angle : subStart + j * subStep;
        const sx = x + subRadius * Math.cos(subAngle);
        const sy = y + subRadius * Math.sin(subAngle);

        const subSizeRatio = sub.memoryCount / (topic.memoryCount || 1);
        const subNodeRadius = 10 + subSizeRatio * 10;

        nodes.push({
          id: sub.id,
          label: sub.label,
          x: sx,
          y: sy,
          radius: subNodeRadius,
          color,
          depth: 2,
          memoryCount: sub.memoryCount,
          parentId: topic.id,
          topic: sub,
          isRoot: false,
        });

        edges.push({
          from: topic.id,
          to: sub.id,
          color,
          width: 1 + subSizeRatio,
          isCross: false,
        });
      }
    }
  }

  // Cross-connections
  for (const conn of connections.slice(0, 10)) {
    const source = nodes.find(n => n.id === conn.source);
    const target = nodes.find(n => n.id === conn.target);
    if (source && target) {
      edges.push({
        from: conn.source,
        to: conn.target,
        color: 'rgba(255,255,255,0.08)',
        width: conn.strength * 1.5,
        isCross: true,
      });
    }
  }

  return { nodes, edges };
}

// ─── Canvas Mind Map Component ──────────────────────────────────

function MindMapCanvas({
  data,
  onTopicClick,
  selectedTopic,
}: {
  data: MindMapData;
  onTopicClick: (topic: TopicNode | null) => void;
  selectedTopic: TopicNode | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; startTx: number; startTy: number }>({
    dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0,
  });
  const layoutRef = useRef<{ nodes: LayoutNode[]; edges: LayoutEdge[] }>({ nodes: [], edges: [] });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Compute layout
  const layout = useMemo(() => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const result = computeRadialLayout(data.tree, data.connections, expandedIds, centerX, centerY);
    layoutRef.current = result;
    return result;
  }, [data, expandedIds, dimensions]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const { nodes, edges } = layout;

    // Draw cross-connection edges first (behind everything)
    for (const edge of edges) {
      if (!edge.isCross) continue;
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (!from || !to) continue;

      ctx.beginPath();
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = edge.width;
      ctx.setLineDash([4, 6]);
      ctx.moveTo(from.x, from.y);

      // Curved connection
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const offsetX = (to.y - from.y) * 0.15;
      const offsetY = (from.x - to.x) * 0.15;
      ctx.quadraticCurveTo(midX + offsetX, midY + offsetY, to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw primary edges
    for (const edge of edges) {
      if (edge.isCross) continue;
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (!from || !to) continue;

      ctx.beginPath();
      ctx.strokeStyle = edge.color + '40';
      ctx.lineWidth = edge.width;

      // Organic curve
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(midX, midY, to.x, to.y);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const isHovered = hoveredId === node.id;
      const isSelected = selectedTopic?.id === node.id;
      const isExpanded = expandedIds.has(node.id);
      const r = node.radius;

      // Node glow
      if (isHovered || isSelected) {
        const gradient = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r * 2.5);
        gradient.addColorStop(0, node.color + '30');
        gradient.addColorStop(1, node.color + '00');
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

      if (node.isRoot) {
        // Root: teal gradient
        const grad = ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, 0, node.x, node.y, r);
        grad.addColorStop(0, '#5eead4');
        grad.addColorStop(1, '#0d9488');
        ctx.fillStyle = grad;
      } else {
        // Topic/subtopic: colored fill
        const alpha = isHovered || isSelected ? 'cc' : '88';
        ctx.fillStyle = node.color + alpha;
      }
      ctx.fill();

      // Border
      ctx.strokeStyle = isHovered || isSelected
        ? node.color
        : node.color + '40';
      ctx.lineWidth = isHovered || isSelected ? 2 : 1;
      ctx.stroke();

      // Expand indicator for topics with children
      if (node.depth === 1 && node.topic?.children && node.topic.children.length > 0) {
        const indicatorR = 6;
        const ix = node.x + r * 0.7;
        const iy = node.y - r * 0.7;
        ctx.beginPath();
        ctx.arc(ix, iy, indicatorR, 0, Math.PI * 2);
        ctx.fillStyle = isExpanded ? '#10b981' : '#27272a';
        ctx.fill();
        ctx.strokeStyle = isExpanded ? '#10b981' : '#52525b';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Plus/minus icon
        ctx.strokeStyle = '#fafafa';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ix - 3, iy);
        ctx.lineTo(ix + 3, iy);
        ctx.stroke();
        if (!isExpanded) {
          ctx.beginPath();
          ctx.moveTo(ix, iy - 3);
          ctx.lineTo(ix, iy + 3);
          ctx.stroke();
        }
      }

      // Label
      const maxLabelWidth = node.isRoot ? 60 : node.depth === 1 ? 90 : 70;
      const fontSize = node.isRoot ? 11 : node.depth === 1 ? 10 : 9;
      ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHovered || isSelected ? '#fafafa' : '#a1a1aa';

      // Wrap text
      const labelY = node.y + r + 6;
      const words = node.label.split(/\s+/);
      let line = '';
      let lineNum = 0;
      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxLabelWidth && line) {
          ctx.fillText(line, node.x, labelY + lineNum * (fontSize + 2));
          line = word;
          lineNum++;
          if (lineNum >= 2) {
            // Truncate with ellipsis
            ctx.fillText(word.length > 8 ? word.slice(0, 7) + '…' : word, node.x, labelY + lineNum * (fontSize + 2));
            break;
          }
        } else {
          line = testLine;
        }
      }
      if (lineNum < 2 && line) {
        ctx.fillText(line, node.x, labelY + lineNum * (fontSize + 2));
      }

      // Memory count badge
      if (node.depth >= 1) {
        const countText = String(node.memoryCount);
        ctx.font = `600 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const tw = ctx.measureText(countText).width;
        const badgeW = Math.max(tw + 8, 16);
        const badgeH = 14;
        const bx = node.x - badgeW / 2;
        const by = node.y - 5;

        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, 4);
        ctx.fillStyle = '#18181b';
        ctx.fill();
        ctx.strokeStyle = node.color + '50';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.fillStyle = '#d4d4d8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countText, node.x, by + badgeH / 2);
      }
    }

    ctx.restore();
  }, [layout, hoveredId, selectedTopic, expandedIds, dimensions, transform]);

  // Hit testing
  const hitTest = useCallback((clientX: number, clientY: number): LayoutNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - transform.x) / transform.scale;
    const y = (clientY - rect.top - transform.y) / transform.scale;

    // Check nodes in reverse (top-most first)
    const nodes = [...layoutRef.current.nodes].reverse();
    for (const node of nodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      const hitRadius = node.radius + 8; // Generous hit area
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
    }
    return null;
  }, [transform]);

  // Mouse events
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.dragging) {
      setTransform(prev => ({
        ...prev,
        x: dragRef.current.startTx + (e.clientX - dragRef.current.startX),
        y: dragRef.current.startTy + (e.clientY - dragRef.current.startY),
      }));
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    }
    setHoveredId(hit?.id || null);
  }, [hitTest]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) return; // Don't start drag on node
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startTx: transform.x,
      startTy: transform.y,
    };
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'grabbing';
  }, [hitTest, transform]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'grab';
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      onTopicClick(null);
      return;
    }

    if (hit.isRoot) {
      onTopicClick(null);
      return;
    }

    // Toggle expand for topics with children
    if (hit.depth === 1 && hit.topic?.children && hit.topic.children.length > 0) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        return next;
      });
    }

    if (hit.topic) {
      onTopicClick(hit.topic);
    }
  }, [hitTest, onTopicClick]);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setTransform(prev => {
      const newScale = Math.min(3, Math.max(0.3, prev.scale * delta));
      const scaleChange = newScale / prev.scale;
      return {
        scale: newScale,
        x: mouseX - (mouseX - prev.x) * scaleChange,
        y: mouseY - (mouseY - prev.y) * scaleChange,
      };
    });
  }, []);

  const zoomIn = () => setTransform(prev => ({ ...prev, scale: Math.min(3, prev.scale * 1.2) }));
  const zoomOut = () => setTransform(prev => ({ ...prev, scale: Math.max(0.3, prev.scale / 1.2) }));
  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 });

  return (
    <div ref={containerRef} className="relative w-full h-full rounded-2xl overflow-hidden bg-[#0a0a0b] border border-white/[0.06]">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: dimensions.width, height: dimensions.height }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        className="touch-none"
      />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button onClick={zoomIn} className="p-2 rounded-xl bg-[#18181b] border border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={zoomOut} className="p-2 rounded-xl bg-[#18181b] border border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={resetView} className="p-2 rounded-xl bg-[#18181b] border border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Scale indicator */}
      <div className="absolute bottom-4 left-4 px-2.5 py-1 rounded-lg bg-[#18181b]/80 border border-white/[0.06] text-[10px] text-zinc-500 font-mono tabular-nums">
        {Math.round(transform.scale * 100)}%
      </div>
    </div>
  );
}

// ─── Topic Detail Panel ─────────────────────────────────────────

function TopicPanel({
  topic,
  onClose,
  colorIndex,
}: {
  topic: TopicNode;
  onClose: () => void;
  colorIndex: number;
}) {
  const router = useRouter();
  const color = TOPIC_COLORS[colorIndex % TOPIC_COLORS.length];

  const sourceEntries = Object.entries(topic.sourceTypes).sort((a, b) => b[1] - a[1]);
  const totalInSources = sourceEntries.reduce((sum, [_, c]) => sum + c, 0);

  // Get all memories (from children if any)
  const allMemories = topic.children.length > 0
    ? topic.children.flatMap(c => c.memories)
    : topic.memories;

  return (
    <div className="absolute top-4 right-4 w-80 max-h-[calc(100%-32px)] overflow-y-auto rounded-2xl bg-[#111113]/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl shadow-black/50 mm-panel-in">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <h3 className="text-[15px] font-semibold text-zinc-100 truncate">
              {topic.label}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {topic.memoryCount} memories
          </span>
          {topic.children.length > 0 && (
            <span className="flex items-center gap-1">
              <Network className="w-3 h-3" />
              {topic.children.length} subtopics
            </span>
          )}
          <span className="flex items-center gap-1 tabular-nums">
            {Math.round(topic.coherence * 100)}% coherent
          </span>
        </div>
      </div>

      {/* Keywords */}
      {topic.keywords.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag className="w-3 h-3 text-zinc-600" />
            <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Keywords</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topic.keywords.map(kw => (
              <span
                key={kw}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                style={{
                  backgroundColor: color + '15',
                  color: color,
                  border: `1px solid ${color}20`,
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Source breakdown */}
      {sourceEntries.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Sources</div>
          <div className="space-y-1.5">
            {sourceEntries.map(([type, count]) => {
              const src = SOURCE_ICONS[type] || SOURCE_ICONS.file;
              const Icon = src.icon;
              const pct = Math.round((count / totalInSources) * 100);
              return (
                <div key={type} className="flex items-center gap-2">
                  <Icon className="w-3 h-3 shrink-0" style={{ color: src.color }} />
                  <span className="text-[11px] text-zinc-400 capitalize flex-1">{type}</span>
                  <span className="text-[10px] text-zinc-600 tabular-nums">{count}</span>
                  <div className="w-12 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: src.color + '80' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-topics */}
      {topic.children.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Subtopics</div>
          <div className="space-y-1">
            {topic.children.map(sub => (
              <div
                key={sub.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color + '80' }}
                />
                <span className="text-[12px] text-zinc-300 flex-1 truncate">{sub.label}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums">{sub.memoryCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories */}
      {allMemories.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">
            Sample memories
          </div>
          <div className="space-y-1.5">
            {allMemories.slice(0, 5).map(mem => {
              const src = SOURCE_ICONS[mem.sourceType] || SOURCE_ICONS.file;
              const Icon = src.icon;
              return (
                <button
                  key={mem.id}
                  onClick={() => router.push(`/app/explore?q=${encodeURIComponent(mem.title.slice(0, 30))}`)}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon className="w-3 h-3 shrink-0" style={{ color: src.color }} />
                    <span className="text-[11px] text-zinc-300 font-medium truncate group-hover:text-white transition-colors">
                      {mem.title}
                    </span>
                    {mem.pinned && <Pin className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                  </div>
                  <p className="text-[10px] text-zinc-600 line-clamp-2 pl-5">
                    {mem.preview}
                  </p>
                </button>
              );
            })}
          </div>
          {topic.memoryCount > 5 && (
            <button
              onClick={() => router.push(`/app/explore?q=${encodeURIComponent(topic.label)}`)}
              className="flex items-center gap-1 mt-2 text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
            >
              View all {topic.memoryCount} in Explore
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes mm-panel-in {
          from { opacity: 0; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .mm-panel-in { animation: mm-panel-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function MindMapPage() {
  usePageTitle("Mind Map");
  const [data, setData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<TopicNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/plugins/mind-map-generator');
      if (!res.ok) throw new Error('Failed to generate mind map');
      const json = await res.json();
      setData(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate mind map';
      setError(msg);
      toast.error('Could not generate mind map', { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedColorIndex = data?.tree.children.findIndex(c => c.id === selectedTopic?.id) ?? 0;

  return (
    <PageTransition>
      <div className="space-y-5 md:space-y-6">
        <Stagger>
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Mind Map</h1>
              <p className="text-[13px] text-zinc-500 mt-0.5">
                Your knowledge, organized into topics
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              {data && (
                <div className="hidden sm:flex items-center gap-3 mr-2 text-[11px] text-zinc-600">
                  <span className="tabular-nums">{data.stats.topicCount} topics</span>
                  <span className="text-zinc-800">·</span>
                  <span className="tabular-nums">{data.stats.totalMemories} memories</span>
                  {data.stats.connectionCount > 0 && (
                    <>
                      <span className="text-zinc-800">·</span>
                      <span className="tabular-nums">{data.stats.connectionCount} connections</span>
                    </>
                  )}
                </div>
              )}
              <button
                onClick={() => { setSelectedTopic(null); loadData(); }}
                disabled={loading}
                className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </Stagger>

        <Stagger>
          {/* Map container */}
          {loading ? (
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden" style={{ height: 'calc(100dvh - 180px)' }}>
              <div className="h-full flex flex-col">
                {/* Simulated cluster bubbles skeleton */}
                <div className="flex-1 flex items-center justify-center relative">
                  <div className="absolute inset-0 p-8">
                    <div className="w-full h-full relative">
                      {[
                        { w: 80, h: 80, top: '15%', left: '20%', delay: '0s' },
                        { w: 60, h: 60, top: '30%', left: '55%', delay: '0.15s' },
                        { w: 100, h: 100, top: '45%', left: '35%', delay: '0.3s' },
                        { w: 50, h: 50, top: '20%', left: '70%', delay: '0.45s' },
                        { w: 70, h: 70, top: '60%', left: '60%', delay: '0.6s' },
                      ].map((b, i) => (
                        <div
                          key={i}
                          className="absolute rounded-full bg-teal-500/[0.04] border border-teal-500/[0.08] animate-pulse"
                          style={{ width: b.w, height: b.h, top: b.top, left: b.left, animationDelay: b.delay }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="relative flex flex-col items-center gap-3 z-10">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full border-2 border-teal-500/40 border-t-teal-400 animate-spin" />
                    </div>
                    <p className="text-[13px] text-zinc-500">Clustering your memories…</p>
                  </div>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center rounded-2xl bg-white/[0.02] border border-white/[0.06]" style={{ height: 'calc(100dvh - 180px)' }}>
              <div className="flex flex-col items-center gap-3 text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Network className="w-5 h-5 text-red-400" />
                </div>
                <p className="text-[13px] text-zinc-400">{error}</p>
                <button
                  onClick={loadData}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-500 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : data && data.stats.totalMemories === 0 ? (
            <div className="flex items-center justify-center rounded-2xl bg-white/[0.02] border border-white/[0.06]" style={{ height: 'calc(100dvh - 180px)' }}>
              <EmptyFeatureState
                icon={Network}
                title="Visualize how your ideas connect"
                description="Your Mind Map clusters related memories into topics and reveals surprising connections. Import notes, conversations, or articles to see your knowledge take shape."
                ctaText="Import your first data →"
                ctaHref="/app/import"
                secondaryText="or explore with demo data"
                secondaryHref="/app?demo=true"
              />
            </div>
          ) : data ? (
            <div className="relative" style={{ height: 'calc(100dvh - 180px)' }}>
              <MindMapCanvas
                data={data}
                onTopicClick={setSelectedTopic}
                selectedTopic={selectedTopic}
              />

              {/* Topic detail panel */}
              {selectedTopic && (
                <TopicPanel
                  topic={selectedTopic}
                  onClose={() => setSelectedTopic(null)}
                  colorIndex={selectedColorIndex}
                />
              )}

              {/* Topic list (mobile) */}
              {!selectedTopic && data.tree.children.length > 0 && (
                <div className="absolute top-4 left-4 sm:hidden">
                  <button
                    onClick={() => {
                      if (data.tree.children.length > 0) {
                        setSelectedTopic(data.tree.children[0]);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-[#18181b]/90 backdrop-blur-sm border border-white/[0.06] text-[12px] text-zinc-300 font-medium flex items-center gap-2"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    {data.stats.topicCount} topics
                  </button>
                </div>
              )}

              {/* Legend */}
              {data.tree.children.length > 0 && !selectedTopic && (
                <div className="absolute top-4 left-4 hidden sm:block">
                  <div className="p-3 rounded-xl bg-[#111113]/90 backdrop-blur-sm border border-white/[0.06] max-w-[180px]">
                    <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Topics</div>
                    <div className="space-y-1">
                      {data.tree.children.slice(0, 8).map((topic, i) => (
                        <button
                          key={topic.id}
                          onClick={() => setSelectedTopic(topic)}
                          className="flex items-center gap-2 w-full px-1.5 py-1 rounded-md hover:bg-white/[0.04] transition-colors text-left"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: TOPIC_COLORS[i % TOPIC_COLORS.length] }}
                          />
                          <span className="text-[11px] text-zinc-400 truncate flex-1">{topic.label}</span>
                          <span className="text-[10px] text-zinc-600 tabular-nums">{topic.memoryCount}</span>
                        </button>
                      ))}
                      {data.tree.children.length > 8 && (
                        <div className="text-[10px] text-zinc-700 pl-5 pt-0.5">
                          +{data.tree.children.length - 8} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </Stagger>
      </div>
    </PageTransition>
  );
}
