import { api } from '../services/api';
import { socket } from './socket';
import { useEffect, useRef } from 'react';

const authErrorCodes = new Set([
  'AUTH_TOKEN_INVALID',
  'AUTH_SESSION_MISSING',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
  'AUTH_SESSION_INVALID',
]);

function getAuthErrorCode(error: Error): string | undefined {
  const data: unknown = Reflect.get(error, 'data');
  if (typeof data !== 'object' || data === null || !('code' in data)) return undefined;
  return typeof data.code === 'string' ? data.code : undefined;
}

export function isSocketAuthError(error: Error) {
  return authErrorCodes.has(getAuthErrorCode(error) ?? '');
}

export function createSocketAuthRecovery(onRecovered: () => void | Promise<void>, onRecoveryError: () => void) {
  let recoveryStarted = false;

  return async (error: Error) => {
    if (!isSocketAuthError(error)) return false;

    socket.io.opts.reconnection = false;
    socket.disconnect();
    if (recoveryStarted) {
      onRecoveryError();
      return true;
    }

    recoveryStarted = true;
    try {
      await api.clearSession();
      await onRecovered();
    } catch {
      onRecoveryError();
    }
    return true;
  };
}

export function useSocketAuthRecovery(onRecovered: () => void | Promise<void>, onRecoveryError: () => void) {
  const onRecoveredRef = useRef(onRecovered);
  const onRecoveryErrorRef = useRef(onRecoveryError);
  onRecoveredRef.current = onRecovered;
  onRecoveryErrorRef.current = onRecoveryError;

  useEffect(() => {
    const recover = createSocketAuthRecovery(
      () => onRecoveredRef.current(),
      () => onRecoveryErrorRef.current(),
    );
    const onConnectError = (error: Error) => { void recover(error); };
    socket.on('connect_error', onConnectError);
    return () => { socket.off('connect_error', onConnectError); };
  }, []);
}
