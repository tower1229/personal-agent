import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminMemoriesResponseSchema,
  adminMeResponseSchema,
  adminRunsResponseSchema,
  adminTodosResponseSchema,
  type AdminAuthConfigResponse,
  type AdminApprovalsResponse,
  type AdminMemoriesResponse,
  type AdminMeResponse,
  type AdminRunsResponse,
  type AdminTodosResponse
} from "@personal-agent/shared";

async function fetchJson<T>(
  path: string,
  parse: (input: unknown) => T
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return parse(await response.json());
}

function TelegramLogin(props: { config: AdminAuthConfigResponse | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.config || !containerRef.current) {
      return;
    }

    containerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLogin = props.config.botUsername;
    script.dataset.size = "large";
    script.dataset.authUrl = `${window.location.origin}/auth/telegram/callback`;
    script.dataset.requestAccess = "write";
    containerRef.current.append(script);
  }, [props.config]);

  return <div className="telegram-login" ref={containerRef} />;
}

interface DashboardData {
  runs: AdminRunsResponse;
  todos: AdminTodosResponse;
  memories: AdminMemoriesResponse;
  approvals: AdminApprovalsResponse;
}

function formatTime(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function EmptyList() {
  return <p className="muted">暂无数据</p>;
}

function App() {
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [config, setConfig] = useState<AdminAuthConfigResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchJson("/api/admin/me", (input) => adminMeResponseSchema.parse(input)),
      fetchJson("/api/admin/auth-config", (input) =>
        adminAuthConfigResponseSchema.parse(input)
      )
    ])
      .then(([meResponse, authConfig]) => {
        setMe(meResponse);
        setConfig(authConfig);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      });
  }, []);

  useEffect(() => {
    if (!me?.authenticated) {
      setDashboard(null);
      return;
    }

    void Promise.all([
      fetchJson("/api/admin/runs", (input) =>
        adminRunsResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/todos", (input) =>
        adminTodosResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/memories", (input) =>
        adminMemoriesResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/approvals", (input) =>
        adminApprovalsResponseSchema.parse(input)
      )
    ])
      .then(([runs, todos, memories, approvals]) => {
        setDashboard({ runs, todos, memories, approvals });
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      });
  }, [me]);

  async function logout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include"
    });
    setMe({ authenticated: false });
    setDashboard(null);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Personal Agent</p>
          <h1>Admin Console</h1>
        </div>
        {me?.authenticated ? (
          <button className="text-button" onClick={() => void logout()}>
            退出
          </button>
        ) : null}
      </header>

      {error ? <p className="notice danger">{error}</p> : null}

      {!me ? <p className="notice">加载登录状态...</p> : null}

      {me && !me.authenticated ? (
        <section className="panel login-panel">
          <h2>Telegram 登录</h2>
          <p>仅 owner Telegram 账号可以进入控制台。</p>
          <TelegramLogin config={config} />
        </section>
      ) : null}

      {me?.authenticated ? (
        <>
          <section className="grid summary-grid">
            <article className="panel">
              <h2>Session</h2>
              <p>ID: {me.user.id}</p>
              <p>Username: {me.user.username ?? "未提供"}</p>
              <p>Name: {me.user.firstName ?? "未提供"}</p>
            </article>
            <article className="panel">
              <h2>Runtime</h2>
              <p>D1: connected</p>
              <p>Telegram webhook: enabled</p>
              <p>LLM/skill: pending</p>
            </article>
          </section>

          {!dashboard ? <p className="notice">加载运行数据...</p> : null}

          {dashboard ? (
            <section className="data-grid">
              <article className="panel list-panel">
                <h2>Runs</h2>
                {dashboard.runs.items.length === 0 ? <EmptyList /> : null}
                {dashboard.runs.items.map((run) => (
                  <div className="list-row" key={run.id}>
                    <div>
                      <strong>{run.status}</strong>
                      <p>{run.messageText ?? "(empty)"}</p>
                    </div>
                    <span>{formatTime(run.createdAt)}</span>
                  </div>
                ))}
              </article>

              <article className="panel list-panel">
                <h2>Todos</h2>
                {dashboard.todos.items.length === 0 ? <EmptyList /> : null}
                {dashboard.todos.items.map((todo) => (
                  <div className="list-row" key={todo.id}>
                    <div>
                      <strong>#{todo.id}</strong>
                      <p>{todo.title}</p>
                    </div>
                    <span>{todo.status}</span>
                  </div>
                ))}
              </article>

              <article className="panel list-panel">
                <h2>Memories</h2>
                {dashboard.memories.items.length === 0 ? <EmptyList /> : null}
                {dashboard.memories.items.map((memory) => (
                  <div className="list-row" key={memory.id}>
                    <div>
                      <strong>#{memory.id}</strong>
                      <p>{memory.content}</p>
                    </div>
                    <span>{memory.status}</span>
                  </div>
                ))}
              </article>

              <article className="panel list-panel">
                <h2>Approvals</h2>
                {dashboard.approvals.items.length === 0 ? <EmptyList /> : null}
                {dashboard.approvals.items.map((approval) => (
                  <div className="list-row" key={approval.id}>
                    <div>
                      <strong>{approval.action}</strong>
                      <p>code: {approval.code}</p>
                    </div>
                    <span>{approval.status}</span>
                  </div>
                ))}
              </article>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
