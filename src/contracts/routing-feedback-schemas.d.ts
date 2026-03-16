export type RoutingFeedbackVerdict = 'positive' | 'neutral' | 'negative';

export interface RoutingFeedbackPayload {
  decisionId: number;
  provider?: string;
  taskType?: string;
  verdict: RoutingFeedbackVerdict;
  note?: string;
  actor?: string;
}

export interface RoutingFeedbackRecord {
  id: number;
  decisionId: number;
  provider: string;
  taskType: string;
  verdict: RoutingFeedbackVerdict;
  note: string | null;
  actor: string;
  createdAt: string;
}

export interface RoutingDecisionFeedbackSummary {
  verdict: RoutingFeedbackVerdict | 'unrated';
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  note: string | null;
  lastSubmittedAt: string | null;
}

export interface RoutingProviderFeedback {
  provider: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  score: number;
}

export interface RoutingExplainabilityDecision {
  id: number | null;
  timestamp: string;
  taskType: string;
  selectedProvider: string;
  runnerUp: string | null;
  routingMode: 'static' | 'adaptive' | 'override';
  finalScore: number;
  scoreMargin: number | null;
  diverged: boolean;
  contributions: {
    static: number;
    evaluation: number;
    feedback: number;
    exploration: number;
  };
  explanation: {
    headline: string;
    summary: string;
    factors: string[];
  };
  feedback: RoutingDecisionFeedbackSummary;
}

export interface RoutingExplainabilitySummary {
  generatedAt: string;
  mode: 'static' | 'adaptive' | 'config_off' | 'forced_off';
  readiness: {
    totalRuns: number;
    isReady: boolean;
    alpha: number;
    adaptiveEnabled: boolean;
  };
  totals: {
    totalDecisions: number;
    decisionCount: number;
    feedbackCount: number;
    negativeFeedbackCount: number;
  };
  anomalies: Array<{ type: string; severity: string; message: string }>;
  distribution: Array<{ selected_provider: string; cnt: number }>;
  decisions: RoutingExplainabilityDecision[];
  feedback: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    byProvider: RoutingProviderFeedback[];
  };
}
