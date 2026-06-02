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
