const deletingAccounts = new Set<string>();

// ponytail: process-local fence matches the current single-backend deployment; use a shared store when scaling out.
export function beginAccountDeletion(userId: string) {
  if (deletingAccounts.has(userId)) return false;
  deletingAccounts.add(userId);
  return true;
}

export function isAccountDeletionInProgress(userId: string) {
  return deletingAccounts.has(userId);
}

export function endAccountDeletion(userId: string) {
  deletingAccounts.delete(userId);
}
