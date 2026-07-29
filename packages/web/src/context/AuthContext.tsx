import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@notorious/shared";
import { authApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      refetch: async () => {
        const result = await refetch();
        await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        return result;
      },
    }),
    [data, isLoading, refetch, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
