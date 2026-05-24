import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type {
  AdminAuthConfigResponse,
  AdminMeResponse
} from "@personal-agent/shared";
import { loadSession, postEmpty } from "@/lib/api";

interface AuthState {
  authConfig: AdminAuthConfigResponse | null;
  error: string | null;
  loading: boolean;
  me: AdminMeResponse | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider(props: { children: ReactNode }) {
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [authConfig, setAuthConfig] =
    useState<AdminAuthConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const session = await loadSession();
      setMe(session.me);
      setAuthConfig(session.authConfig);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载登录状态失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await postEmpty("/api/admin/logout");
    setMe({ authenticated: false });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      authConfig,
      error,
      loading,
      logout,
      me,
      refresh
    }),
    [authConfig, error, loading, logout, me, refresh]
  );

  return (
    <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
