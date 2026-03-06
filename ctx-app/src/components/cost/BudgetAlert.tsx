import { AlertTriangle, XCircle, CheckCircle } from 'lucide-react';

export interface BudgetAlertProps {
  currentCost: number;
  budgetLimit: number;
  warningThreshold?: number; // percentage (default 80%)
}

export function BudgetAlert({
  currentCost,
  budgetLimit,
  warningThreshold = 80
}: BudgetAlertProps) {
  const usagePercentage = (currentCost / budgetLimit) * 100;
  const isExceeded = usagePercentage >= 100;
  const isWarning = usagePercentage >= warningThreshold && !isExceeded;
  const isNormal = !isWarning && !isExceeded;

  if (isNormal) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 8,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border-soft)',
        }}
      >
        <CheckCircle size={20} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            Бюджет в норме
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Использовано ${currentCost.toFixed(4)} из ${budgetLimit.toFixed(2)} ({usagePercentage.toFixed(1)}%)
          </div>
        </div>
      </div>
    );
  }

  if (isWarning) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 8,
          background: 'rgba(255, 193, 7, 0.1)',
          border: '1px solid rgba(255, 193, 7, 0.3)',
        }}
      >
        <AlertTriangle size={20} style={{ color: '#ffc107', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            Приближение к лимиту бюджета
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Использовано ${currentCost.toFixed(4)} из ${budgetLimit.toFixed(2)} ({usagePercentage.toFixed(1)}%)
          </div>
          <div style={{ fontSize: 11, color: '#ffc107', marginTop: 4, fontWeight: 500 }}>
            ⚠️ Осталось ${(budgetLimit - currentCost).toFixed(4)}
          </div>
        </div>
      </div>
    );
  }

  // isExceeded
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 8,
        background: 'rgba(244, 67, 54, 0.1)',
        border: '1px solid rgba(244, 67, 54, 0.3)',
      }}
    >
      <XCircle size={20} style={{ color: '#f44336', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          Бюджет превышен
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Использовано ${currentCost.toFixed(4)} из ${budgetLimit.toFixed(2)} ({usagePercentage.toFixed(1)}%)
        </div>
        <div style={{ fontSize: 11, color: '#f44336', marginTop: 4, fontWeight: 500 }}>
          🚨 Превышение на ${(currentCost - budgetLimit).toFixed(4)}
        </div>
      </div>
    </div>
  );
}
