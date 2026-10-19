export const SESSION_REVOKED_MESSAGE =
  'You have been signed out because your account was signed in on another device.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has ended. Please sign in again.';

export interface AuthenticationFailure {
  version: number;
  code: string;
  message: string;
}

// A response belongs to the session that started its request. Advancing this
// version prevents an old request or socket from changing a newer login.
let authSessionVersion = 0;
let onAuthenticationFailure: ((failure: AuthenticationFailure) => void) | undefined;

export const getAuthSessionVersion = (): number => authSessionVersion;
export const advanceAuthSession = (): number => ++authSessionVersion;
export const isCurrentAuthSession = (version: number): boolean =>
  version === authSessionVersion;

export const registerAuthenticationFailureHandler = (
  handler: (failure: AuthenticationFailure) => void
): void => {
  onAuthenticationFailure = handler;
};

export const reportAuthenticationFailure = (failure: AuthenticationFailure): void => {
  if (isCurrentAuthSession(failure.version)) onAuthenticationFailure?.(failure);
};

export const isSessionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return (
    error.code === 'SESSION_REVOKED' ||
    error.code === 'SESSION_EXPIRED' ||
    error.code === 'STALE_AUTH_RESPONSE'
  );
};
