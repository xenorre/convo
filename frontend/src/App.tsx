import { Navigate, Route, Routes } from "react-router";
import Login from "@/pages/Login";
import RootLayout from "@/RootLayout";
import { ProtectedRoute, PublicRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./store/useAuthStore";
import PageLoader from "./components/PageLoader";
import { AppToaster } from "./components/AppToaster";

const ChatPage = lazy(() => import("@/pages/ChatPage"));
const SignUp = lazy(() => import("@/pages/SignUp"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ProfileSettings = lazy(() => import("@/pages/settings/ProfileSettings"));
const AboutSettings = lazy(() => import("@/pages/settings/AboutSettings"));

function App() {
  const checkAuth = useAuthStore(state => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route
              index
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <ChatPage />
                  </Suspense>
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
                  <Suspense fallback={<PageLoader />}>
                    <SignUp />
                  </Suspense>
                </PublicRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <SettingsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            >
              {/* Desktop shows the first section next to the list; phones show only the list. */}
              <Route index element={<ProfileSettings />} />
              <Route path="profile" element={<ProfileSettings />} />
              <Route path="about" element={<AboutSettings />} />
              <Route path="*" element={<Navigate to="/settings" replace />} />
            </Route>
          </Route>
        </Routes>
      </ErrorBoundary>
      <AppToaster />
    </>
  );
}

export default App;
