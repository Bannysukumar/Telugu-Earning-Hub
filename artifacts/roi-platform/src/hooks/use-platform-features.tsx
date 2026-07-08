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
  const { data, isLoading, isError } = useGetPlatformFeatures({
    query: {
      ...getGetPlatformFeaturesQueryOptions(),
      staleTime: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  });

  // Until features load successfully, treat binary as off so we don't spam
  // /api/user/binary-tree while /api/platform/features is missing/down.
  const resolved = !isLoading && !isError && data != null;

  return (
    <PlatformFeaturesContext.Provider
      value={{
        binaryPlanEnabled: resolved ? Boolean(data.binaryPlanEnabled) : false,
        directIncomeEnabled: resolved ? Boolean(data.directIncomeEnabled) : true,
        isLoading: isLoading || (!resolved && !isError),
      }}
    >
      {children}
    </PlatformFeaturesContext.Provider>
  );
}

export function usePlatformFeatures() {
  return useContext(PlatformFeaturesContext);
}
