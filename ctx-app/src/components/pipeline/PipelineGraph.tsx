import { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType, type Edge, type Node } from 'reactflow';
import type { PipelineState } from '../../api/types';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];

interface PipelineGraphProps {
  pipeline: PipelineState | null;
}

export function PipelineGraph({ pipeline }: PipelineGraphProps) {
  const activeIndex = STAGES.indexOf((pipeline?.stage || '').toLowerCase());

  const { nodes, edges } = useMemo(() => {
    const graphNodes: Node[] = STAGES.map((stage, index) => {
      const status = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
      const border = status === 'done' ? 'var(--success)' : status === 'active' ? 'var(--primary)' : 'var(--border-soft)';
      const bg = status === 'done'
        ? 'color-mix(in srgb, var(--success), transparent 88%)'
        : status === 'active'
          ? 'color-mix(in srgb, var(--primary), transparent 85%)'
          : 'var(--surface-alt)';
      const color = status === 'pending' ? 'var(--muted)' : 'var(--text)';
      return {
        id: stage,
        position: { x: index * 220, y: 0 },
        draggable: false,
        data: { label: stage.toUpperCase() },
        style: {
          width: 180,
          borderRadius: 10,
          border: `1px solid ${border}`,
          background: bg,
          color,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center',
          padding: 10
        }
      };
    });

    const graphEdges: Edge[] = STAGES.slice(1).map((stage, index) => ({
      id: `e-${STAGES[index]}-${stage}`,
      source: STAGES[index],
      target: stage,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: index === activeIndex - 1,
      style: { stroke: 'var(--border-soft)' }
    }));

    return { nodes: graphNodes, edges: graphEdges };
  }, [activeIndex]);

  return (
    <div className="graph-wrap">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
