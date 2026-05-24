import {
  adminAgentConfigResponseSchema,
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminMeResponseSchema,
  adminMemoriesResponseSchema,
  adminRunsResponseSchema,
  adminScheduleExecutionsResponseSchema,
  adminSchedulesResponseSchema,
  adminSkillRouteDecisionsResponseSchema,
  adminSkillRunsResponseSchema,
  adminSkillsResponseSchema,
  adminTodosResponseSchema,
  adminWorkflowRunsResponseSchema,
  type AdminAgentConfigResponse,
  type AdminApprovalsResponse,
  type AdminAuthConfigResponse,
  type AdminMeResponse,
  type AdminMemoriesResponse,
  type AdminRunsResponse,
  type AdminScheduleExecutionsResponse,
  type AdminSchedulesResponse,
  type AdminSkillRouteDecisionsResponse,
  type AdminSkillRunsResponse,
  type AdminSkillsResponse,
  type AdminTodosResponse,
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

export async function postEmpty(path: string): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
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
    fetchJson("/api/admin/agent-config", (input) =>
      adminAgentConfigResponseSchema.parse(input)
    ),
    fetchJson("/api/admin/runs", (input) => adminRunsResponseSchema.parse(input)),
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
