import { useCallback, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, MarkerType, ReactFlowProvider, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { ClaimGraphData, ClaimPosition } from '../../api/types';
import { ClaimNode, type ClaimNodeData } from './ClaimNode';
import { VerdictPopover } from './VerdictPopover';

const nodeTypes = { claim: ClaimNode };

const COL_X = { consensus: 0, contested: 320, unique: 640 };
const ROW_GAP = 120;
const COL_LABELS = [
  { x: COL_X.consensus, label: 'Консенсус' },
  { x: COL_X.contested, label: 'Спорные' },
  { x: COL_X.unique, label: 'Уникальные' },
];

interface ClaimGraphExplorerProps {
  data: ClaimGraphData;
  onVerdictChange: (claimId: string, verdict: 'true' | 'false' | null) => void;
}

export function ClaimGraphExplorer({ data, onVerdictChange }: ClaimGraphExplorerProps) {
  const [activePopover, setActivePopover] = useState<string | null>(null);

  const handleOpenVerdict = useCallback((claimId: string) => {
    setActivePopover((prev) => (prev === claimId ? null : claimId));
  }, []);

  const { nodes, edges } = useMemo(() => {
    const graphNodes: Node<ClaimNodeData>[] = [];
    const graphEdges: Edge[] = [];

    // Consensus column
    data.consensus.forEach((claim, i) => {
      graphNodes.push({
        id: claim.id,
        type: 'claim',
        position: { x: COL_X.consensus, y: 40 + i * ROW_GAP },
        draggable: false,
        data: {
          claimId: claim.id,
          text: claim.text,
          claimType: claim.type,
          status: 'consensus',
          supportedBy: claim.supportedBy,
          userVerdict: null,
          onOpenVerdict: handleOpenVerdict,
        },
      });
    });

    // Contested column
    data.contested.forEach((claim, i) => {
      const verdict = data.userVerdicts?.[claim.id] ?? null;
      graphNodes.push({
        id: claim.id,
        type: 'claim',
        position: { x: COL_X.contested, y: 40 + i * ROW_GAP },
        draggable: false,
        data: {
          claimId: claim.id,
          text: claim.text,
          claimType: claim.type,
          status: 'contested',
          userVerdict: verdict,
          onOpenVerdict: handleOpenVerdict,
        },
      });

      // Edges from contested claims to participants
      claim.positions.forEach((pos, pi) => {
        const edgeColor = pos.stance === 'accept' ? 'var(--success)' : 'var(--danger)';
        graphEdges.push({
          id: `e-${claim.id}-${pos.alias}-${pi}`,
          source: claim.id,
          target: `participant-${pos.alias}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: edgeColor, strokeDasharray: pos.stance === 'challenge' ? '5 3' : undefined },
          label: pos.stance === 'challenge' ? 'оспаривает' : 'принимает',
          labelStyle: { fontSize: 9, fill: edgeColor },
        });
      });
    });

    // Unique column
    data.unique.forEach((claim, i) => {
      graphNodes.push({
        id: claim.id,
        type: 'claim',
        position: { x: COL_X.unique, y: 40 + i * ROW_GAP },
        draggable: false,
        data: {
          claimId: claim.id,
          text: claim.text,
          claimType: claim.type,
          status: 'unique',
          from: claim.from,
          userVerdict: null,
          onOpenVerdict: handleOpenVerdict,
        },
      });
    });

    return { nodes: graphNodes, edges: graphEdges };
  }, [data, handleOpenVerdict]);

  // Find the contested claim for the active popover
  const activeContestedClaim = activePopover
    ? data.contested.find((c) => c.id === activePopover)
    : null;

  return (
    <div>
      {/* Stats bar */}
      <div className="claim-stats-bar">
        <span>Всего: <strong>{data.stats.total}</strong></span>
        <span style={{ color: 'var(--success)' }}>Консенсус: <strong>{data.stats.consensus_count}</strong></span>
        <span style={{ color: 'var(--warning)' }}>Спорные: <strong>{data.stats.contested_count}</strong></span>
        <span style={{ color: 'var(--muted)' }}>Уникальные: <strong>{data.stats.unique_count}</strong></span>
        <span>Спорность: <strong>{(data.stats.contention_ratio * 100).toFixed(0)}%</strong></span>
      </div>

      {/* Legend */}
      <div className="claim-legend">
        {COL_LABELS.map((col) => {
          const color = col.label === 'Консенсус' ? 'var(--success)'
            : col.label === 'Спорные' ? 'var(--warning)' : 'var(--muted)';
          return (
            <span key={col.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
              {col.label}
            </span>
          );
        })}
      </div>

      {/* Graph */}
      <ReactFlowProvider>
        <div className="claim-graph-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>

      {/* Verdict popover */}
      {activeContestedClaim && (
        <VerdictPopover
          claimId={activeContestedClaim.id}
          claimText={activeContestedClaim.text}
          positions={activeContestedClaim.positions as ClaimPosition[]}
          currentVerdict={data.userVerdicts?.[activeContestedClaim.id] ?? null}
          onVerdict={(claimId, verdict) => {
            onVerdictChange(claimId, verdict);
            setActivePopover(null);
          }}
          onClose={() => setActivePopover(null)}
        />
      )}
    </div>
  );
}
