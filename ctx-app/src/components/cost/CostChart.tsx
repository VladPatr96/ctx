import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

export interface CostDataPoint {
  timestamp: string;
  cost: number;
  requests?: number;
  provider?: string;
}

interface CostChartProps {
  data: CostDataPoint[];
  height?: number;
  showRequests?: boolean;
}

interface TooltipPayload {
  value: number;
  name: string;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <div style={{ marginBottom: 4, color: 'var(--muted)', fontWeight: 600 }}>
        {label}
      </div>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: entry.color,
            }}
          />
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>
            {entry.name}:{' '}
            {entry.dataKey === 'cost'
              ? `$${entry.value.toFixed(4)}`
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CostChart({ data, height = 300, showRequests = false }: CostChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      // Generate sample data for demonstration
      const now = Date.now();
      return Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(now - (9 - i) * 60000).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        cost: Math.random() * 0.01 + 0.005,
        requests: Math.floor(Math.random() * 10) + 1,
      }));
    }

    // Format timestamps for display
    return data.map((point) => ({
      ...point,
      timestamp: new Date(point.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));
  }, [data]);

  const hasData = data && data.length > 0;
  const totalCost = useMemo(() => {
    return chartData.reduce((sum, point) => sum + point.cost, 0);
  }, [chartData]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={16} style={{ color: 'var(--primary)' }} />
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Стоимость во времени
          </h4>
        </div>
        {!hasData && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            (демонстрационные данные)
          </span>
        )}
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 8,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border-soft)',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
          Общая стоимость за период
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>
          ${totalCost.toFixed(4)}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-soft)"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            stroke="var(--muted)"
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickLine={{ stroke: 'var(--border-soft)' }}
          />
          <YAxis
            yAxisId="cost"
            stroke="var(--muted)"
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickLine={{ stroke: 'var(--border-soft)' }}
            tickFormatter={(value) => `$${value.toFixed(3)}`}
          />
          {showRequests && (
            <YAxis
              yAxisId="requests"
              orientation="right"
              stroke="var(--muted)"
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--border-soft)' }}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              fontSize: 12,
              color: 'var(--text)',
            }}
            iconType="line"
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="cost"
            name="Стоимость"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ fill: 'var(--primary)', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6 }}
          />
          {showRequests && (
            <Line
              yAxisId="requests"
              type="monotone"
              dataKey="requests"
              name="Запросы"
              stroke="var(--success)"
              strokeWidth={2}
              dot={{ fill: 'var(--success)', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
