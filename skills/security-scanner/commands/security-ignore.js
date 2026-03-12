export default async function securityIgnore(args = {}, ctx) {
  const pattern = args.pattern || args._ || args.value || null;

  if (!pattern) {
    return {
      error: 'Missing ignore pattern',
      usage: 'security-ignore --pattern "<value>"',
    };
  }

  if (ctx?.appendLog) {
    ctx.appendLog({
      action: 'security_ignore',
      pattern,
    });
  }

  return {
    ignored: pattern,
    saved: false,
    message: 'Ignore pattern accepted for this run. Persistent ignore storage is not configured yet.',
  };
}
