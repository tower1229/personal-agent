import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  builtInToolNames,
  skillManifestSchema,
  type AdminAgentConfigResponse,
  type AdminApproval,
  type AdminD1ReadinessResponse,
  type AdminMemory,
  type AdminRunDetailResponse,
  type AdminScheduleExecution,
  type AdminSkillDetail,
  type AdminSkillListItem,
  type AdminTodo,
  type AdminWorkflowRun,
  type AdminWorkflowRunDetailResponse,
  type BuiltInToolName,
  type SkillKind
} from "@personal-agent/shared";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  deleteSchedule,
  deleteSkill,
  loadAgentConfig,
  loadD1Readiness,
  loadApprovals,
  loadMemories,
  loadRunDetail,
  loadRuns,
  loadScheduleExecutions,
  loadSchedules,
  loadSkillDetail,
  loadSkillRouteDecisions,
  loadSkillRuns,
  loadSkills,
  loadTodos,
  loadWorkflowRunDetail,
  loadWorkflowRuns,
  publishSkill,
  runScheduleNow,
  saveSchedule,
  saveSkillDraft,
  setScheduleEnabled,
  setSkillEnabled,
  testLlm,
  testSearch,
  testSkill
} from "@/lib/api";
import { isCreateRoutePath } from "@/lib/admin-routes";
import { formatDateTime, truncateText } from "@/lib/format";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const weekDays = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" }
];

interface SkillFormState {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  enabled: boolean;
  triggerPhrases: string;
  instructions: string;
  allowedTools: BuiltInToolName[];
  workflowTemplate: string;
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

const emptySkillForm: SkillFormState = {
  id: "",
  name: "",
  description: "",
  kind: "chat",
  enabled: true,
  triggerPhrases: "",
  instructions: "",
  allowedTools: ["list_todos", "search_memory"],
  workflowTemplate: "[]"
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

function Field(props: {
  children: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium">{props.label}</span>
      {props.children}
      {props.description ? (
        <span className="text-xs text-muted-foreground">{props.description}</span>
      ) : null}
    </label>
  );
}

function EmptyState(props: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {props.children}
    </div>
  );
}

function CodeBlock(props: { value: unknown }) {
  const text =
    typeof props.value === "string"
      ? props.value
      : JSON.stringify(props.value, null, 2);

  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
      {text || "-"}
    </pre>
  );
}

