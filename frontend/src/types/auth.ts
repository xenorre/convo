import type { AppSocket } from "./socket";

export interface AuthUser {
  fullName: string;
  _id: string;
  email: string;
  profilePic: string;
}

// Contact type for chat lists (doesn't include email for privacy)
export interface Contact {
  fullName: string;
  _id: string;
  profilePic: string;
}

export interface SignUpData {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export type SignUpOutcome =
  | { kind: "verify"; email: string; emailSent: boolean }
  | { kind: "refused"; code: string; message: string }
  | null;

export type ResetPasswordOutcome =
  | { kind: "done" }
  | { kind: "refused"; message: string }
  | { kind: "invalid" }
  | null;

export interface AuthState {
  authUser: AuthUser | null;
  isCheckingAuth: boolean;
  isSigningUp: boolean;

  isLoggingIn: boolean;
  socket: AppSocket | null;
  onlineUsers: string[];
  checkAuth: () => Promise<void>;
  // "verify": the account exists and waits for its email to be confirmed.
  // "refused": the server's reason for refusing the password, for its field.
  // null: something else failed, already reported as a toast.
  signUp: (data: SignUpData) => Promise<SignUpOutcome>;

  // Resolves with the email when the account still needs confirming.
  login: (data: LoginData) => Promise<{ unverifiedEmail: string } | null>;
  // Confirms the email from the emailed link and signs in; false if the
  // link is invalid, used or expired.
  verifyEmail: (token: string) => Promise<boolean>;
  // Sets a new password from the emailed link and signs in.
  // "done": signed in. "refused": the server's reason, for the password field.
  // "invalid": the link is unknown, used or expired.
  // null: something else failed, already reported as a toast.
  resetPassword: (token: string, password: string) => Promise<ResetPasswordOutcome>;
  logout: () => Promise<void>;
  // Applies a profile change returned by the server to the signed-in user.
  updateAuthUser: (user: AuthUser) => void;
  forceLogout: (message?: string, sessionVersion?: number) => void;
  connectSocket: () => Promise<void>;
  disconnectSocket: () => void;
  // Opens a fresh socket, e.g. after the server moved this browser to a new session.
  reconnectSocket: () => Promise<void>;
}
