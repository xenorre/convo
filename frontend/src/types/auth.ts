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

export interface AuthState {
  authUser: AuthUser | null;
  isCheckingAuth: boolean;
  isSigningUp: boolean;

  isLoggingIn: boolean;
  socket: AppSocket | null;
  onlineUsers: string[];
  checkAuth: () => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;

  login: (data: LoginData) => Promise<void>;
  logout: () => Promise<void>;
  // Applies a profile change returned by the server to the signed-in user.
  updateAuthUser: (user: AuthUser) => void;
  forceLogout: (message?: string, sessionVersion?: number) => void;
  connectSocket: () => Promise<void>;
  disconnectSocket: () => void;
}
