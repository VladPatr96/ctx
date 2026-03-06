import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// Mock data for costs over the last 7 days
const MOCK_DATA = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
        date: date.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
        claude: Math.random() * 5 + 2, // $2-$7
        gemini: Math.random() * 2 + 0.5, // $0.5-$2.5
        opencode: Math.random() * 1 + 0.1, // $0.1-$1.1
    };
});

const COLORS = {
    claude: 'var(--primary, #6366f1)',
    gemini: 'var(--success, #10b981)',
    opencode: 'var(--warning, #f59e0b)',
};

export function CostAnalyticsWidget() {
    const totals = useMemo(() => {
        return MOCK_DATA.reduce(
            (acc, curr) => {
                acc.claude += curr.claude;
                acc.gemini += curr.gemini;
                acc.opencode += curr.opencode;
                acc.total += curr.claude + curr.gemini + curr.opencode;
                return acc;
            },
            { claude: 0, gemini: 0, opencode: 0, total: 0 }
        );
    }, []);

    return (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Аналитика расходов (7 дней)</h3>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)' }}>
                    ${totals.total.toFixed(2)}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px' }}>
                <div style={{ background: 'var(--surface-alt)', padding: '10px', borderRadius: '8px', borderLeft: `3px solid ${COLORS.claude}` }}>
                    <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>Claude</div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>${totals.claude.toFixed(2)}</div>
                </div>
                <div style={{ background: 'var(--surface-alt)', padding: '10px', borderRadius: '8px', borderLeft: `3px solid ${COLORS.gemini}` }}>
                    <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>Gemini</div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>${totals.gemini.toFixed(2)}</div>
                </div>
                <div style={{ background: 'var(--surface-alt)', padding: '10px', borderRadius: '8px', borderLeft: `3px solid ${COLORS.opencode}` }}>
                    <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>OpenCode</div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>${totals.opencode.toFixed(2)}</div>
                </div>
            </div>

            <div style={{ height: '220px', marginTop: '8px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={MOCK_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorClaude" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.claude} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={COLORS.claude} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorGemini" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.gemini} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={COLORS.gemini} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(val) => `$${val}`} />
                        <Tooltip
                            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                            itemStyle={{ fontSize: '12px' }}
                            formatter={(value: any) => {
                                const num = Number(value);
                                return [`$${isNaN(num) ? 0 : num.toFixed(2)}`, ''];
                            }}
                        />
                        <Area type="monotone" dataKey="claude" name="Claude" stroke={COLORS.claude} fillOpacity={1} fill="url(#colorClaude)" strokeWidth={2} />
                        <Area type="monotone" dataKey="gemini" name="Gemini" stroke={COLORS.gemini} fillOpacity={1} fill="url(#colorGemini)" strokeWidth={2} />
                        <Area type="monotone" dataKey="opencode" name="OpenCode" stroke={COLORS.opencode} fill="none" strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
