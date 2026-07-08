import { Redirect } from "wouter";
import { usePlatformFeatures } from "@/hooks/use-platform-features";

export function RequireBinaryPlan({ children }: { children: React.ReactNode }) {
  const { binaryPlanEnabled, isLoading } = usePlatformFeatures();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!binaryPlanEnabled) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}
