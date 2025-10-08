import { LoaderCircle } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

function PageLoader() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex items-center justify-center h-screen">
      {prefersReducedMotion ? (
        // Static loader for users who prefer reduced motion
        <div className="flex items-center gap-2 text-slate-400">
          <LoaderCircle className="size-10" />
          <span>Loading...</span>
        </div>
      ) : (
        // Animated loader for users who don't mind motion
        <LoaderCircle className="animate-spin size-10" />
      )}
    </div>
  );
}

export default PageLoader;
