import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Check, X } from 'lucide-react';

export interface ClaimNodeData {
  claimId: string;
  text: string;
  claimType: string;
  status: 'consensus' | 'contested' | 'unique';
  supportedBy?: string[];
  from?: string;
  userVerdict?: 'true' | 'false' | null;
  onOpenVerdict?: (claimId: string) => void;
}

const STATUS_STYLES: Record<string, { border: string; bg: string }> = {
  consensus: {
    border: 'var(--success)',
    bg: 'color-mix(in srgb, var(--success), transparent 88%)',
  },
  contested: {
    border: 'var(--warning)',
    bg: 'color-mix(in srgb, var(--warning), transparent 88%)',
  },
  unique: {
    border: 'var(--border-soft)',
    bg: 'var(--surface-alt)',
  },
};

function ClaimNodeInner({ data }: NodeProps<ClaimNodeData>) {
  const style = STATUS_STYLES[data.status] || STATUS_STYLES.unique;
  const isContested = data.status === 'contested';

  return (
    <div
      style={{
        width: 260,
        borderRadius: 10,
        border: `2px solid ${style.border}`,
        background: style.bg,
        color: 'var(--text)',
        padding: '10px 12px',
        cursor: isContested ? 'pointer' : 'default',
        transition: 'transform 0.15s ease',
        fontSize: 12,
      }}
      onClick={() => {
        if (isContested && data.onOpenVerdict) {
          data.onOpenVerdict(data.claimId);
        }
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {data.claimId}
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>
          {data.claimType}
        </span>
      </div>

      <div style={{ lineHeight: 1.4, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.text}
      </div>

      {data.status === 'consensus' && data.supportedBy && data.supportedBy.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          Поддержано: {data.supportedBy.join(', ')}
        </div>
      )}

      {data.status === 'unique' && data.from && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          От: {data.from}
        </div>
      )}

      {data.userVerdict && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
            fontSize: 10,
            color: data.userVerdict === 'true' ? 'var(--success)' : 'var(--danger)',
            fontWeight: 600,
          }}
        >
          {data.userVerdict === 'true' ? <Check size={12} /> : <X size={12} />}
          Помечено пользователем
        </div>
      )}
    </div>
  );
}

export const ClaimNode = memo(ClaimNodeInner);
