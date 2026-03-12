import securityScan from './security-scan.js';

export default async function securityReport(args = {}, ctx) {
  const format = args.format || 'markdown';
  const scope = args.scope || 'all';
  const scan = await securityScan({ scope }, ctx);

  if (format === 'json') {
    return scan;
  }

  const lines = [
    '# Security Report',
    '',
    `Generated: ${scan.scannedAt}`,
    `Scope: ${scan.scope}`,
    '',
    `Critical: ${scan.critical}`,
    `High: ${scan.high}`,
    `Medium: ${scan.medium}`,
    `Low: ${scan.low}`,
    '',
  ];

  if (scan.findings.length === 0) {
    lines.push('No findings.');
  } else {
    lines.push('## Findings', '');
    for (const finding of scan.findings) {
      const location = finding.file ? `${finding.file}:${finding.line || 0}` : finding.package;
      lines.push(`- [${finding.severity}] ${finding.message || finding.type} (${location})`);
    }
  }

  return {
    format: 'markdown',
    report: lines.join('\n'),
    summary: {
      critical: scan.critical,
      high: scan.high,
      medium: scan.medium,
      low: scan.low,
      findings: scan.findings.length,
    },
  };
}
