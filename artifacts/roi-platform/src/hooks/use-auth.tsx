import React, { createContext, useContext, useState } from "react";
import { useGetMe, type User } from "@workspace/api-client-react";
import { AUTH_ME_QUERY_KEY } from "@/lib/query-keys";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("roi_token"));
  
  const { data: user, isLoading, refetch } = useGetMe({
    query: {
      queryKey: AUTH_ME_QUERY_KEY,
      enabled: !!token,
      retry: false,
    },
  });

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("roi_token", newToken);
    localStorage.setItem("roi_user", JSON.stringify(newUser));
    setToken(newToken);
    refetch();
  };

  const logout = () => {
    localStorage.removeItem("roi_token");
    localStorage.removeItem("roi_user");
    setToken(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
