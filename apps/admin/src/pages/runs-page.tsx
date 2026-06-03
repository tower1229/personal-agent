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

function PlannerRouteDisplay(props: { decisionText: string }) {
  const data = parseJsonText(props.decisionText);

  if (!data || typeof data !== "object") {
    return <CodeBlock value={data} />;
  }

  const mode = (data as any).mode;
  const reason = (data as any).reason;
  const confidence = (data as any).confidence;
  const requireFreshness = (data as any).requireFreshness;
  const webSearch = (data as any).webSearchPolicy;
  const fetchUrl = (data as any).fetchUrlPolicy;

  const getModeColor = (mode: string) => {
    switch (mode) {
      case "plan_guided":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "ask_user":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "none":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
      default:
        return "";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={getModeColor(mode)} variant="outline">
          Mode: {mode}
        </Badge>
        {confidence && (
          <Badge variant="secondary">
            Confidence: {confidence}
          </Badge>
        )}
        {requireFreshness && (
          <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
            Requires Freshness
          </Badge>
        )}
      </div>

      {reason && (
        <div className="text-sm text-muted-foreground border-l-2 border-primary pl-3 py-1">
          {reason}
        </div>
      )}

      {webSearch && (
        <Card className="shadow-none border-dashed">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              Web Search Policy
              {webSearch.allow ? (
                <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 border-none">Allowed</Badge>
              ) : (
                <Badge variant="secondary" className="border-none">Disabled</Badge>
              )}
            </CardTitle>
          </CardHeader>
          {webSearch.allow && (
            <CardContent className="py-2 px-4 text-sm grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Max calls:</span> {webSearch.maxCalls ?? "N/A"}</div>
                <div><span className="text-muted-foreground">Desensitize:</span> {webSearch.requireDesensitization ? "Yes" : "No"}</div>
              </div>
              {webSearch.forbiddenTopics && webSearch.forbiddenTopics.length > 0 && (
                <div>
                  <span className="text-muted-foreground block mb-1">Forbidden Topics:</span>
                  <div className="flex flex-wrap gap-1">
                    {webSearch.forbiddenTopics.map((topic: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{topic}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {fetchUrl && (
        <Card className="shadow-none border-dashed">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              Fetch URL Policy
              {fetchUrl.allow ? (
                <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 border-none">Allowed</Badge>
              ) : (
                <Badge variant="secondary" className="border-none">Disabled</Badge>
              )}
            </CardTitle>
          </CardHeader>
          {fetchUrl.allow && (
            <CardContent className="py-2 px-4 text-sm grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Max calls:</span> {fetchUrl.maxCalls ?? "N/A"}</div>
                <div><span className="text-muted-foreground">Search Provenance:</span> {fetchUrl.requireSearchProvenance ? "Yes" : "No"}</div>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
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
        <TraceSection title="Planner Route">
          {detail.plannerRouteDecision ? (
            <PlannerRouteDisplay decisionText={typeof detail.plannerRouteDecision === 'string' ? detail.plannerRouteDecision : JSON.stringify(detail.plannerRouteDecision)} />
          ) : (
            <EmptyState>No planner route decision</EmptyState>
          )}
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
