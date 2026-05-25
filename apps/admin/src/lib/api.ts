import {
  adminAgentConfigResponseSchema,
  adminAgentTestLlmResponseSchema,
  adminAgentTestSearchResponseSchema,
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminD1ReadinessResponseSchema,
  adminMeResponseSchema,
  adminMemoriesResponseSchema,
  adminRunDetailResponseSchema,
  adminRunsResponseSchema,
  adminScheduleExecutionsResponseSchema,
  adminScheduleSchema,
  adminSchedulesResponseSchema,
  adminScheduleUpsertRequestSchema,
  adminSkillDetailResponseSchema,
  adminSkillRouteDecisionsResponseSchema,
  adminSkillRunsResponseSchema,
  adminSkillTestRunRequestSchema,
  adminSkillTestRunResponseSchema,
  adminSkillsResponseSchema,
  adminSkillUpsertRequestSchema,
  adminTodosResponseSchema,
  adminWorkflowRunDetailResponseSchema,
  adminWorkflowRunsResponseSchema,
  type AdminAgentConfigResponse,
  type AdminAgentTestLlmResponse,
  type AdminAgentTestSearchResponse,
  type AdminApprovalsResponse,
  type AdminAuthConfigResponse,
  type AdminD1ReadinessResponse,
  type AdminMeResponse,
  type AdminMemoriesResponse,
  type AdminRunDetailResponse,
  type AdminRunsResponse,
  type AdminSchedule,
  type AdminScheduleExecutionsResponse,
  type AdminSchedulesResponse,
  type AdminScheduleUpsertRequest,
  type AdminSkillDetailResponse,
  type AdminSkillRouteDecisionsResponse,
  type AdminSkillRunsResponse,
  type AdminSkillTestRunResponse,
  type AdminSkillsResponse,
  type AdminSkillUpsertRequest,
  type AdminTodosResponse,
  type AdminWorkflowRunDetailResponse,
  type AdminWorkflowRunsResponse
} from "@personal-agent/shared";

export interface DashboardData {
  agentConfig: AdminAgentConfigResponse;
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

export async function fetchJson<T>(
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

async function requestJson<T>(
  path: string,
  options: RequestInit,
  parse: (input: unknown) => T
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `${path} returned ${response.status}`;
    throw new Error(message);
  }

  return parse(await response.json());
}

export async function postEmpty(path: string): Promise<void> {
  await requestJson(path, { method: "POST" }, () => undefined);
}

export async function deleteEmpty(path: string): Promise<void> {
  await requestJson(path, { method: "DELETE" }, () => undefined);
}

export async function sendJson<T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  parse: (input: unknown) => T
): Promise<T> {
  return requestJson(
    path,
    {
      method,
      body: JSON.stringify(body)
    },
    parse
  );
}

export async function loadSession(): Promise<{
  me: AdminMeResponse;
  authConfig: AdminAuthConfigResponse;
}> {
  const [me, authConfig] = await Promise.all([
    fetchJson("/api/admin/me", (input) => adminMeResponseSchema.parse(input)),
    fetchJson("/api/admin/auth-config", (input) =>
      adminAuthConfigResponseSchema.parse(input)
    )
  ]);

  return { me, authConfig };
}

export async function loadDashboardData(): Promise<DashboardData> {
  const [
    agentConfig,
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
  ] = await Promise.all([
    loadAgentConfig(),
    loadRuns(),
    loadTodos(),
    loadMemories(),
    loadApprovals(),
    loadSkills(),
    loadSkillRuns(),
    loadSkillRouteDecisions(),
    loadWorkflowRuns(),
    loadSchedules(),
    loadScheduleExecutions()
  ]);

  return {
    agentConfig,
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
  };
}

export function loadRuns(): Promise<AdminRunsResponse> {
  return fetchJson("/api/admin/runs", (input) =>
    adminRunsResponseSchema.parse(input)
  );
}

export function loadRunDetail(id: string): Promise<AdminRunDetailResponse> {
  return fetchJson(`/api/admin/runs/${id}`, (input) =>
    adminRunDetailResponseSchema.parse(input)
  );
}

export function loadSkills(): Promise<AdminSkillsResponse> {
  return fetchJson("/api/admin/skills", (input) =>
    adminSkillsResponseSchema.parse(input)
  );
}

export function loadSkillDetail(id: string): Promise<AdminSkillDetailResponse> {
  return fetchJson(`/api/admin/skills/${id}`, (input) =>
    adminSkillDetailResponseSchema.parse(input)
  );
}

export function saveSkillDraft(input: {
  id: string | null;
  request: AdminSkillUpsertRequest;
}): Promise<AdminSkillDetailResponse> {
  const path = input.id ? `/api/admin/skills/${input.id}` : "/api/admin/skills";
  return sendJson(
    path,
    input.id ? "PUT" : "POST",
    adminSkillUpsertRequestSchema.parse(input.request),
    (body) => adminSkillDetailResponseSchema.parse(body)
  );
}

