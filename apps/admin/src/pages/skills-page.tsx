import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  type AdminAgentConfigResponse,
  type AdminApproval,
  type AdminD1ReadinessResponse,
  type AdminMemory,
  type AdminRunDetailResponse,
  type AdminScheduleExecution,
  type AdminSkillDetail,
  type AdminSkillListItem,
  type AdminTodo
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock, EmptyState, Field, emptyScheduleForm, emptySkillForm, filterText, formFromSkill, parseJsonText, skillRequestFromForm, skillStatus, useAsyncData, weekDays, type ScheduleFormState, type SkillFormState } from "./resource-common";

export function SkillsPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = isCreateRoutePath(location.pathname);
  const hasDetailTarget = isNew || Boolean(params.id);
  const [query, setQuery] = useState("");
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
      const currentStatus = skillStatus(skill);
      const matchesStatus =
        status === "all" ? currentStatus !== "deleted" : currentStatus === status;
      const matchesQuery = filterText(
        skill.id,
        skill.name,
        skill.description
      ).includes(query.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [query, skills.data, status]);
  const selectedSkill = detail.data?.skill ?? null;
  const isDeletedSkill = selectedSkill?.deleted === true;

  async function save() {
    setInlineError(null);
    try {
      const request = skillRequestFromForm(form);
      const response = await saveSkillDraft({
        id: isNew ? null : params.id ?? null,
        request
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
        description="管理标准 Agent Skill package、发布版本和测试运行。"
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
            <div className="grid gap-2">
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
                        <StatusBadge status={skillStatus(skill)} />
                        {skill.validation.ok ? "valid" : "invalid"}
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
              保存 draft 后再发布。
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
                  <Field label="Protocol name">
                    <Input disabled value={selectedSkill?.name ?? "read from SKILL.md"} />
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
                        package can be routed after publish
                      </span>
                    </div>
                  </Field>
                </div>
                {selectedSkill ? (
                  <EmptyState>
                    Telegram 触发格式：/skill {selectedSkill.name}
                  </EmptyState>
                ) : null}
                <Field label="SKILL.md">
                  <Textarea
                    disabled={isDeletedSkill}
                    onChange={(event) =>
                      setForm({ ...form, skillMarkdown: event.target.value })
                    }
                    rows={14}
                    value={form.skillMarkdown}
                  />
                </Field>
                <Field
                  description='JSON object for extra text files, for example {"references/style.md":"..."}'
                  label="Optional file map JSON"
                >
                  <Textarea
                    disabled={isDeletedSkill}
                    onChange={(event) =>
                      setForm({ ...form, filesJson: event.target.value })
                    }
                    rows={8}
                    value={form.filesJson}
                  />
                </Field>
                {selectedSkill ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <span className="text-sm font-medium">Validation</span>
                      <CodeBlock value={selectedSkill.validation} />
                    </div>
                    <div>
                      <span className="text-sm font-medium">File inventory</span>
                      <CodeBlock value={selectedSkill.fileInventory} />
                    </div>
                  </div>
                ) : null}
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
