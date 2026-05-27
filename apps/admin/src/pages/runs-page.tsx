import { useMemo, useState, type ReactNode } from "react";
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
import { CodeBlock, EmptyState, Field, emptyScheduleForm, emptySkillForm, filterText, formFromSkill, manifestFromForm, parseJsonText, skillStatus, useAsyncData, weekDays, type ScheduleFormState, type SkillFormState } from "./resource-common";

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
        description="统一 trace 中心。打开详情可以看到 tool calls、skill 和 schedule 关联。"
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
        <TraceSection title="Long Task">
          <CodeBlock value={detail.longTask ?? "No long task"} />
        </TraceSection>
        <TraceSection title="Schedule">
          <CodeBlock value={detail.scheduleExecution ?? "No schedule execution"} />
        </TraceSection>
      </div>
    </div>
  );
}
