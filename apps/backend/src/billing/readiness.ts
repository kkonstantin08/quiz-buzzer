export function checkBillingReadiness(): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];

  reasons.push('YooKassa provider is not implemented');
  reasons.push('Payment creation is missing');
  reasons.push('Webhook endpoint and processing are missing');
  reasons.push('Idempotency is missing');
  reasons.push('Fiscal receipts are not configured');
  reasons.push('Auto-renewal cancellation is missing');
  reasons.push('Refunds are missing');

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
