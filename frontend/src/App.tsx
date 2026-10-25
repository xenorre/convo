import { Navigate, Route, Routes, useNavigate } from "react-router";
import Login from "@/pages/Login";
import RootLayout from "@/RootLayout";
import { ProtectedRoute, PublicRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./store/useAuthStore";
import PageLoader from "./components/PageLoader";
import { AppToaster } from "./components/AppToaster";
import { registerAppNavigate } from "./utils/appNavigation";

const ChatPage = lazy(() => import("@/pages/ChatPage"));
const SignUp = lazy(() => import("@/pages/SignUp"));
const CheckEmail = lazy(() => import("@/pages/CheckEmail"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ProfileSettings = lazy(() => import("@/pages/settings/ProfileSettings"));
const AccountSettings = lazy(() => import("@/pages/settings/AccountSettings"));
const PrivacySettings = lazy(() => import("@/pages/settings/PrivacySettings"));
const NotificationsSettings = lazy(() => import("@/pages/settings/NotificationsSettings"));
const PreferencesSettings = lazy(() => import("@/pages/settings/PreferencesSettings"));
const AboutSettings = lazy(() => import("@/pages/settings/AboutSettings"));

function App() {
  const checkAuth = useAuthStore(state => state.checkAuth);
  const navigate = useNavigate();

  useEffect(() => registerAppNavigate(to => navigate(to)), [navigate]);

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
              path="/check-email"
              element={
                <PublicRoute>
                  <Suspense fallback={<PageLoader />}>
                    <CheckEmail />
                  </Suspense>
                </PublicRoute>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <PublicRoute>
                  <Suspense fallback={<PageLoader />}>
                    <ForgotPassword />
                  </Suspense>
                </PublicRoute>
              }
            />
            {/* Not PublicRoutes: these links sign in even if someone else was. */}
            <Route
              path="/verify-email"
              element={
                <Suspense fallback={<PageLoader />}>
                  <VerifyEmail />
                </Suspense>
              }
            />
            <Route
              path="/reset-password"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ResetPassword />
                </Suspense>
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
              <Route path="account" element={<AccountSettings />} />
              <Route path="privacy" element={<PrivacySettings />} />
              <Route path="notifications" element={<NotificationsSettings />} />
              <Route path="preferences" element={<PreferencesSettings />} />
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
