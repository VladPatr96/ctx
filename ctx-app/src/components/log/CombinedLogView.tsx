import { useState } from 'react';
import { SessionActivityFeed } from '../session/SessionActivityFeed';
import { LogStream } from './LogStream';

interface CombinedLogViewProps {
    stageFilter?: string;
    onClearStageFilter?: () => void;
}

export function CombinedLogView({ stageFilter, onClearStageFilter }: CombinedLogViewProps) {
    const [viewMode, setViewMode] = useState<'narrative' | 'raw'>('narrative');

    return (
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Журнал активности</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        className={`nav-btn ${viewMode === 'narrative' ? 'active' : ''}`}
                        onClick={() => setViewMode('narrative')}
                        style={viewMode === 'narrative' ? { background: 'var(--border-color)' } : {}}
                    >
                        Narrative View
                    </button>
                    <button
                        type="button"
                        className={`nav-btn ${viewMode === 'raw' ? 'active' : ''}`}
                        onClick={() => setViewMode('raw')}
                        style={viewMode === 'raw' ? { background: 'var(--border-color)' } : {}}
                    >
                        Raw Log
                    </button>
                </div>
            </div>

            {viewMode === 'narrative' ? (
                <SessionActivityFeed limit={50} showFilters={true} standalone={false} />
            ) : (
                <LogStream stageFilter={stageFilter} onClearStageFilter={onClearStageFilter} standalone={false} />
            )}
        </section>
    );
}
