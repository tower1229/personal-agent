import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  cancelLongTask,
  deleteLongTask,
  loadLongTaskDetail,
  loadLongTasks,
  pauseLongTask,
  resumeLongTask
} from "@/lib/api";
import { formatDateTime, truncateText } from "@/lib/format";
import { CodeBlock, EmptyState, parseJsonText, useAsyncData } from "./resource-common";
import type { AdminLongTask, AdminLongTaskDetailResponse } from "@personal-agent/shared";

export function LongTasksPage() {
  const params = useParams();

  if (params.id) {
    return <LongTaskDetailPage id={params.id} />;
  }

  const tasks = useAsyncData(() => loadLongTasks(), []);

  async function reload() {
    const data = await loadLongTasks();
    tasks.setData(data);
  }

  return (
    <>
      <PageHeader
        description="自动长任务的计划、执行和状态。"
        title="Long Tasks"
      />
      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Planner and step execution trace.</CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.loading ? <Skeleton className="h-64" /> : null}
          {tasks.error ? <p className="text-sm text-destructive">{tasks.error}</p> : null}
          {tasks.data ? <LongTaskTable items={tasks.data.items} onRefresh={reload} /> : null}
        </CardContent>
      </Card>
    </>
  );
}

function LongTaskTable(props: { items: AdminLongTask[], onRefresh: () => Promise<void> }) {
  if (props.items.length === 0) {
    return <EmptyState>暂无 long task。</EmptyState>;
  }

  async function act(action: "cancel" | "delete", id: string) {
    if (action === "cancel") {
      await cancelLongTask(id);
    } else {
      await deleteLongTask(id);
    }
    toast.success(`Task ${action} requested`);
    await props.onRefresh();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <StatusBadge status={task.status} />
            </TableCell>
            <TableCell>{truncateText(task.title, 64)}</TableCell>
            <TableCell>{truncateText(task.plannerReason, 72)}</TableCell>
            <TableCell>{formatDateTime(task.updatedAt)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/admin/long-tasks/${task.id}`}>Open</Link>
                </Button>
                {task.status === "running" || task.status === "paused" || task.status === "planning" || task.status === "waiting_for_user" ? (
                  <Button onClick={() => void act("cancel", task.id)} size="sm" variant="outline">
                    Cancel
                  </Button>
                ) : null}
                <Button onClick={() => void act("delete", task.id)} size="sm" variant="destructive">
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LongTaskDetailPage(props: { id: string }) {
  const detail = useAsyncData(() => loadLongTaskDetail(props.id), [props.id]);

  async function act(action: "pause" | "resume" | "cancel" | "delete") {
    if (action === "pause") {
      await pauseLongTask(props.id);
    } else if (action === "resume") {
      await resumeLongTask(props.id);
    } else if (action === "cancel") {
      await cancelLongTask(props.id);
    } else {
      await deleteLongTask(props.id);
      window.location.href = "/admin/long-tasks";
      return;
    }
    toast.success(`Task ${action} requested`);
    detail.setData(await loadLongTaskDetail(props.id));
  }

  return (
    <>
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button onClick={() => void act("pause")} size="sm" variant="outline">
              Pause
            </Button>
            <Button onClick={() => void act("resume")} size="sm" variant="outline">
              Resume
            </Button>
            <Button onClick={() => void act("cancel")} size="sm" variant="outline">
              Cancel
            </Button>
            <Button onClick={() => void act("delete")} size="sm" variant="destructive">
              Delete
            </Button>
          </div>
        }
        description="计划、步骤和事件 timeline。"
        title="Long Task Detail"
      />
      {detail.loading ? <Skeleton className="h-96" /> : null}
      {detail.error ? <p className="text-sm text-destructive">{detail.error}</p> : null}
      {detail.data ? <LongTaskTrace detail={detail.data} /> : null}
    </>
  );
}

function LongTaskTrace(props: { detail: AdminLongTaskDetailResponse }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{props.detail.task.title}</CardTitle>
              <CardDescription>{props.detail.task.id}</CardDescription>
            </div>
            <StatusBadge status={props.detail.task.status} />
          </div>
        </CardHeader>
        <CardContent>
          <CodeBlock value={props.detail.task} />
        </CardContent>
      </Card>
      {props.detail.steps.map((step) => (
        <Card key={step.id}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">
                {step.position}. {step.title}
              </CardTitle>
              <StatusBadge status={step.status} />
            </div>
            <CardDescription>{step.toolPolicy}</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock
              value={{
                description: step.description,
                successCriteria: step.successCriteria,
                input: parseJsonText(step.inputJson),
                output: parseJsonText(step.outputJson),
                error: step.error
              }}
            />
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock
            value={props.detail.events.map((event) => ({
              ...event,
              payload: parseJsonText(event.payloadJson)
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
