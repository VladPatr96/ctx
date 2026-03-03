import { useCallback, useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType, ReactFlowProvider, type Edge, type Node, type NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { Search, FileText, ListTodo, MessageSquare, ClipboardList, Play, CheckCircle2 } from 'lucide-react';
import type { PipelineState } from '../../api/types';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'] as const;

const STAGE_ICONS: Record<string, typeof Search> = {
  detect: Search,
  context: FileText,
  task: ListTodo,
  brainstorm: MessageSquare,
  plan: ClipboardList,
  execute: Play,
  done: CheckCircle2,
};

interface StageNodeData {
  stage: string;
  status: 'done' | 'active' | 'pending';
  lead?: string;
  task?: string;
}

function StageNode({ data }: NodeProps<StageNodeData>) {
  const Icon = STAGE_ICONS[data.stage] || Search;
  const borderColor = data.status === 'done' ? 'var(--success)' : data.status === 'active' ? 'var(--primary)' : 'var(--border-soft)';
  const bg = data.status === 'done'
    ? 'color-mix(in srgb, var(--success), transparent 88%)'
    : data.status === 'active'
      ? 'color-mix(in srgb, var(--primary), transparent 85%)'
      : 'var(--surface-alt)';
  const color = data.status === 'pending' ? 'var(--muted)' : 'var(--text)';

  return (
    <div
      style={{
        width: 160,
        borderRadius: 10,
        border: `2px solid ${borderColor}`,
        background: bg,
        color,
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon size={16} />
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{data.stage}</span>
      </div>
      {data.status === 'active' && data.lead ? (
        <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2 }}>
          Ведущий: {data.lead}
        </div>
      ) : null}
      {data.status === 'active' && data.task ? (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
          {data.task}
        </div>
      ) : null}
    </div>
  );
}

const nodeTypes = { stage: StageNode };

interface PipelineGraphProps {
  pipeline: PipelineState | null;
  onStageClick?: (stage: string) => void;
}

export function PipelineGraph({ pipeline, onStageClick }: PipelineGraphProps) {
  const activeIndex = STAGES.indexOf((pipeline?.stage || '') as typeof STAGES[number]);

  const { nodes, edges } = useMemo(() => {
    const graphNodes: Node<StageNodeData>[] = STAGES.map((stage, index) => {
      const status = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
      return {
        id: stage,
        type: 'stage',
        position: { x: index * 200, y: 0 },
        draggable: false,
        data: {
          stage,
          status,
          lead: status === 'active' ? pipeline?.lead : undefined,
          task: status === 'active' ? (pipeline?.task || undefined) : undefined,
        },
      };
    });

    const graphEdges: Edge[] = STAGES.slice(1).map((stage, index) => ({
      id: `e-${STAGES[index]}-${stage}`,
      source: STAGES[index],
      target: stage,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: index === activeIndex - 1,
      style: { stroke: index < activeIndex ? 'var(--success)' : 'var(--border-soft)' },
    }));

    return { nodes: graphNodes, edges: graphEdges };
  }, [activeIndex, pipeline?.lead, pipeline?.task]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onStageClick?.(node.id);
  }, [onStageClick]);

  return (
    <ReactFlowProvider>
      <div className="graph-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
