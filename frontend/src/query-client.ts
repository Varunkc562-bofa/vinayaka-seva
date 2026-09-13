import { QueryClient } from "@tanstack/react-query";

// Live-feel defaults: refetch on focus + soft polling so every member sees
// the same fresh data without pull-to-refresh.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
