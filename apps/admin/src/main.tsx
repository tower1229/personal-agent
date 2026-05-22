import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  adminAuthConfigResponseSchema,
  adminMeResponseSchema,
  type AdminAuthConfigResponse,
  type AdminMeResponse
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

function App() {
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [config, setConfig] = useState<AdminAuthConfigResponse | null>(null);
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

  async function logout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include"
    });
    setMe({ authenticated: false });
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
        <section className="grid">
          <article className="panel">
            <h2>Session</h2>
            <p>ID: {me.user.id}</p>
            <p>Username: {me.user.username ?? "未提供"}</p>
            <p>Name: {me.user.firstName ?? "未提供"}</p>
          </article>
          {["Skills", "Runs", "Schedules", "RAG", "Search", "Evals"].map(
            (item) => (
              <article className="panel" key={item}>
                <h2>{item}</h2>
                <p>第二阶段占位，后续阶段接入真实功能。</p>
              </article>
            )
          )}
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
