import { Navigate } from "react-router";
import { useAuthStore } from "@/store/useAuthStore";
import PageLoader from "./PageLoader";

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export const ProtectedRoute = ({
  children,
  redirectTo = "/login",
}: ProtectedRouteProps) => {
  const { authUser, isCheckingAuth } = useAuthStore();

  if (isCheckingAuth) {
    return <PageLoader />;
  }

  if (!authUser) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export const PublicRoute = ({
  children,
  redirectTo = "/",
}: ProtectedRouteProps) => {
  const { authUser, isCheckingAuth } = useAuthStore();

  if (isCheckingAuth) {
    return <PageLoader />;
  }

  if (authUser) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};
