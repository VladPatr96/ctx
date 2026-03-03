import React from 'react'

interface ConfidenceGaugeProps {
  value: number | null | undefined
  label?: string
}

const ConfidenceGauge: React.FC<ConfidenceGaugeProps> = ({ value, label }) => {
  if (value === null || value === undefined) {
    return (
      <div
        style={{
          width: '100%',
          fontSize: 12,
          color: '#9ca3af',
          lineHeight: 1.2
        }}
      >
        N/A
      </div>
    )
  }

  const normalized = Math.max(0, Math.min(1, value))
  const pct = (normalized * 100).toFixed(0)

  let fillColor = '#f87171'
  if (normalized > 0.7) {
    fillColor = '#34d399'
  } else if (normalized >= 0.4) {
    fillColor = '#fbbf24'
  }

  return (
    <div
      style={{
        width: '100%'
      }}
    >
      <div
        style={{
          width: '100%',
          height: 8,
          borderRadius: 4,
          background: 'var(--surface-alt, #1a2234)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${normalized * 100}%`,
            height: '100%',
            borderRadius: 4,
            background: fillColor
          }}
        />
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          lineHeight: 1.2
        }}
      >
        {label ? `${label}: ${pct}%` : `${pct}%`}
      </div>
    </div>
  )
}

export default ConfidenceGauge
export type { ConfidenceGaugeProps }
