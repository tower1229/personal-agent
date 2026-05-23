import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminMemoriesResponseSchema,
  adminMeResponseSchema,
  adminRunsResponseSchema,
  adminSkillDetailResponseSchema,
  adminSkillRouteDecisionsResponseSchema,
  adminSkillRunsResponseSchema,
  adminSkillsResponseSchema,
  adminSkillTestRunRequestSchema,
  adminSkillTestRunResponseSchema,
  adminSkillUpsertRequestSchema,
  adminTodosResponseSchema,
  builtInToolNames,
  skillManifestSchema,
  type AdminAuthConfigResponse,
  type AdminApprovalsResponse,
  type AdminMemoriesResponse,
  type AdminMeResponse,
  type AdminRunsResponse,
  type AdminSkillDetail,
  type AdminSkillRouteDecisionsResponse,
  type AdminSkillRunsResponse,
  type AdminSkillsResponse,
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
  skills: AdminSkillsResponse;
  skillRuns: AdminSkillRunsResponse;
  routeDecisions: AdminSkillRouteDecisionsResponse;
}

interface SkillFormState {
  id: string;
  name: string;
  description: string;
  instructions: string;
  triggerPhrases: string;
  allowedTools: string[];
  enabled: boolean;
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

const emptySkillForm: SkillFormState = {
  id: "",
  name: "",
  description: "",
  instructions: "",
  triggerPhrases: "",
  allowedTools: ["list_todos", "search_memory"],
  enabled: true
};

async function sendJson<T>(
  path: string,
  method: string,
  body: unknown,
  parse: (input: unknown) => T
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return parse(await response.json());
}

function formFromSkill(skill: AdminSkillDetail): SkillFormState {
  return {
    id: skill.manifest.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    instructions: skill.manifest.instructions,
    triggerPhrases: skill.manifest.triggerPhrases.join("\n"),
    allowedTools: skill.manifest.allowedTools,
    enabled: skill.enabled
  };
}

function manifestFromForm(form: SkillFormState) {
  return skillManifestSchema.parse({
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    kind: "chat",
    enabled: form.enabled,
    triggerPhrases: form.triggerPhrases
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    intentExamples: [],
    instructions: form.instructions.trim(),
    allowedTools: form.allowedTools,
    riskLevel: "read",
    autoRunThreshold: 0.75,
    confirmThreshold: 0.45,
    workflowTemplate: []
  });
}

function App() {
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [config, setConfig] = useState<AdminAuthConfigResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [skillForm, setSkillForm] = useState<SkillFormState>(emptySkillForm);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [skillTestInput, setSkillTestInput] = useState("");
  const [skillTestOutput, setSkillTestOutput] = useState<string | null>(null);
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
      ),
      fetchJson("/api/admin/skills", (input) =>
        adminSkillsResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/skill-runs", (input) =>
        adminSkillRunsResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/skill-route-decisions", (input) =>
        adminSkillRouteDecisionsResponseSchema.parse(input)
      )
    ])
      .then(
        ([
          runs,
          todos,
          memories,
          approvals,
          skills,
          skillRuns,
          routeDecisions
        ]) => {
          setDashboard({
            runs,
            todos,
            memories,
            approvals,
            skills,
            skillRuns,
            routeDecisions
          });
        }
      )
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      });
  }, [me]);

  function reloadDashboard() {
    if (!me?.authenticated) {
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
      ),
      fetchJson("/api/admin/skills", (input) =>
        adminSkillsResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/skill-runs", (input) =>
        adminSkillRunsResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/skill-route-decisions", (input) =>
        adminSkillRouteDecisionsResponseSchema.parse(input)
      )
    ])
      .then(
        ([
          runs,
          todos,
          memories,
          approvals,
          skills,
          skillRuns,
          routeDecisions
        ]) => {
          setDashboard({
            runs,
            todos,
            memories,
            approvals,
            skills,
            skillRuns,
            routeDecisions
          });
        }
      )
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      });
  }

  async function saveSkill() {
    const manifest = manifestFromForm(skillForm);
    const path = selectedSkillId
      ? `/api/admin/skills/${selectedSkillId}`
      : "/api/admin/skills";
    const method = selectedSkillId ? "PUT" : "POST";
    const response = await sendJson(
      path,
      method,
      adminSkillUpsertRequestSchema.parse({ manifest }),
      (input) => adminSkillDetailResponseSchema.parse(input)
    );
    setSelectedSkillId(response.skill.id);
    setSkillForm(formFromSkill(response.skill));
    reloadDashboard();
  }

  async function loadSkill(id: string) {
    const response = await fetchJson(`/api/admin/skills/${id}`, (input) =>
      adminSkillDetailResponseSchema.parse(input)
    );
    setSelectedSkillId(id);
    setSkillForm(formFromSkill(response.skill));
    setSkillTestOutput(null);
  }

  async function publishSkill(id: string) {
    await fetch(`/api/admin/skills/${id}/publish`, {
      method: "POST",
      credentials: "include"
    });
    reloadDashboard();
  }

  async function setSkillEnabled(id: string, enabled: boolean) {
    await fetch(`/api/admin/skills/${id}/${enabled ? "enable" : "disable"}`, {
      method: "POST",
      credentials: "include"
    });
    reloadDashboard();
  }

  async function deleteSkill(id: string) {
    await fetch(`/api/admin/skills/${id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (selectedSkillId === id) {
      setSelectedSkillId(null);
      setSkillForm(emptySkillForm);
    }
    reloadDashboard();
  }

  async function testSkill() {
    if (!selectedSkillId) {
      return;
    }

    const response = await sendJson(
      `/api/admin/skills/${selectedSkillId}/test-run`,
      "POST",
      adminSkillTestRunRequestSchema.parse({ input: skillTestInput }),
      (input) => adminSkillTestRunResponseSchema.parse(input)
    );
    setSkillTestOutput(response.output);
    reloadDashboard();
  }

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
              <p>Skill: declarative v1</p>
            </article>
          </section>

          {!dashboard ? <p className="notice">加载运行数据...</p> : null}

          {dashboard ? (
            <>
              <section className="panel skill-editor">
                <div className="section-title">
                  <h2>Skills</h2>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelectedSkillId(null);
                      setSkillForm(emptySkillForm);
                      setSkillTestOutput(null);
                    }}
                  >
                    新建
                  </button>
                </div>

                <div className="skills-layout">
                  <div className="skill-list">
                    {dashboard.skills.items.length === 0 ? <EmptyList /> : null}
                    {dashboard.skills.items.map((skill) => (
                      <button
                        className={
                          selectedSkillId === skill.id
                            ? "skill-row active"
                            : "skill-row"
                        }
                        key={skill.id}
                        onClick={() => void loadSkill(skill.id)}
                      >
                        <span>{skill.name}</span>
                        <small>
                          {skill.enabled ? "enabled" : "disabled"} ·{" "}
                          {skill.publishedVersionId ? "published" : "draft"}
                        </small>
                      </button>
                    ))}
                  </div>

                  <form
                    className="skill-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveSkill().catch((saveError) => {
                        setError(
                          saveError instanceof Error
                            ? saveError.message
                            : "保存失败"
                        );
                      });
                    }}
                  >
                    <label>
                      ID
                      <input
                        value={skillForm.id}
                        disabled={Boolean(selectedSkillId)}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            id: event.target.value
                          })
                        }
                      />
                    </label>
                    <label>
                      名称
                      <input
                        value={skillForm.name}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            name: event.target.value
                          })
                        }
                      />
                    </label>
                    <label>
                      描述
                      <input
                        value={skillForm.description}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            description: event.target.value
                          })
                        }
                      />
                    </label>
                    <label>
                      触发短语
                      <textarea
                        rows={3}
                        value={skillForm.triggerPhrases}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            triggerPhrases: event.target.value
                          })
                        }
                      />
                    </label>
                    <label>
                      Instructions
                      <textarea
                        rows={5}
                        value={skillForm.instructions}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            instructions: event.target.value
                          })
                        }
                      />
                    </label>
                    <fieldset>
                      <legend>Allowed tools</legend>
                      {builtInToolNames.map((tool) => (
                        <label className="checkbox-row" key={tool}>
                          <input
                            type="checkbox"
                            checked={skillForm.allowedTools.includes(tool)}
                            onChange={(event) => {
                              const allowedTools = event.target.checked
                                ? [...skillForm.allowedTools, tool]
                                : skillForm.allowedTools.filter(
                                    (item) => item !== tool
                                  );
                              setSkillForm({
                                ...skillForm,
                                allowedTools
                              });
                            }}
                          />
                          {tool}
                        </label>
                      ))}
                    </fieldset>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={skillForm.enabled}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            enabled: event.target.checked
                          })
                        }
                      />
                      Enabled
                    </label>
                    <div className="button-row">
                      <button className="text-button" type="submit">
                        保存
                      </button>
                      {selectedSkillId ? (
                        <>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => void publishSkill(selectedSkillId)}
                          >
                            发布
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              void setSkillEnabled(
                                selectedSkillId,
                                !skillForm.enabled
                              )
                            }
                          >
                            {skillForm.enabled ? "停用" : "启用"}
                          </button>
                          <button
                            className="text-button danger-button"
                            type="button"
                            onClick={() => void deleteSkill(selectedSkillId)}
                          >
                            删除
                          </button>
                        </>
                      ) : null}
                    </div>
                    {selectedSkillId ? (
                      <div className="test-run">
                        <label>
                          Test input
                          <input
                            value={skillTestInput}
                            onChange={(event) =>
                              setSkillTestInput(event.target.value)
                            }
                          />
                        </label>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => void testSkill()}
                        >
                          试运行
                        </button>
                        {skillTestOutput ? (
                          <pre className="output">{skillTestOutput}</pre>
                        ) : null}
                      </div>
                    ) : null}
                  </form>
                </div>
              </section>

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
              <article className="panel list-panel">
                <h2>Skill Runs</h2>
                {dashboard.skillRuns.items.length === 0 ? <EmptyList /> : null}
                {dashboard.skillRuns.items.map((skillRun) => (
                  <div className="list-row" key={skillRun.id}>
                    <div>
                      <strong>{skillRun.skillId}</strong>
                      <p>{skillRun.inputText || "(empty)"}</p>
                    </div>
                    <span>{skillRun.status}</span>
                  </div>
                ))}
              </article>

              <article className="panel list-panel">
                <h2>Route Decisions</h2>
                {dashboard.routeDecisions.items.length === 0 ? (
                  <EmptyList />
                ) : null}
                {dashboard.routeDecisions.items.map((decision) => (
                  <div className="list-row" key={decision.id}>
                    <div>
                      <strong>{decision.triggerType}</strong>
                      <p>{decision.reason}</p>
                    </div>
                    <span>{decision.matchedSkillId ?? "-"}</span>
                  </div>
                ))}
              </article>
              </section>
            </>
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