function parseJsonText(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function skillStatus(skill: AdminSkillListItem | AdminSkillDetail) {
  if (skill.deleted) {
    return "deleted";
  }
  if (!skill.enabled) {
    return "disabled";
  }
  return skill.publishedVersionId ? "published" : "draft";
}

function formFromSkill(skill: AdminSkillDetail): SkillFormState {
  return {
    id: skill.manifest.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    kind: skill.manifest.kind,
    enabled: skill.enabled,
    triggerPhrases: skill.manifest.triggerPhrases.join("\n"),
    instructions: skill.manifest.instructions,
    allowedTools: [...skill.manifest.allowedTools],
    workflowTemplate: JSON.stringify(skill.manifest.workflowTemplate, null, 2)
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

function filterText(...parts: Array<string | null | undefined>) {
  return parts.join(" ").toLowerCase();
}

function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void loader()
      .then((value) => {
        if (!cancelled) {
          setData(value);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return { data, error, loading, setData };
}

export function RunsPage() {
  const params = useParams();

  if (params.id) {
    return <RunDetailPage id={params.id} />;
  }

  return <RunsListPage />;
}

function RunsListPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const runs = useAsyncData(() => loadRuns(), []);
  const filtered = useMemo(() => {
    return (runs.data?.items ?? []).filter((run) => {
      const matchesStatus = status === "all" || run.status === status;
      const matchesQuery = filterText(
        run.id,
        run.messageText,
        run.responseText,
        run.error
      ).includes(query.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [query, runs.data, status]);

  return (
    <>
      <PageHeader
        description="统一 trace 中心。打开详情可以看到 tool calls、skill、workflow 和 schedule 关联。"
        title="Runs"
      />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Recent Runs</CardTitle>
              <CardDescription>按更新时间倒序展示最近 50 条。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-64"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 message / response"
                value={query}
              />
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="succeeded">Succeeded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {runs.loading ? <Skeleton className="h-64" /> : null}
          {runs.error ? <p className="text-sm text-destructive">{runs.error}</p> : null}
          {!runs.loading && filtered.length === 0 ? (
            <EmptyState>暂无匹配运行记录。</EmptyState>
          ) : null}
          {filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>{truncateText(run.messageText, 72)}</TableCell>
                    <TableCell>{truncateText(run.responseText, 72)}</TableCell>
                    <TableCell>{formatDateTime(run.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/runs/${run.id}`}>详情</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

function TraceSection(props: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

function RunDetailPage(props: { id: string }) {
  const detail = useAsyncData(() => loadRunDetail(props.id), [props.id]);
  const data = detail.data;

  return (
    <>
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link to="/admin/runs">返回 Runs</Link>
          </Button>
        }
        description="一次输入的完整执行链路。"
        title="Run Detail"
      />
      {detail.loading ? <Skeleton className="h-96" /> : null}
      {detail.error ? <p className="text-sm text-destructive">{detail.error}</p> : null}
      {data ? <RunTrace detail={data} /> : null}
    </>
  );
}

function RunTrace(props: { detail: AdminRunDetailResponse }) {
  const detail = props.detail;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <TraceSection title="Run">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <span>ID: {detail.run.id}</span>
            <span>
              Status: <StatusBadge status={detail.run.status} />
            </span>
            <span>Created: {formatDateTime(detail.run.createdAt)}</span>
            <span>Updated: {formatDateTime(detail.run.updatedAt)}</span>
          </div>
          <div className="mt-4 grid gap-3">
            <CodeBlock value={{ message: detail.run.messageText }} />
            <CodeBlock value={{ response: detail.run.responseText, error: detail.run.error }} />
          </div>
        </TraceSection>

        <TraceSection title="Tool Calls">
          {detail.toolCalls.length === 0 ? <EmptyState>无 tool call。</EmptyState> : null}
          <div className="flex flex-col gap-3">
            {detail.toolCalls.map((toolCall) => (
              <Card key={toolCall.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">{toolCall.toolName}</CardTitle>
                    <StatusBadge status={toolCall.status} />
                  </div>
                  <CardDescription>{toolCall.riskLevel}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <CodeBlock value={parseJsonText(toolCall.inputJson)} />
                  <CodeBlock
                    value={{
                      output: parseJsonText(toolCall.outputJson),
                      error: toolCall.error
                    }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TraceSection>
      </div>

      <div className="flex flex-col gap-4">
        <TraceSection title="Skill Route">
          <CodeBlock value={detail.skillRouteDecision ?? "No route decision"} />
        </TraceSection>
        <TraceSection title="Skill Run">
          <CodeBlock value={detail.skillRun ?? "No skill run"} />
        </TraceSection>
        <TraceSection title="Workflow">
          <CodeBlock value={detail.workflowRun ?? "No workflow run"} />
        </TraceSection>
        <TraceSection title="Schedule">
          <CodeBlock value={detail.scheduleExecution ?? "No schedule execution"} />
        </TraceSection>
      </div>
    </div>
  );
}

export function SkillsPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = isCreateRoutePath(location.pathname);
  const hasDetailTarget = isNew || Boolean(params.id);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState<SkillFormState>(emptySkillForm);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const skills = useAsyncData(() => loadSkills(), []);
  const skillRuns = useAsyncData(() => loadSkillRuns(), []);
  const routeDecisions = useAsyncData(() => loadSkillRouteDecisions(), []);
  const detail = useAsyncData(
    () =>
      params.id && !isNew
        ? loadSkillDetail(params.id)
        : Promise.resolve(null),
    [params.id, isNew]
  );

  useEffect(() => {
    if (isNew) {
      setForm(emptySkillForm);
      setInlineError(null);
      setTestOutput(null);
    } else if (detail.data?.skill) {
      setForm(formFromSkill(detail.data.skill));
      setInlineError(null);
      setTestOutput(null);
    }
  }, [detail.data, isNew]);

  const filtered = useMemo(() => {
    return (skills.data?.items ?? []).filter((skill) => {
      const matchesKind = kind === "all" || skill.kind === kind;
      const matchesStatus = status === "all" || skillStatus(skill) === status;
      const matchesQuery = filterText(
        skill.id,
        skill.name,
        skill.description
      ).includes(query.toLowerCase());
      return matchesKind && matchesStatus && matchesQuery;
    });
  }, [kind, query, skills.data, status]);
  const selectedSkill = detail.data?.skill ?? null;
  const isDeletedSkill = selectedSkill?.deleted === true;

  async function save() {
    setInlineError(null);
    try {
      const manifest = manifestFromForm(form);
      const response = await saveSkillDraft({
        id: isNew ? null : params.id ?? null,
        request: { manifest }
      });
      toast.success("Skill draft saved");
      navigate(`/admin/skills/${response.skill.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setInlineError(message);
      toast.error(message);
    }
  }

  async function publish() {
    if (!params.id || isNew) {
      return;
    }
    try {
      await publishSkill(params.id);
      toast.success("Skill published");
      navigate(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发布失败";
      setInlineError(message);
      toast.error(message);
    }
  }

  async function setEnabled(enabled: boolean) {
    if (!params.id || isNew) {
      return;
    }
    await setSkillEnabled(params.id, enabled);
    toast.success(enabled ? "Skill enabled" : "Skill disabled");
    navigate(0);
  }

  async function remove() {
    if (!params.id || isNew) {
      return;
    }
    try {
      await deleteSkill(params.id);
      toast.success("Skill deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败";
      toast.error(message);
      return;
    }
    setInlineError(null);
    setTestOutput(null);
    detail.setData(null);
    navigate("/admin/skills", { replace: true });
  }

  async function runTest() {
    if (!params.id || isNew) {
      return;
    }
    const result = await testSkill(params.id, testInput);
    setTestOutput(result.output);
    toast.success("Test run completed");
  }

  return (
    <>
      <PageHeader
        actions={
          <Button asChild>
            <Link to="/admin/skills/new">New Skill</Link>
          </Button>
        }
        description="管理声明式 chat/workflow skill、发布版本和测试运行。"
        title="Skills"
      />
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
            <CardDescription>{filtered.length} skills</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 skill"
              value={query}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select onValueChange={setKind} value={kind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All kinds</SelectItem>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="workflow">Workflow</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {skills.loading ? <Skeleton className="h-48" /> : null}
            <div className="flex flex-col gap-2">
              {filtered.map((skill) => (
                <Button
                  asChild
                  className="h-auto justify-start p-3"
                  key={skill.id}
                  variant={params.id === skill.id ? "secondary" : "outline"}
                >
                  <Link to={`/admin/skills/${skill.id}`}>
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      <span className="truncate font-medium">{skill.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {skill.kind}
                        <StatusBadge status={skillStatus(skill)} />
                      </span>
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isNew ? "Create Skill" : "Skill Detail"}</CardTitle>
            <CardDescription>
              保存 draft 后再发布；workflow template 使用 JSON textarea。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {!hasDetailTarget ? (
              <EmptyState>从左侧选择一个 skill，或创建 New Skill。</EmptyState>
            ) : null}
            {hasDetailTarget ? (
              <>
                {detail.error ? (
                  <EmptyState>{detail.error}</EmptyState>
                ) : null}
                {inlineError ? (
                  <p className="text-sm text-destructive">{inlineError}</p>
                ) : null}
                {isDeletedSkill ? (
                  <EmptyState>这个 skill 已删除，只保留历史记录查看。</EmptyState>
                ) : null}
                {!detail.error ? (
                  <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="ID">
                    <Input
                      disabled={!isNew || isDeletedSkill}
                      onChange={(event) =>
                        setForm({ ...form, id: event.target.value })
                      }
                      value={form.id}
                    />
                  </Field>
                  <Field label="Kind">
                    <Select
                      disabled={isDeletedSkill}
                      onValueChange={(value) =>
                        setForm({ ...form, kind: value as SkillKind })
                      }
                      value={form.kind}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="chat">Chat</SelectItem>
                          <SelectItem value="workflow">Workflow</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Name">
                    <Input
                      disabled={isDeletedSkill}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                      value={form.name}
                    />
                  </Field>
                  <Field label="Enabled">
                    <div className="flex h-8 items-center gap-2">
                      <Switch
                        checked={form.enabled}
                        disabled={isDeletedSkill}
                        onCheckedChange={(checked) =>
                          setForm({ ...form, enabled: checked })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        draft manifest enabled flag
                      </span>
                    </div>
                  </Field>
                </div>
                <Field label="Description">
                  <Input
                    disabled={isDeletedSkill}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    value={form.description}
                  />
                </Field>
                <Field label="Trigger phrases" description="一行一个 trigger phrase。">
                  <Textarea
                    disabled={isDeletedSkill}
                    onChange={(event) =>
                      setForm({ ...form, triggerPhrases: event.target.value })
                    }
                    rows={4}
                    value={form.triggerPhrases}
                  />
                </Field>
                <Field label="Instructions">
                  <Textarea
                    disabled={isDeletedSkill}
                    onChange={(event) =>
                      setForm({ ...form, instructions: event.target.value })
                    }
                    rows={6}
                    value={form.instructions}
                  />
                </Field>
                <div className="flex flex-col gap-3">
                  <span className="text-sm font-medium">Allowed tools</span>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {builtInToolNames.map((toolName) => (
                      <label className="flex items-center gap-2 text-sm" key={toolName}>
                        <Checkbox
                          checked={form.allowedTools.includes(toolName)}
                          disabled={isDeletedSkill}
                          onCheckedChange={(checked) => {
                            setForm({
                              ...form,
                              allowedTools:
                                checked === true
                                  ? [...form.allowedTools, toolName]
                                  : form.allowedTools.filter(
                                      (item) => item !== toolName
                                    )
                            });
                          }}
                        />
                        {toolName}
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="Workflow template JSON">
                  <Textarea
                    disabled={isDeletedSkill}
                    onChange={(event) =>
                      setForm({ ...form, workflowTemplate: event.target.value })
                    }
                    rows={8}
                    value={form.workflowTemplate}
                  />
                </Field>

                <div className="flex flex-wrap gap-2">
                  {!isDeletedSkill ? (
                    <>
                      <Button onClick={() => void save()} type="button">
                        Save Draft
                      </Button>
                      {!isNew ? (
                        <>
                      <Button
                        onClick={() => void publish()}
                        type="button"
                        variant="secondary"
                      >
                        Publish
                      </Button>
                      <Button
                        onClick={() => void setEnabled(!detail.data?.skill.enabled)}
                        type="button"
                        variant="outline"
                      >
                        {detail.data?.skill.enabled ? "Disable" : "Enable"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive">
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除这个 skill？</AlertDialogTitle>
                            <AlertDialogDescription>
                              这是软删除，已删除 skill 不会再被路由。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void remove()}>
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>

                {!isNew ? (
                  <Tabs defaultValue="test">
                    <TabsList>
                      <TabsTrigger value="test">Test Run</TabsTrigger>
                      <TabsTrigger value="runs">Recent Runs</TabsTrigger>
                      <TabsTrigger value="routes">Routes</TabsTrigger>
                    </TabsList>
                    <TabsContent className="flex flex-col gap-3" value="test">
                      {isDeletedSkill ? (
                        <EmptyState>已删除 skill 不能再执行测试。</EmptyState>
                      ) : (
                        <>
                          <Textarea
                            onChange={(event) => setTestInput(event.target.value)}
                            placeholder="输入测试消息"
                            rows={4}
                            value={testInput}
                          />
                          <Button
                            disabled={!testInput.trim()}
                            onClick={() =>
                              void runTest().catch((error) => {
                                toast.error(
                                  error instanceof Error ? error.message : "测试失败"
                                );
                              })
                            }
                            type="button"
                          >
                            Run Test
                          </Button>
                          {testOutput ? <CodeBlock value={testOutput} /> : null}
                        </>
                      )}
                    </TabsContent>
                    <TabsContent value="runs">
                      <CodeBlock
                        value={(skillRuns.data?.items ?? []).filter(
                          (item) => item.skillId === params.id
                        )}
                      />
                    </TabsContent>
                    <TabsContent value="routes">
                      <CodeBlock
                        value={(routeDecisions.data?.items ?? []).filter(
                          (item) => item.matchedSkillId === params.id
                        )}
                      />
                    </TabsContent>
                  </Tabs>
                ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function WorkflowsPage() {
  const params = useParams();

  if (params.id) {
    return <WorkflowDetailPage id={params.id} />;
  }

  const workflows = useAsyncData(() => loadWorkflowRuns(), []);

  return (
    <>
      <PageHeader
        description="长任务实例和 step trace 的入口。"
        title="Workflows"
      />
      <Card>
        <CardHeader>
          <CardTitle>Workflow Runs</CardTitle>
          <CardDescription>Cloudflare Workflow execution trace.</CardDescription>
        </CardHeader>
        <CardContent>
          {workflows.loading ? <Skeleton className="h-64" /> : null}
          {workflows.error ? (
            <p className="text-sm text-destructive">{workflows.error}</p>
          ) : null}
          {workflows.data ? <WorkflowTable items={workflows.data.items} /> : null}
        </CardContent>
      </Card>
    </>
  );
}

function WorkflowTable(props: { items: AdminWorkflowRun[] }) {
  if (props.items.length === 0) {
    return <EmptyState>暂无 workflow run。</EmptyState>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Skill</TableHead>
          <TableHead>Input</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((workflow) => (
          <TableRow key={workflow.id}>
            <TableCell>
              <StatusBadge status={workflow.status} />
            </TableCell>
            <TableCell>{workflow.skillId}</TableCell>
            <TableCell>{truncateText(workflow.inputText, 96)}</TableCell>
            <TableCell>{formatDateTime(workflow.updatedAt)}</TableCell>
            <TableCell className="text-right">
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/workflows/${workflow.id}`}>Steps</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function WorkflowDetailPage(props: { id: string }) {
  const detail = useAsyncData(() => loadWorkflowRunDetail(props.id), [props.id]);

  return (
    <>
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link to="/admin/workflows">返回 Workflows</Link>
          </Button>
        }
        description="workflow run 与每一步 input/output/error。"
        title="Workflow Detail"
      />
      {detail.loading ? <Skeleton className="h-96" /> : null}
      {detail.error ? <p className="text-sm text-destructive">{detail.error}</p> : null}
      {detail.data ? <WorkflowTrace detail={detail.data} /> : null}
    </>
  );
}

function WorkflowTrace(props: { detail: AdminWorkflowRunDetailResponse }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{props.detail.workflowRun.id}</CardTitle>
          <CardDescription>
            {props.detail.workflowRun.skillId} · {props.detail.workflowRun.source}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock value={props.detail.workflowRun} />
        </CardContent>
      </Card>
      {props.detail.steps.map((step) => (
        <Card key={step.id}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">
                {step.stepId} · {step.stepType}
              </CardTitle>
              <StatusBadge status={step.status} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <CodeBlock
              value={{
                input: parseJsonText(step.inputJson),
                output: parseJsonText(step.outputJson),
                error: step.error
              }}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SchedulesPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = isCreateRoutePath(location.pathname);
  const hasDetailTarget = isNew || Boolean(params.id);
  const schedules = useAsyncData(() => loadSchedules(), []);
  const executions = useAsyncData(
    () => loadScheduleExecutions(isNew ? undefined : params.id),
    [params.id, isNew]
  );
  const [form, setForm] = useState<ScheduleFormState>(emptyScheduleForm);
  const selected = useMemo(() => {
    return schedules.data?.items.find((item) => item.id === params.id) ?? null;
  }, [params.id, schedules.data]);
  const scheduleMissing =
    Boolean(params.id) && !isNew && !schedules.loading && !selected;

  useEffect(() => {
    if (isNew) {
      setForm(emptyScheduleForm);
    } else if (selected) {
      setForm({
        id: selected.id,
        name: selected.name,
        commandText: selected.commandText,
        enabled: selected.enabled,
        cadence: selected.cadence,
        timeOfDay: selected.timeOfDay,
        daysOfWeek: selected.daysOfWeek
      });
    } else if (scheduleMissing) {
      setForm(emptyScheduleForm);
    }
  }, [isNew, scheduleMissing, selected]);

  async function save() {
    try {
      const response = await saveSchedule({
        id: form.id,
        request: {
          name: form.name,
          commandText: form.commandText,
          enabled: form.enabled,
          timezone: "Asia/Shanghai",
          cadence: form.cadence,
          timeOfDay: form.timeOfDay,
          daysOfWeek: form.cadence === "weekly" ? form.daysOfWeek : []
        }
      });
      toast.success("Schedule saved");
      navigate(`/admin/schedules/${response.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await setScheduleEnabled(id, enabled);
    toast.success(enabled ? "Schedule enabled" : "Schedule disabled");
    navigate(0);
  }

  async function runNow(id: string) {
    await runScheduleNow(id);
    toast.success("Schedule execution started");
    navigate(0);
  }

  async function remove(id: string) {
    await deleteSchedule(id);
    toast.success("Schedule deleted");
    navigate("/admin/schedules");
  }

  return (
    <>
      <PageHeader
        actions={
          <Button asChild>
            <Link to="/admin/schedules/new">New Schedule</Link>
          </Button>
        }
        description="动态定时任务，继续只支持 daily / weekly 表单化配置。"
        title="Schedules"
      />
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Schedules</CardTitle>
            <CardDescription>{schedules.data?.items.length ?? 0} items</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {schedules.loading ? <Skeleton className="h-48" /> : null}
            {(schedules.data?.items ?? []).map((schedule) => (
              <Button
                asChild
                className="h-auto justify-start p-3"
                key={schedule.id}
                variant={params.id === schedule.id ? "secondary" : "outline"}
              >
                <Link to={`/admin/schedules/${schedule.id}`}>
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <span className="truncate font-medium">{schedule.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {schedule.cadence} {schedule.timeOfDay}
                    </span>
                  </span>
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isNew ? "Create Schedule" : "Schedule Detail"}</CardTitle>
            <CardDescription>Timezone 固定 Asia/Shanghai。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {!hasDetailTarget ? <EmptyState>选择 schedule 或创建新任务。</EmptyState> : null}
            {hasDetailTarget ? (
              <>
                {scheduleMissing ? (
                  <EmptyState>这个 schedule 不存在或已删除。</EmptyState>
                ) : null}
                {!scheduleMissing ? (
                  <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name">
                    <Input
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                      value={form.name}
                    />
                  </Field>
                  <Field label="Enabled">
                    <div className="flex h-8 items-center gap-2">
                      <Switch
                        checked={form.enabled}
                        onCheckedChange={(checked) =>
                          setForm({ ...form, enabled: checked })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        保存后生效
                      </span>
                    </div>
                  </Field>
                  <Field label="Cadence">
                    <Select
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          cadence: value as "daily" | "weekly"
                        })
                      }
                      value={form.cadence}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Time of day">
                    <Input
                      onChange={(event) =>
                        setForm({ ...form, timeOfDay: event.target.value })
                      }
                      type="time"
                      value={form.timeOfDay}
                    />
                  </Field>
                </div>
                {form.cadence === "weekly" ? (
                  <div className="flex flex-wrap gap-3">
                    {weekDays.map((day) => (
                      <label className="flex items-center gap-2 text-sm" key={day.value}>
                        <Checkbox
                          checked={form.daysOfWeek.includes(day.value)}
                          onCheckedChange={(checked) =>
                            setForm({
                              ...form,
                              daysOfWeek:
                                checked === true
                                  ? [...form.daysOfWeek, day.value].sort()
                                  : form.daysOfWeek.filter(
                                      (item) => item !== day.value
                                    )
                            })
                          }
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>
                ) : null}
                <Field label="Command text">
                  <Textarea
                    onChange={(event) =>
                      setForm({ ...form, commandText: event.target.value })
                    }
                    rows={4}
                    value={form.commandText}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void save()} type="button">
                    Save
                  </Button>
                  {form.id ? (
                    <>
                      <Button
                        onClick={() => void toggleEnabled(form.id as string, !form.enabled)}
                        type="button"
                        variant="outline"
                      >
                        {form.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        onClick={() => void runNow(form.id as string)}
                        type="button"
                        variant="secondary"
                      >
                        Run Now
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive">
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除这个 schedule？</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后 cron 轮询不会再触发它。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void remove(form.id as string)}
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : null}
                </div>
                <ScheduleExecutionTable items={executions.data?.items ?? []} />
                  </>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ScheduleExecutionTable(props: { items: AdminScheduleExecution[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Recent executions</h3>
      {props.items.length === 0 ? <EmptyState>暂无执行记录。</EmptyState> : null}
      {props.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled For</TableHead>
              <TableHead>Output</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.items.map((execution) => (
              <TableRow key={execution.id}>
                <TableCell>
                  <StatusBadge status={execution.status} />
                </TableCell>
                <TableCell>{formatDateTime(execution.scheduledFor)}</TableCell>
                <TableCell>
                  {truncateText(execution.outputText ?? execution.error, 96)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

export function DataPage() {
  const location = useLocation();
  const mode = location.pathname.endsWith("/memories") ? "memories" : "todos";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const todos = useAsyncData(() => loadTodos(), []);
  const memories = useAsyncData(() => loadMemories(), []);

  return (
    <>
      <PageHeader
        description="核心数据面只读视图，写操作仍通过 Telegram/skill/schedule 进入。"
        title={mode === "todos" ? "Todos" : "Memories"}
      />
      <div className="flex gap-2">
        <Button asChild variant={mode === "todos" ? "secondary" : "outline"}>
          <Link to="/admin/data/todos">Todos</Link>
        </Button>
        <Button asChild variant={mode === "memories" ? "secondary" : "outline"}>
          <Link to="/admin/data/memories">Memories</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>{mode === "todos" ? "Todos" : "Memories"}</CardTitle>
              <CardDescription>支持基础搜索和状态过滤。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-64"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
                value={query}
              />
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All</SelectItem>
                    {mode === "todos" ? (
                      <>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="deleted">Deleted</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </>
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mode === "todos" ? (
            <TodosTable
              items={(todos.data?.items ?? []).filter(
                (todo) =>
                  (status === "all" || todo.status === status) &&
                  filterText(todo.title, String(todo.id)).includes(
                    query.toLowerCase()
                  )
              )}
              loading={todos.loading}
            />
          ) : (
            <MemoriesTable
              items={(memories.data?.items ?? []).filter(
                (memory) =>
                  (status === "all" || memory.status === status) &&
                  filterText(memory.content, String(memory.id)).includes(
                    query.toLowerCase()
                  )
              )}
              loading={memories.loading}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function TodosTable(props: { items: AdminTodo[]; loading: boolean }) {
  if (props.loading) {
    return <Skeleton className="h-64" />;
  }
  if (props.items.length === 0) {
    return <EmptyState>暂无待办。</EmptyState>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((todo) => (
          <TableRow key={todo.id}>
            <TableCell>{todo.id}</TableCell>
            <TableCell>{todo.title}</TableCell>
            <TableCell>
              <StatusBadge status={todo.status} />
            </TableCell>
            <TableCell>{formatDateTime(todo.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MemoriesTable(props: { items: AdminMemory[]; loading: boolean }) {
  if (props.loading) {
    return <Skeleton className="h-64" />;
  }
  if (props.items.length === 0) {
    return <EmptyState>暂无记忆。</EmptyState>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((memory) => (
          <TableRow key={memory.id}>
            <TableCell>{memory.id}</TableCell>
            <TableCell>{truncateText(memory.content, 120)}</TableCell>
            <TableCell>
              <StatusBadge status={memory.status} />
            </TableCell>
            <TableCell>{formatDateTime(memory.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ApprovalsPage() {
  const approvals = useAsyncData(() => loadApprovals(), []);
  const pending = (approvals.data?.items ?? []).filter(
    (item) => item.status === "pending"
  );

  return (
    <>
      <PageHeader
        description="高风险操作确认请求。当前确认仍通过 Telegram 完成。"
        title="Approvals"
      />
      <Card>
        <CardHeader>
          <CardTitle>Approval Requests</CardTitle>
          <CardDescription>{pending.length} pending</CardDescription>
        </CardHeader>
        <CardContent>
          {approvals.loading ? <Skeleton className="h-64" /> : null}
          {approvals.data ? <ApprovalsTable items={approvals.data.items} /> : null}
        </CardContent>
      </Card>
    </>
  );
}

function ApprovalsTable(props: { items: AdminApproval[] }) {
  if (props.items.length === 0) {
    return <EmptyState>暂无审批请求。</EmptyState>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Action</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Decided</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((approval) => (
          <TableRow key={approval.id}>
            <TableCell>{approval.action}</TableCell>
            <TableCell>
              <StatusBadge status={approval.status} />
            </TableCell>
            <TableCell>{approval.code}</TableCell>
            <TableCell>{formatDateTime(approval.createdAt)}</TableCell>
            <TableCell>{formatDateTime(approval.decidedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SettingsPage(props: { diagnostics?: boolean }) {
  const config = useAsyncData(() => loadAgentConfig(), []);
  const d1Readiness = useAsyncData(() => loadD1Readiness(), []);
  const [prompt, setPrompt] = useState("用一句话介绍当前 agent 状态");
  const [query, setQuery] = useState("Cloudflare Workers");
  const [llmOutput, setLlmOutput] = useState<string | null>(null);
  const [searchOutput, setSearchOutput] = useState<unknown | null>(null);

  async function runLlmTest() {
    try {
      const response = await testLlm(prompt);
      setLlmOutput(response.output);
      toast.success("LLM test completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LLM 测试失败");
    }
  }

  async function runSearchTest() {
    try {
      const response = await testSearch(query);
      setSearchOutput(response.results);
      toast.success("Search test completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search 测试失败");
    }
  }

  return (
    <>
      <PageHeader
        description="密钥只显示配置状态，不在 Admin 暴露。"
        title={props.diagnostics ? "Diagnostics" : "Settings"}
      />
      {config.loading || d1Readiness.loading ? (
        <Skeleton className="h-64" />
      ) : null}
      {config.data ? (
        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <SettingsSummary
            config={config.data}
            d1Readiness={d1Readiness.data ?? undefined}
          />
          <Card>
            <CardHeader>
              <CardTitle>Diagnostics</CardTitle>
              <CardDescription>测试 provider 配置是否可用。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Field label="Test LLM prompt">
                <Input
                  onChange={(event) => setPrompt(event.target.value)}
                  value={prompt}
                />
              </Field>
              <Button
                disabled={!prompt.trim()}
                onClick={() => void runLlmTest()}
                type="button"
              >
                Test LLM
              </Button>
              {llmOutput ? <CodeBlock value={llmOutput} /> : null}
              <Field label="Test search query">
                <Input
                  onChange={(event) => setQuery(event.target.value)}
                  value={query}
                />
              </Field>
              <Button
                disabled={!query.trim()}
                onClick={() => void runSearchTest()}
                type="button"
                variant="secondary"
              >
                Test Search
              </Button>
              {searchOutput ? <CodeBlock value={searchOutput} /> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function SettingsSummary(props: {
  config: AdminAgentConfigResponse;
  d1Readiness?: AdminD1ReadinessResponse;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Configuration</CardTitle>
        <CardDescription>Cloudflare Worker runtime config.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">LLM</span>
          <StatusBadge status={props.config.llmConfigured ? "configured" : "missing"} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Brave Search</span>
          <StatusBadge
            status={props.config.braveSearchConfigured ? "configured" : "missing"}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Base URL</span>
          <span>{props.config.llmBaseUrl ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Model</span>
          <span>{props.config.llmModel ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Max tool rounds</span>
          <span>{props.config.maxToolRounds}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Fetch URL max bytes</span>
          <span>{props.config.fetchUrlMaxBytes}</span>
        </div>
        <div className="border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">D1 schema</span>
            <StatusBadge
              status={props.d1Readiness?.ok ? "ready" : "missing"}
            />
          </div>
          {props.d1Readiness ? (
            props.d1Readiness.ok ? (
              <p className="text-muted-foreground">
                Required tables are present.
              </p>
            ) : (
              <div className="flex flex-col gap-2 text-muted-foreground">
                <p>
                  Missing tables: {props.d1Readiness.missingTables.join(", ")}
                </p>
                <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                  {props.d1Readiness.migrationCommand}
                </code>
              </div>
            )
          ) : (
            <p className="text-muted-foreground">
              D1 readiness check unavailable.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
