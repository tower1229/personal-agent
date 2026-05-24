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
  adminScheduleExecutionsResponseSchema,
  adminScheduleSchema,
  adminScheduleUpsertRequestSchema,
  adminSchedulesResponseSchema,
  adminTodosResponseSchema,
  adminWorkflowRunDetailResponseSchema,
  adminWorkflowRunsResponseSchema,
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
  type AdminScheduleExecutionsResponse,
  type AdminSchedulesResponse,
  type AdminTodosResponse,
  type AdminWorkflowRunDetailResponse,
  type AdminWorkflowRunsResponse,
  type BuiltInToolName,
  type SkillKind
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
  const host = window.location.hostname;
  const isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");

  useEffect(() => {
    if (!props.config?.botUsername || !containerRef.current || isLocalHost) {
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
  }, [props.config, isLocalHost]);

  if (props.config && !props.config.configured) {
    return (
      <p className="notice">
        配置 TELEGRAM_BOT_USERNAME 为真实 bot username 后显示 Telegram 登录按钮。
      </p>
    );
  }

  if (props.config?.configured && isLocalHost) {
    return (
      <div className="notice">
        <p>Telegram Login 不能在 localhost 或 127.0.0.1 上完成域名校验。</p>
        <p>
          部署到 Cloudflare 后，在 BotFather 执行 <code>/setdomain</code>，
          绑定你的 Admin 域名，再打开线上 <code>/admin</code> 使用官方登录按钮。
        </p>
      </div>
    );
  }

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
  workflowRuns: AdminWorkflowRunsResponse;
  schedules: AdminSchedulesResponse;
  scheduleExecutions: AdminScheduleExecutionsResponse;
}

interface SkillFormState {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  instructions: string;
  triggerPhrases: string;
  allowedTools: BuiltInToolName[];
  workflowTemplate: string;
  enabled: boolean;
}

