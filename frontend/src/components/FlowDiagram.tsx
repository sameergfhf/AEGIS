// src/components/FlowDiagram.tsx — React Flow API behavior diagram

import { useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { FlowGraph } from '../types';
import { Network } from 'lucide-react';

interface Props {
  flow: FlowGraph;
}

// Stage → color mapping
const STAGE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  input:      { border: '#06b6d4', bg: '#0c4a6e', text: '#7dd3fc' },
  validation: { border: '#3b82f6', bg: '#1e3a5f', text: '#93c5fd' },
  request:    { border: '#8b5cf6', bg: '#2e1065', text: '#c4b5fd' },
  redirect:   { border: '#f97316', bg: '#431407', text: '#fdba74' },
  response:   { border: '#22c55e', bg: '#14532d', text: '#86efac' },
  analysis:   { border: '#a855f7', bg: '#3b0764', text: '#d8b4fe' },
  result:     { border: '#06b6d4', bg: '#164e63', text: '#67e8f9' },
  blocked:    { border: '#ef4444', bg: '#450a0a', text: '#fca5a5' },
};

function ScanNode({ data }: NodeProps) {
  const stage = data.stage as string || 'result';
  const colors = STAGE_COLORS[stage] || STAGE_COLORS.result;
  const label = data.label as string || '';
  const lines = label.split('\n');

  return (
    <div
      className="rounded-lg px-4 py-3 min-w-[140px] max-w-[200px] cursor-pointer"
      style={{
        border: `1px solid ${colors.border}`,
        background: `${colors.bg}cc`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: colors.border }} />
      <div>
        {lines.map((line, i) => (
          <p
            key={i}
            className={`text-xs leading-tight ${i === 0 ? 'font-semibold' : 'opacity-75'}`}
            style={{ color: colors.text }}
          >
            {line}
          </p>
        ))}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: colors.border }} />
    </div>
  );
}

const nodeTypes = { input: ScanNode, validation: ScanNode, request: ScanNode, redirect: ScanNode, response: ScanNode, analysis: ScanNode, result: ScanNode, blocked: ScanNode };

const DEFAULT_EDGE_STYLE = {
  stroke: '#475569',
  strokeWidth: 1.5,
};

export default function FlowDiagram({ flow }: Props) {
  const [selectedNode, setSelectedNode] = useState<FlowGraph['nodes'][0] | null>(null);

  // Convert backend nodes/edges to React Flow format
  const rfNodes: Node[] = flow.nodes.map((n) => ({
    id: n.id,
    type: n.type in nodeTypes ? n.type : 'result',
    position: n.position,
    data: { ...n.data, label: n.label },
  }));

  const rfEdges: Edge[] = flow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.animated,
    style: { ...DEFAULT_EDGE_STYLE, ...(e.style || {}) },
    labelStyle: { fill: '#94a3b8', fontSize: 10 },
    labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
  }));

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const original = flow.nodes.find((n) => n.id === node.id);
    setSelectedNode(original || null);
  }, [flow.nodes]);

  return (
    <div className="glass-card p-0 overflow-hidden fade-in" style={{ height: 420 }}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700/50">
        <Network className="w-4 h-4 text-blue-400" />
        <h3 className="text-base font-semibold text-white">API Behavior Flow</h3>
        <span className="text-xs text-slate-500 ml-1">Click nodes to inspect details</span>
      </div>

      <div className="relative" style={{ height: 370 }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          attributionPosition="bottom-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(71,85,105,0.3)" />
          <Controls style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
          <MiniMap
            nodeColor={(n) => {
              const stage = (n.data?.stage as string) || 'result';
              return STAGE_COLORS[stage]?.border || '#475569';
            }}
            style={{ background: '#1e293b', border: '1px solid #334155' }}
          />
        </ReactFlow>

        {/* Node detail panel */}
        {selectedNode && (
          <div className="absolute bottom-3 right-3 glass-card p-3 w-64 text-xs space-y-1 fade-in">
            <div className="flex justify-between items-center mb-1.5">
              <span className="font-semibold text-slate-200">{selectedNode.label.split('\n')[0]}</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            {selectedNode.data.description && (
              <p className="text-slate-400 leading-relaxed">{selectedNode.data.description as string}</p>
            )}
            {selectedNode.data.status_code && (
              <p className="text-slate-300">Status: <span className="text-green-400">{selectedNode.data.status_code as number}</span></p>
            )}
            {selectedNode.data.resolved_ip && (
              <p className="text-slate-300">Resolved IP: <span className="font-mono text-cyan-400">{selectedNode.data.resolved_ip as string}</span></p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
