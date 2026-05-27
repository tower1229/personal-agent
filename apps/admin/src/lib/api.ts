import {
  adminAgentConfigResponseSchema,
  adminAgentTestLlmResponseSchema,
  adminAgentTestSearchResponseSchema,
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminD1ReadinessResponseSchema,
  adminLongTaskDetailResponseSchema,
  adminLongTasksResponseSchema,
  adminMeResponseSchema,
  adminMemoriesResponseSchema,
  adminPersonalModelClaimCreateRequestSchema,
  adminPersonalModelClaimDetailResponseSchema,
  adminPersonalModelClaimSchema,
  adminPersonalModelClaimsResponseSchema,
  adminPersonalModelClaimUpdateRequestSchema,
  adminPersonalModelEvidenceCreateRequestSchema,
  adminPersonalModelEvidenceSchema,
  adminPersonalModelSourceCreateRequestSchema,
  adminPersonalModelSourceDetailResponseSchema,
  adminPersonalModelSourceDocumentSchema,
  adminPersonalModelSourcesResponseSchema,
  adminPersonalModelSourceUpdateRequestSchema,
  adminPersonalModelMetacognitionLogsResponseSchema,
  personalModelUnderstandingGapDtoSchema,
  adminPersonalModelUnderstandingGapsResponseSchema,
  adminPersonalModelUnderstandingGapCreateRequestSchema,
  adminPersonalModelUnderstandingGapUpdateRequestSchema,
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
  userProfileSchema,
  type UserProfile,
  type UserProfileUpdateRequest,
  type AdminAgentConfigResponse,
  type AdminAgentTestLlmResponse,
  type AdminAgentTestSearchResponse,
  type AdminApprovalsResponse,
  type AdminAuthConfigResponse,
  type AdminD1ReadinessResponse,
  type AdminLongTaskDetailResponse,
  type AdminLongTasksResponse,
  type AdminMeResponse,
  type AdminMemoriesResponse,
  type AdminPersonalModelClaim,
  type AdminPersonalModelClaimCreateRequest,
  type AdminPersonalModelClaimDetailResponse,
  type AdminPersonalModelClaimsResponse,
  type AdminPersonalModelClaimUpdateRequest,
  type AdminPersonalModelEvidence,
  type AdminPersonalModelEvidenceCreateRequest,
  type AdminPersonalModelSourceCreateRequest,
  type AdminPersonalModelSourceDetailResponse,
  type AdminPersonalModelSourceDocument,
  type AdminPersonalModelSourcesResponse,
  type AdminPersonalModelSourceUpdateRequest,
  type AdminPersonalModelMetacognitionLogsResponse,
  type PersonalModelUnderstandingGapDto,
  type AdminPersonalModelUnderstandingGapsResponse,
  type AdminPersonalModelUnderstandingGapCreateRequest,
  type AdminPersonalModelUnderstandingGapUpdateRequest,
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
  type AdminTodosResponse
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
  longTasks: AdminLongTasksResponse;
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
    longTasks,
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
    loadLongTasks(),
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
    longTasks,
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

export function loadLongTasks(): Promise<AdminLongTasksResponse> {
  return fetchJson("/api/admin/long-tasks", (input) =>
    adminLongTasksResponseSchema.parse(input)
  );
}

export function loadLongTaskDetail(
  id: string
): Promise<AdminLongTaskDetailResponse> {
  return fetchJson(`/api/admin/long-tasks/${id}`, (input) =>
    adminLongTaskDetailResponseSchema.parse(input)
  );
}

export async function pauseLongTask(id: string): Promise<void> {
  await postEmpty(`/api/admin/long-tasks/${id}/pause`);
}

export async function resumeLongTask(id: string): Promise<void> {
  await postEmpty(`/api/admin/long-tasks/${id}/resume`);
}

export async function cancelLongTask(id: string): Promise<void> {
  await postEmpty(`/api/admin/long-tasks/${id}/cancel`);
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

export function loadPersonalModelClaims(): Promise<AdminPersonalModelClaimsResponse> {
  return fetchJson("/api/admin/personal-model/claims", (input) =>
    adminPersonalModelClaimsResponseSchema.parse(input)
  );
}

export function loadPersonalModelClaimDetail(
  id: string
): Promise<AdminPersonalModelClaimDetailResponse> {
  return fetchJson(`/api/admin/personal-model/claims/${id}`, (input) =>
    adminPersonalModelClaimDetailResponseSchema.parse(input)
  );
}

export function createPersonalModelClaim(
  request: AdminPersonalModelClaimCreateRequest
): Promise<AdminPersonalModelClaim> {
  return sendJson(
    "/api/admin/personal-model/claims",
    "POST",
    adminPersonalModelClaimCreateRequestSchema.parse(request),
    (input) => adminPersonalModelClaimSchema.parse(input)
  );
}

export function updatePersonalModelClaim(input: {
  id: string;
  request: AdminPersonalModelClaimUpdateRequest;
}): Promise<AdminPersonalModelClaim> {
  return requestJson(
    `/api/admin/personal-model/claims/${input.id}`,
    {
      method: "PATCH",
      body: JSON.stringify(
        adminPersonalModelClaimUpdateRequestSchema.parse(input.request)
      )
    },
    (body) => adminPersonalModelClaimSchema.parse(body)
  );
}

export function loadPersonalModelSources(sourceType?: string): Promise<AdminPersonalModelSourcesResponse> {
  const url = sourceType ? `/api/admin/personal-model/sources?sourceType=${encodeURIComponent(sourceType)}` : "/api/admin/personal-model/sources";
  return fetchJson(url, (input) =>
    adminPersonalModelSourcesResponseSchema.parse(input)
  );
}

export function loadPersonalModelSourceDetail(
  id: string
): Promise<AdminPersonalModelSourceDetailResponse> {
  return fetchJson(`/api/admin/personal-model/sources/${id}`, (input) =>
    adminPersonalModelSourceDetailResponseSchema.parse(input)
  );
}

export function createPersonalModelSource(
  request: AdminPersonalModelSourceCreateRequest
): Promise<AdminPersonalModelSourceDetailResponse> {
  return sendJson(
    "/api/admin/personal-model/sources",
    "POST",
    adminPersonalModelSourceCreateRequestSchema.parse(request),
    (input) => adminPersonalModelSourceDetailResponseSchema.parse(input)
  );
}

export function updatePersonalModelSource(input: {
  id: string;
  request: AdminPersonalModelSourceUpdateRequest;
}): Promise<AdminPersonalModelSourceDocument> {
  return requestJson(
    `/api/admin/personal-model/sources/${input.id}`,
    {
      method: "PATCH",
      body: JSON.stringify(
        adminPersonalModelSourceUpdateRequestSchema.parse(input.request)
      )
    },
    (body) => adminPersonalModelSourceDocumentSchema.parse(body)
  );
}

export function createPersonalModelEvidence(input: {
  claimId: string;
  request: AdminPersonalModelEvidenceCreateRequest;
}): Promise<AdminPersonalModelEvidence> {
  return sendJson(
    `/api/admin/personal-model/claims/${input.claimId}/evidence`,
    "POST",
    adminPersonalModelEvidenceCreateRequestSchema.parse(input.request),
    (body) => adminPersonalModelEvidenceSchema.parse(body)
  );
}

export function loadPersonalModelMetacognitionLogs(): Promise<AdminPersonalModelMetacognitionLogsResponse> {
  return fetchJson("/api/admin/personal-model/metacognition-logs", (input) =>
    adminPersonalModelMetacognitionLogsResponseSchema.parse(input)
  );
}

export function loadPersonalModelUnderstandingGaps(): Promise<AdminPersonalModelUnderstandingGapsResponse> {
  return fetchJson("/api/admin/personal-model/understanding-gaps", (input) =>
    adminPersonalModelUnderstandingGapsResponseSchema.parse(input)
  );
}

export function updatePersonalModelUnderstandingGapStatus(input: {
  id: string;
  request: AdminPersonalModelUnderstandingGapUpdateRequest;
}): Promise<{ success: boolean }> {
  return requestJson(
    `/api/admin/personal-model/understanding-gaps/${input.id}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(
        adminPersonalModelUnderstandingGapUpdateRequestSchema.parse(input.request)
      )
    },
    (body) => body as { success: boolean }
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

export function loadProfile(): Promise<UserProfile> {
  return fetchJson("/api/admin/profile", (input) =>
    userProfileSchema.parse(input)
  );
}

export function updateProfile(
  request: UserProfileUpdateRequest
): Promise<UserProfile> {
  return sendJson(
    "/api/admin/profile",
    "PUT",
    request,
    (input) => userProfileSchema.parse(input)
  );
}
