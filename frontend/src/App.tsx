import { Route, Routes } from "react-router";
import ChatPage from "@/pages/ChatPage";
import Login from "@/pages/Login";
import SignUp from "@/pages/SignUp";
import RootLayout from "@/RootLayout";
import { ProtectedRoute, PublicRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { useEffect } from "react";
import { useAuthStore } from "./store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import PageLoader from "./components/PageLoader";
import { Toaster } from "react-hot-toast";

function App() {
  const { checkAuth, isCheckingAuth, socket, authUser } = useAuthStore();
  const { bindSocketOnce, resetChat } = useChatStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Reset private chat data before binding the next account's socket.
  useEffect(() => {
    resetChat();
  }, [authUser?._id, resetChat]);

  // Bind global socket handlers once a socket exists
  useEffect(() => {
    if (socket) bindSocketOnce();
  }, [socket, bindSocketOnce]);

  if (isCheckingAuth) return <PageLoader />;

  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route
              index
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/sign-up"
              element={
                <PublicRoute>
                  <SignUp />
                </PublicRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute>
                  <div>Settings Page</div>
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </ErrorBoundary>
      {authUser ? <ConnectionStatus /> : null}
      <Toaster />
    </>
  );
}

export default App;
