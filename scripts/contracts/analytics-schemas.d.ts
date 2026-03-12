export interface AnalyticsQuality {
  score: number;
  successRate: number;
  avgLatencyMs: number;
  calls: number;
}

export interface AnalyticsBudgetEntry {
  scope: 'global' | 'provider' | 'session' | 'project';
  key: string | null;
  status: string;
  budget: number;
  currentCost: number;
  remaining: number;
  percentUsed: number;
  alert: string | null;
}

export interface AnalyticsModelCard {
  model: string;
  totalCost: number;
  requests: number;
  totalTokens: number;
  avgCostPerRequest: number;
  avgCostPer1kTokens: number;
}

export interface AnalyticsProviderCard {
  provider: string;
  totalCost: number;
  requests: number;
  totalTokens: number;
  avgCostPerRequest: number;
  avgCostPer1kTokens: number;
  efficiencyScore: number | null;
  quality: AnalyticsQuality | null;
  budget: AnalyticsBudgetEntry | null;
  models: AnalyticsModelCard[];
}

export interface AnalyticsTrendPoint {
  bucketStart: string;
  label: string;
  totalCost: number;
  requests: number;
  providers: Record<string, number>;
}

export interface AnalyticsTimeline {
  granularity: 'day';
  days: number;
  points: AnalyticsTrendPoint[];
}

export interface AnalyticsRecommendation {
  type: string;
  priority: string;
  title: string;
  description: string;
  confidence: string | null;
  currentProvider: string | null;
  suggestedProvider: string | null;
  currentModel: string | null;
  suggestedModel: string | null;
  impact: {
    savingsPerRequest: number;
    savingsPercent: number;
    estimatedMonthlySavings: number;
  };
}

export interface AnalyticsRoutingSnapshot {
  available: boolean;
  totalDecisions: number;
  anomalyCount: number;
  divergedCount: number;
  dominantProvider: string | null;
  lastDecisionAt: string | null;
}

export interface AnalyticsSummary {
  generatedAt: string;
  totals: {
    totalCost: number;
    totalRequests: number;
    totalTokens: number;
    providerCount: number;
    costPerRequest: number;
    projectedMonthlyCost: number;
    projectionConfidence: 'high' | 'medium' | 'low' | 'none';
  };
  providers: AnalyticsProviderCard[];
  timeline: AnalyticsTimeline;
  recommendations: AnalyticsRecommendation[];
  budget: {
    hasAlerts: boolean;
    thresholds: {
      warning: number;
      critical: number;
    };
    global: AnalyticsBudgetEntry | null;
    providers: AnalyticsBudgetEntry[];
  };
  routing: AnalyticsRoutingSnapshot;
  gaps: string[];
}

export function parseAnalyticsSummary(input: unknown): AnalyticsSummary;
export function createAnalyticsSummary(input: {
  generatedAt: string;
  totals: AnalyticsSummary['totals'];
  providers: AnalyticsProviderCard[];
  timeline: AnalyticsTimeline;
  recommendations: AnalyticsRecommendation[];
  budget: AnalyticsSummary['budget'];
  routing: AnalyticsRoutingSnapshot;
  gaps?: string[];
}): AnalyticsSummary;