interface ScheduleFormState {
  id: string | null;
  name: string;
  commandText: string;
  enabled: boolean;
  cadence: "daily" | "weekly";
  timeOfDay: string;
  daysOfWeek: number[];
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

function parseJsonText(value: string | null) {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

const emptySkillForm: SkillFormState = {
  id: "",
  name: "",
  description: "",
  kind: "chat",
  instructions: "",
  triggerPhrases: "",
  allowedTools: ["list_todos", "search_memory"],
  workflowTemplate: "[]",
  enabled: true
};

const emptyScheduleForm: ScheduleFormState = {
  id: null,
  name: "",
  commandText: "",
  enabled: true,
  cadence: "daily",
  timeOfDay: "09:00",
  daysOfWeek: [1]
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

async function sendEmpty(path: string, method: string): Promise<void> {
  const response = await fetch(path, {
    method,
    credentials: "include"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `${path} returned ${response.status}`;
    throw new Error(message);
  }
}

function formFromSkill(skill: AdminSkillDetail): SkillFormState {
  return {
    id: skill.manifest.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    kind: skill.manifest.kind,
    instructions: skill.manifest.instructions,
    triggerPhrases: skill.manifest.triggerPhrases.join("\n"),
    allowedTools: skill.manifest.allowedTools,
    workflowTemplate: JSON.stringify(skill.manifest.workflowTemplate, null, 2),
    enabled: skill.enabled
  };
}

function manifestFromForm(form: SkillFormState) {
  return skillManifestSchema.parse({
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    kind: form.kind,
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
    workflowTemplate: JSON.parse(form.workflowTemplate || "[]") as unknown
  });
}

function App() {
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [config, setConfig] = useState<AdminAuthConfigResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [workflowDetail, setWorkflowDetail] =
    useState<AdminWorkflowRunDetailResponse | null>(null);
  const [skillForm, setSkillForm] = useState<SkillFormState>(emptySkillForm);
  const [scheduleForm, setScheduleForm] =
    useState<ScheduleFormState>(emptyScheduleForm);
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
      ),
      fetchJson("/api/admin/workflow-runs", (input) =>
        adminWorkflowRunsResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/schedules", (input) =>
        adminSchedulesResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/schedule-executions", (input) =>
        adminScheduleExecutionsResponseSchema.parse(input)
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
          routeDecisions,
          workflowRuns,
          schedules,
          scheduleExecutions
        ]) => {
          setDashboard({
            runs,
            todos,
            memories,
            approvals,
            skills,
            skillRuns,
            routeDecisions,
            workflowRuns,
            schedules,
            scheduleExecutions
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
      ),
      fetchJson("/api/admin/workflow-runs", (input) =>
        adminWorkflowRunsResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/schedules", (input) =>
        adminSchedulesResponseSchema.parse(input)
      ),
      fetchJson("/api/admin/schedule-executions", (input) =>
        adminScheduleExecutionsResponseSchema.parse(input)
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
          routeDecisions,
          workflowRuns,
          schedules,
          scheduleExecutions
        ]) => {
          setDashboard({
            runs,
            todos,
            memories,
            approvals,
            skills,
            skillRuns,
            routeDecisions,
            workflowRuns,
            schedules,
            scheduleExecutions
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
    await sendEmpty(`/api/admin/skills/${id}/publish`, "POST");
    reloadDashboard();
  }

  async function setSkillEnabled(id: string, enabled: boolean) {
    await sendEmpty(
      `/api/admin/skills/${id}/${enabled ? "enable" : "disable"}`,
      "POST"
    );
    setSkillForm({
      ...skillForm,
      enabled
    });
    reloadDashboard();
  }

  async function deleteSkill(id: string) {
    await sendEmpty(`/api/admin/skills/${id}`, "DELETE");
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

  function loadSchedule(id: string) {
    const schedule = dashboard?.schedules.items.find((item) => item.id === id);
    if (!schedule) {
      return;
    }
    setScheduleForm({
      id: schedule.id,
      name: schedule.name,
      commandText: schedule.commandText,
      enabled: schedule.enabled,
      cadence: schedule.cadence,
      timeOfDay: schedule.timeOfDay,
      daysOfWeek: schedule.daysOfWeek
    });
  }

  async function saveSchedule() {
    const request = adminScheduleUpsertRequestSchema.parse({
      name: scheduleForm.name,
      commandText: scheduleForm.commandText,
      enabled: scheduleForm.enabled,
      timezone: "Asia/Shanghai",
      cadence: scheduleForm.cadence,
      timeOfDay: scheduleForm.timeOfDay,
      daysOfWeek: scheduleForm.daysOfWeek
    });
    const response = await sendJson(
      scheduleForm.id
        ? `/api/admin/schedules/${scheduleForm.id}`
        : "/api/admin/schedules",
      scheduleForm.id ? "PUT" : "POST",
      request,
      (input) => adminScheduleSchema.parse(input)
    );
    setScheduleForm({
      id: response.id,
      name: response.name,
      commandText: response.commandText,
      enabled: response.enabled,
      cadence: response.cadence,
      timeOfDay: response.timeOfDay,
      daysOfWeek: response.daysOfWeek
    });
    reloadDashboard();
  }

  async function setScheduleEnabled(id: string, enabled: boolean) {
    await sendEmpty(
      `/api/admin/schedules/${id}/${enabled ? "enable" : "disable"}`,
      "POST"
    );
    if (scheduleForm.id === id) {
      setScheduleForm({ ...scheduleForm, enabled });
    }
    reloadDashboard();
  }

  async function runScheduleNow(id: string) {
    await sendEmpty(`/api/admin/schedules/${id}/run-now`, "POST");
    reloadDashboard();
  }

  async function deleteSchedule(id: string) {
    await sendEmpty(`/api/admin/schedules/${id}`, "DELETE");
    if (scheduleForm.id === id) {
      setScheduleForm(emptyScheduleForm);
    }
    reloadDashboard();
  }

  async function loadWorkflowRun(id: string) {
    const response = await fetchJson(`/api/admin/workflow-runs/${id}`, (input) =>
      adminWorkflowRunDetailResponseSchema.parse(input)
    );
    setWorkflowDetail(response);
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
                      Kind
                      <select
                        value={skillForm.kind}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            kind: event.target.value as SkillKind
                          })
                        }
                      >
                        <option value="chat">chat</option>
                        <option value="workflow">workflow draft</option>
                      </select>
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
                    <label>
                      Workflow template JSON
                      <textarea
                        rows={6}
                        value={skillForm.workflowTemplate}
                        onChange={(event) =>
                          setSkillForm({
                            ...skillForm,
                            workflowTemplate: event.target.value
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
                            onClick={() =>
                              void publishSkill(selectedSkillId).catch(
                                (publishError) => {
                                  setError(
                                    publishError instanceof Error
                                      ? publishError.message
                                      : "发布失败"
                                  );
                                }
                              )
                            }
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
                              ).catch((toggleError) => {
                                setError(
                                  toggleError instanceof Error
                                    ? toggleError.message
                                    : "启停失败"
                                );
                              })
                            }
                          >
                            {skillForm.enabled ? "停用" : "启用"}
                          </button>
                          <button
                            className="text-button danger-button"
                            type="button"
                            onClick={() =>
                              void deleteSkill(selectedSkillId).catch(
                                (deleteError) => {
                                  setError(
                                    deleteError instanceof Error
                                      ? deleteError.message
                                      : "删除失败"
                                  );
                                }
                              )
                            }
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
                          onClick={() =>
                            void testSkill().catch((testError) => {
                              setError(
                                testError instanceof Error
                                  ? testError.message
                                  : "试运行失败"
                              );
                            })
                          }
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

              <section className="panel schedule-editor">
                <div className="section-title">
                  <h2>Schedules</h2>
                  <button
                    className="text-button"
                    onClick={() => setScheduleForm(emptyScheduleForm)}
                  >
                    新建
                  </button>
                </div>
                <div className="skills-layout">
                  <div className="skill-list">
                    {dashboard.schedules.items.length === 0 ? <EmptyList /> : null}
                    {dashboard.schedules.items.map((schedule) => (
                      <button
                        className={
                          scheduleForm.id === schedule.id
                            ? "skill-row active"
                            : "skill-row"
                        }
                        key={schedule.id}
                        onClick={() => loadSchedule(schedule.id)}
                      >
                        <span>{schedule.name}</span>
                        <small>
                          {schedule.enabled ? "enabled" : "disabled"} ·{" "}
                          {schedule.cadence} · {schedule.timeOfDay}
                        </small>
                      </button>
                    ))}
                  </div>
                  <form
                    className="skill-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveSchedule().catch((saveError) => {
                        setError(
                          saveError instanceof Error
                            ? saveError.message
                            : "保存定时任务失败"
                        );
                      });
                    }}
                  >
                    <label>
                      名称
                      <input
                        value={scheduleForm.name}
                        onChange={(event) =>
                          setScheduleForm({
                            ...scheduleForm,
                            name: event.target.value
                          })
                        }
                      />
                    </label>
                    <label>
                      Command text
                      <input
                        value={scheduleForm.commandText}
                        onChange={(event) =>
                          setScheduleForm({
                            ...scheduleForm,
                            commandText: event.target.value
                          })
                        }
                      />
                    </label>
                    <label>
                      Cadence
                      <select
                        value={scheduleForm.cadence}
                        onChange={(event) =>
                          setScheduleForm({
                            ...scheduleForm,
                            cadence: event.target.value as "daily" | "weekly"
                          })
                        }
                      >
                        <option value="daily">daily</option>
                        <option value="weekly">weekly</option>
                      </select>
                    </label>
                    <label>
                      Time
                      <input
                        type="time"
                        value={scheduleForm.timeOfDay}
                        onChange={(event) =>
                          setScheduleForm({
                            ...scheduleForm,
                            timeOfDay: event.target.value
                          })
                        }
                      />
                    </label>
                    {scheduleForm.cadence === "weekly" ? (
                      <fieldset>
                        <legend>Days</legend>
                        {[
                          [1, "Mon"],
                          [2, "Tue"],
                          [3, "Wed"],
                          [4, "Thu"],
                          [5, "Fri"],
                          [6, "Sat"],
                          [7, "Sun"]
                        ].map(([day, label]) => (
                          <label className="checkbox-row" key={day}>
                            <input
                              type="checkbox"
                              checked={scheduleForm.daysOfWeek.includes(
                                day as number
                              )}
                              onChange={(event) => {
                                const daysOfWeek = event.target.checked
                                  ? [...scheduleForm.daysOfWeek, day as number]
                                  : scheduleForm.daysOfWeek.filter(
                                      (item) => item !== day
                                    );
                                setScheduleForm({
                                  ...scheduleForm,
                                  daysOfWeek
                                });
                              }}
                            />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={scheduleForm.enabled}
                        onChange={(event) =>
                          setScheduleForm({
                            ...scheduleForm,
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
                      {scheduleForm.id ? (
                        <>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              void setScheduleEnabled(
                                scheduleForm.id as string,
                                !scheduleForm.enabled
                              ).catch((toggleError) => {
                                setError(
                                  toggleError instanceof Error
                                    ? toggleError.message
                                    : "启停定时任务失败"
                                );
                              })
                            }
                          >
                            {scheduleForm.enabled ? "停用" : "启用"}
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              void runScheduleNow(
                                scheduleForm.id as string
                              ).catch((runError) => {
                                setError(
                                  runError instanceof Error
                                    ? runError.message
                                    : "立即运行失败"
                                );
                              })
                            }
                          >
                            Run now
                          </button>
                          <button
                            className="text-button danger-button"
                            type="button"
                            onClick={() =>
                              void deleteSchedule(
                                scheduleForm.id as string
                              ).catch((deleteError) => {
                                setError(
                                  deleteError instanceof Error
                                    ? deleteError.message
                                    : "删除定时任务失败"
                                );
                              })
                            }
                          >
                            删除
                          </button>
                        </>
                      ) : null}
                    </div>
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
              <article className="panel list-panel">
                <h2>Workflow Runs</h2>
                {dashboard.workflowRuns.items.length === 0 ? <EmptyList /> : null}
                {dashboard.workflowRuns.items.map((workflowRun) => (
                  <div className="list-row" key={workflowRun.id}>
                    <div>
                      <strong>{workflowRun.skillId}</strong>
                      <p>{workflowRun.inputText || "(empty)"}</p>
                    </div>
                    <div className="row-actions">
                      <span>{workflowRun.status}</span>
                      <button
                        className="text-button compact-button"
                        type="button"
                        onClick={() =>
                          void loadWorkflowRun(workflowRun.id).catch(
                            (loadError) => {
                              setError(
                                loadError instanceof Error
                                  ? loadError.message
                                  : "加载 workflow steps 失败"
                              );
                            }
                          )
                        }
                      >
                        Steps
                      </button>
                    </div>
                  </div>
                ))}
                {workflowDetail ? (
                  <div className="workflow-steps">
                    <h3>{workflowDetail.workflowRun.id}</h3>
                    {workflowDetail.steps.length === 0 ? <EmptyList /> : null}
                    {workflowDetail.steps.map((step) => (
                      <div className="step-row" key={step.id}>
                        <div className="section-title">
                          <strong>
                            {step.stepId} · {step.stepType}
                          </strong>
                          <span>{step.status}</span>
                        </div>
                        <pre className="output">
                          {JSON.stringify(
                            {
                              input: parseJsonText(step.inputJson),
                              output: parseJsonText(step.outputJson),
                              error: step.error
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>

              <article className="panel list-panel">
                <h2>Schedule Executions</h2>
                {dashboard.scheduleExecutions.items.length === 0 ? (
                  <EmptyList />
                ) : null}
                {dashboard.scheduleExecutions.items.map((execution) => (
                  <div className="list-row" key={execution.id}>
                    <div>
                      <strong>{execution.scheduleId}</strong>
                      <p>{execution.outputText ?? execution.error ?? "(empty)"}</p>
                    </div>
                    <span>{execution.status}</span>
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
