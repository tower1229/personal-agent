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
import { CodeBlock, EmptyState, Field, emptyScheduleForm, emptySkillForm, filterText, formFromSkill, manifestFromForm, parseJsonText, skillStatus, useAsyncData, weekDays, type ScheduleFormState, type SkillFormState } from "./resource-common";

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