export async function publishSkill(id: string): Promise<void> {
  await postEmpty(`/api/admin/skills/${id}/publish`);
}

export async function setSkillEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  await postEmpty(`/api/admin/skills/${id}/${enabled ? "enable" : "disable"}`);
}

export async function deleteSkill(id: string): Promise<void> {
  await deleteEmpty(`/api/admin/skills/${id}`);
}

export function testSkill(
  id: string,
  input: string
): Promise<AdminSkillTestRunResponse> {
  return sendJson(
    `/api/admin/skills/${id}/test-run`,
    "POST",
    adminSkillTestRunRequestSchema.parse({ input }),
    (body) => adminSkillTestRunResponseSchema.parse(body)
  );
}

export function loadSkillRuns(): Promise<AdminSkillRunsResponse> {
  return fetchJson("/api/admin/skill-runs", (input) =>
    adminSkillRunsResponseSchema.parse(input)
  );
}

export function loadSkillRouteDecisions(): Promise<AdminSkillRouteDecisionsResponse> {
  return fetchJson("/api/admin/skill-route-decisions", (input) =>
    adminSkillRouteDecisionsResponseSchema.parse(input)
  );
}

export function loadWorkflowRuns(): Promise<AdminWorkflowRunsResponse> {
  return fetchJson("/api/admin/workflow-runs", (input) =>
    adminWorkflowRunsResponseSchema.parse(input)
  );
}

export function loadWorkflowRunDetail(
  id: string
): Promise<AdminWorkflowRunDetailResponse> {
  return fetchJson(`/api/admin/workflow-runs/${id}`, (input) =>
    adminWorkflowRunDetailResponseSchema.parse(input)
  );
}

export function loadSchedules(): Promise<AdminSchedulesResponse> {
  return fetchJson("/api/admin/schedules", (input) =>
    adminSchedulesResponseSchema.parse(input)
  );
}

export function saveSchedule(input: {
  id: string | null;
  request: AdminScheduleUpsertRequest;
}): Promise<AdminSchedule> {
  const path = input.id
    ? `/api/admin/schedules/${input.id}`
    : "/api/admin/schedules";
  return sendJson(
    path,
    input.id ? "PUT" : "POST",
    adminScheduleUpsertRequestSchema.parse(input.request),
    (body) => adminScheduleSchema.parse(body)
  );
}

export async function setScheduleEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  await postEmpty(`/api/admin/schedules/${id}/${enabled ? "enable" : "disable"}`);
}

export async function runScheduleNow(id: string): Promise<void> {
  await postEmpty(`/api/admin/schedules/${id}/run-now`);
}

export async function deleteSchedule(id: string): Promise<void> {
  await deleteEmpty(`/api/admin/schedules/${id}`);
}

export function loadScheduleExecutions(
  scheduleId?: string
): Promise<AdminScheduleExecutionsResponse> {
  const query = scheduleId ? `?scheduleId=${encodeURIComponent(scheduleId)}` : "";
  return fetchJson(`/api/admin/schedule-executions${query}`, (input) =>
    adminScheduleExecutionsResponseSchema.parse(input)
  );
}

export function loadTodos(): Promise<AdminTodosResponse> {
  return fetchJson("/api/admin/todos", (input) =>
    adminTodosResponseSchema.parse(input)
  );
}

export function loadMemories(): Promise<AdminMemoriesResponse> {
  return fetchJson("/api/admin/memories", (input) =>
    adminMemoriesResponseSchema.parse(input)
  );
}

export function loadApprovals(): Promise<AdminApprovalsResponse> {
  return fetchJson("/api/admin/approvals", (input) =>
    adminApprovalsResponseSchema.parse(input)
  );
}

export function loadAgentConfig(): Promise<AdminAgentConfigResponse> {
  return fetchJson("/api/admin/agent-config", (input) =>
    adminAgentConfigResponseSchema.parse(input)
  );
}

export function loadD1Readiness(): Promise<AdminD1ReadinessResponse> {
  return fetchJson("/api/admin/diagnostics/d1", (input) =>
    adminD1ReadinessResponseSchema.parse(input)
  );
}

export function testLlm(prompt: string): Promise<AdminAgentTestLlmResponse> {
  return sendJson(
    "/api/admin/agent-config/test-llm",
    "POST",
    { prompt },
    (input) => adminAgentTestLlmResponseSchema.parse(input)
  );
}

export function testSearch(
  query: string
): Promise<AdminAgentTestSearchResponse> {
  return sendJson(
    "/api/admin/agent-config/test-search",
    "POST",
    { query },
    (input) => adminAgentTestSearchResponseSchema.parse(input)
  );
}
