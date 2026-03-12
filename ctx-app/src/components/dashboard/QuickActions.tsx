import { useState } from 'react';
import type { ApiClient } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

interface QuickActionsProps {
  client: ApiClient;
  onRefresh: () => Promise<void>;
}

const PROVIDERS = ['claude', 'gemini', 'codex', 'opencode'];

export function QuickActions({ client, onRefresh }: QuickActionsProps) {
  const state = useAppStore((s) => s.state);
  const presets = state?.consilium ?? [];
  const currentLead = state?.pipeline?.lead || 'codex';

  const [lead, setLead] = useState(currentLead);
  const [preset, setPreset] = useState(presets[0]?.name || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', padding: '12px', background: 'var(--surface-alt)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' }}>
      <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--muted)', alignSelf: 'center' }}>Quick Actions</span>

      {/* Lead Provider */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          style={{ fontSize: '12px', padding: '4px 8px' }}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p}{p === currentLead ? ' (current)' : ''}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => wrap('lead', () => client.setLead(lead))}
          disabled={busy !== null || lead === currentLead}
          style={{ fontSize: '12px', padding: '4px 10px' }}
        >
          {busy === 'lead' ? '...' : 'Set Lead'}
        </button>
      </div>

      {/* Reset Pipeline */}
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Reset pipeline? All current state will be cleared.')) {
            void wrap('reset', () => client.resetPipeline());
          }
        }}
        disabled={busy !== null}
        style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--danger, #e53e3e)', color: 'white', borderColor: 'var(--danger, #e53e3e)' }}
      >
        {busy === 'reset' ? 'Resetting...' : 'Reset Pipeline'}
      </button>

      {/* Consilium */}
      {presets.length > 0 ? (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            {presets.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => wrap('consilium', () => client.activateConsiliumPreset(preset))}
            disabled={busy !== null}
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            {busy === 'consilium' ? 'Starting...' : 'Run Consilium'}
          </button>
        </div>
      ) : null}

      {error ? <span style={{ fontSize: '12px', color: 'var(--danger, #e53e3e)' }}>{error}</span> : null}
    </div>
  );
}
