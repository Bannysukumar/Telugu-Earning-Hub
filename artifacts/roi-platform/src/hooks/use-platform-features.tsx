import { createContext, useContext, type ReactNode } from "react";
import { getGetPlatformFeaturesQueryOptions, useGetPlatformFeatures } from "@workspace/api-client-react";

type PlatformFeaturesContextValue = {
  binaryPlanEnabled: boolean;
  directIncomeEnabled: boolean;
  isLoading: boolean;
};

const PlatformFeaturesContext = createContext<PlatformFeaturesContextValue>({
  binaryPlanEnabled: true,
  directIncomeEnabled: true,
  isLoading: true,
});

export function PlatformFeaturesProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useGetPlatformFeatures({
    query: { ...getGetPlatformFeaturesQueryOptions(), staleTime: 60_000, refetchOnWindowFocus: true },
  });

  return (
    <PlatformFeaturesContext.Provider
      value={{
        binaryPlanEnabled: data?.binaryPlanEnabled ?? true,
        directIncomeEnabled: data?.directIncomeEnabled ?? true,
        isLoading,
      }}
    >
      {children}
    </PlatformFeaturesContext.Provider>
  );
}

export function usePlatformFeatures() {
  return useContext(PlatformFeaturesContext);
}
