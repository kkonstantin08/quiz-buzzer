export interface ReadinessResult {
  ready: boolean;
  reasons: string[];
}

export function checkBillingReadiness(env: Record<string, string | undefined> = process.env): ReadinessResult {
  const reasons: string[] = [];

  const requiredEnvVars = [
    'YOOKASSA_SHOP_ID',
    'YOOKASSA_SECRET_KEY',
    'YOOKASSA_WEBHOOK_URL',
    'PUBLIC_APP_URL',
    'CORS_ORIGIN'
  ];

  for (const v of requiredEnvVars) {
    if (!env[v]) {
      reasons.push(`Missing environment variable: ${v}`);
    }
  }

  if (env.PUBLIC_APP_URL && !env.PUBLIC_APP_URL.startsWith('https://')) {
    reasons.push('Security error: PUBLIC_APP_URL must use https://');
  }

  if (env.CORS_ORIGIN && !env.CORS_ORIGIN.startsWith('https://') && env.NODE_ENV === 'production') {
    reasons.push('Security error: CORS_ORIGIN must use https:// in production');
  }

  reasons.push('Implementation missing: Payment provider integration not fully implemented');
  reasons.push('Implementation missing: Webhook handler not fully implemented');
  reasons.push('Implementation missing: Fiscal receipts are not configured');
  reasons.push('Implementation missing: Refunds implementation missing');
  reasons.push('Implementation missing: Auto-renew cancellation logic not implemented');

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
