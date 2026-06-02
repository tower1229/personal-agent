import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  builtInToolNames,
  type AdminAgentConfigResponse,
  type AdminApproval,
  type AdminD1ReadinessResponse,
  type AdminMemory,
  type AdminRunDetailResponse,
  type AdminScheduleExecution,
  type AdminSkillDetail,
  type AdminSkillListItem,
  type AdminTodo,
  type BuiltInToolName
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock, EmptyState, Field, emptyScheduleForm, emptySkillForm, filterText, formFromSkill, parseJsonText, skillStatus, useAsyncData, weekDays, type ScheduleFormState, type SkillFormState } from "./resource-common";

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
