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

