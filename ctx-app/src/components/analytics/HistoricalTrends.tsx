import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import type { RoutingDecision } from '../../api/types';

interface HistoricalTrendsProps {
  decisions: RoutingDecision[];
}

const CHART_COLORS = ['#5fa2ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#ec4899'];

interface TimePoint {
  time: string;
  timestamp: number;
  [provider: string]: string | number;
}

function groupDecisionsByTime(decisions: RoutingDecision[], intervalMinutes: number = 60): TimePoint[] {
  if (decisions.length === 0) return [];

  // Group decisions into time buckets
  const buckets = new Map<number, RoutingDecision[]>();

  decisions.forEach((d) => {
    const ts = new Date(d.timestamp).getTime();
    const bucketKey = Math.floor(ts / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(d);
  });

  // Sort buckets by time
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  // Calculate metrics for each bucket
  return sortedBuckets.map(([bucketKey, bucketDecisions]) => {
    const point: TimePoint = {
      time: new Date(bucketKey).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: bucketKey,
    };

    // Get unique providers in this bucket
    const providers = new Set(bucketDecisions.map(d => d.selected_provider));

    // Calculate average score per provider
    providers.forEach(provider => {
      const providerDecisions = bucketDecisions.filter(d => d.selected_provider === provider);
      const avgScore = providerDecisions.reduce((sum, d) => sum + d.final_score, 0) / providerDecisions.length;
      point[provider] = +avgScore.toFixed(3);
    });

    return point;
  });
}

function ScoreTrends({ decisions }: { decisions: RoutingDecision[] }) {
  const chartData = useMemo(() => groupDecisionsByTime(decisions, 60), [decisions]);

  if (chartData.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>Недостаточно данных для отображения трендов оценок.</p>;
  }

  // Get all unique providers
  const allProviders = Array.from(
    new Set(decisions.map(d => d.selected_provider))
  ).sort();

  // Calculate trend for overall average score
  const overallScores = chartData.map(d => {
    const providerScores = allProviders.map(p => (d[p] as number) || 0).filter(s => s > 0);
    return providerScores.length > 0 ? providerScores.reduce((a, b) => a + b, 0) / providerScores.length : 0;
  });

  const midpoint = Math.floor(overallScores.length / 2);
  const firstHalf = overallScores.slice(0, midpoint);
  const secondHalf = overallScores.slice(midpoint);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const scoreTrend = avgSecond - avgFirst;
  const scoreTrendPercent = avgFirst > 0 ? ((scoreTrend / avgFirst) * 100).toFixed(1) : '0.0';

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Тренды оценок по времени</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Средние оценки по провайдерам
          {scoreTrend > 0.01 && (
            <span style={{ color: 'var(--success, #34d399)', marginLeft: 8, fontWeight: 'bold' }}>
              ↑ +{scoreTrendPercent}%
            </span>
          )}
          {scoreTrend < -0.01 && (
            <span style={{ color: 'var(--error, #f87171)', marginLeft: 8, fontWeight: 'bold' }}>
              ↓ {scoreTrendPercent}%
            </span>
          )}
        </span>
      </header>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="time" stroke="var(--muted)" fontSize={10} />
          <YAxis stroke="var(--muted)" fontSize={11} domain={[0, 1]} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {allProviders.map((provider, i) => (
            <Line
              key={provider}
              type="monotone"
              dataKey={provider}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={provider}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function UsageDistributionOverTime({ decisions }: { decisions: RoutingDecision[] }) {
  const chartData = useMemo(() => {
    if (decisions.length === 0) return [];

    const buckets = new Map<number, Map<string, number>>();
    const intervalMinutes = 60;

    decisions.forEach((d) => {
      const ts = new Date(d.timestamp).getTime();
      const bucketKey = Math.floor(ts / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, new Map());
      }

      const providerCounts = buckets.get(bucketKey)!;
      providerCounts.set(
        d.selected_provider,
        (providerCounts.get(d.selected_provider) || 0) + 1
      );
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketKey, providerCounts]) => {
        const point: TimePoint = {
          time: new Date(bucketKey).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: bucketKey,
        };
        providerCounts.forEach((count, provider) => {
          point[provider] = count;
        });
        return point;
      });
  }, [decisions]);

  if (chartData.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>Недостаточно данных для отображения распределения использования.</p>;
  }

  const allProviders = Array.from(
    new Set(decisions.map(d => d.selected_provider))
  ).sort();

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Распределение использования по времени</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Количество решений по провайдерам</span>
      </header>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="time" stroke="var(--muted)" fontSize={10} />
          <YAxis stroke="var(--muted)" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {allProviders.map((provider, i) => (
            <Line
              key={provider}
              type="monotone"
              dataKey={provider}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={provider}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RoutingModeEvolution({ decisions }: { decisions: RoutingDecision[] }) {
  const chartData = useMemo(() => {
    if (decisions.length === 0) return [];

    const buckets = new Map<number, { exploit: number; explore: number; total: number }>();
    const intervalMinutes = 60;

    decisions.forEach((d) => {
      const ts = new Date(d.timestamp).getTime();
      const bucketKey = Math.floor(ts / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { exploit: 0, explore: 0, total: 0 });
      }

      const bucket = buckets.get(bucketKey)!;
      bucket.total++;

      if (d.routing_mode === 'explore') {
        bucket.explore++;
      } else {
        bucket.exploit++;
      }
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketKey, counts]) => ({
        time: new Date(bucketKey).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: bucketKey,
        exploitRate: counts.total > 0 ? +(counts.exploit / counts.total * 100).toFixed(1) : 0,
        exploreRate: counts.total > 0 ? +(counts.explore / counts.total * 100).toFixed(1) : 0,
      }));
  }, [decisions]);

  if (chartData.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>Недостаточно данных для отображения эволюции режима роутинга.</p>;
  }

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Эволюция режима роутинга</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Баланс exploit/explore по времени</span>
      </header>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="time" stroke="var(--muted)" fontSize={10} />
          <YAxis stroke="var(--muted)" fontSize={11} domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => `${value}%`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="exploitRate"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Exploit %"
          />
          <Line
            type="monotone"
            dataKey="exploreRate"
            stroke={CHART_COLORS[2]}
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Explore %"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function WinRateImprovement({ decisions }: { decisions: RoutingDecision[] }) {
  const chartData = useMemo(() => {
    if (decisions.length === 0) return [];

    const buckets = new Map<number, { wins: number; total: number }>();
    const intervalMinutes = 60;

    decisions.forEach((d) => {
      const ts = new Date(d.timestamp).getTime();
      const bucketKey = Math.floor(ts / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { wins: 0, total: 0 });
      }

      const bucket = buckets.get(bucketKey)!;
      bucket.total++;
      // A "win" is when the selected provider has a high final_score (> 0.7) or is the clear best choice
      if (d.final_score > 0.7) {
        bucket.wins++;
      }
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketKey, counts]) => ({
        time: new Date(bucketKey).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: bucketKey,
        winRate: counts.total > 0 ? +((counts.wins / counts.total) * 100).toFixed(1) : 0,
      }));
  }, [decisions]);

  if (chartData.length === 0) {
    return null;
  }

  // Calculate improvement: compare first half vs second half
  const midpoint = Math.floor(chartData.length / 2);
  const firstHalf = chartData.slice(0, midpoint);
  const secondHalf = chartData.slice(midpoint);

  const avgFirstHalf = firstHalf.reduce((sum, d) => sum + d.winRate, 0) / firstHalf.length;
  const avgSecondHalf = secondHalf.reduce((sum, d) => sum + d.winRate, 0) / secondHalf.length;
  const improvement = avgSecondHalf - avgFirstHalf;
  const improvementPercent = avgFirstHalf > 0 ? ((improvement / avgFirstHalf) * 100).toFixed(1) : '0.0';

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Улучшение точности маршрутизации</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Win Rate по времени
          {improvement > 0 && (
            <span style={{ color: 'var(--success, #34d399)', marginLeft: 8, fontWeight: 'bold' }}>
              ↑ +{improvementPercent}% улучшение
            </span>
          )}
          {improvement < 0 && (
            <span style={{ color: 'var(--error, #f87171)', marginLeft: 8, fontWeight: 'bold' }}>
              ↓ {improvementPercent}% снижение
            </span>
          )}
          {improvement === 0 && (
            <span style={{ marginLeft: 8, fontWeight: 'bold' }}>→ Стабильно</span>
          )}
        </span>
      </header>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="time" stroke="var(--muted)" fontSize={10} />
          <YAxis stroke="var(--muted)" fontSize={11} domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => `${value}%`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke={CHART_COLORS[0]}
            strokeWidth={3}
            dot={{ r: 4 }}
            name="Win Rate %"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HistoricalTrends({ decisions }: HistoricalTrendsProps) {
  if (decisions.length === 0) {
    return (
      <p style={{ fontSize: 13, opacity: 0.6 }}>
        Недостаточно данных для отображения исторических трендов. Включите CTX_ADAPTIVE_ROUTING=1 для сбора данных.
      </p>
    );
  }

  return (
    <div>
      <WinRateImprovement decisions={decisions} />
      <ScoreTrends decisions={decisions} />
      <UsageDistributionOverTime decisions={decisions} />
      <RoutingModeEvolution decisions={decisions} />
    </div>
  );
}
