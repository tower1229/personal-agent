import { useEffect, useState } from "react";
import {
  ActivityIcon,
  BotIcon,
  DatabaseIcon,
  ListChecksIcon,
  type LucideIcon
} from "lucide-react";
import type { DashboardData } from "@/lib/api";
import { loadDashboardData } from "@/lib/api";
import { formatDateTime, truncateText } from "@/lib/format";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

function MetricCard(props: {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardDescription>{props.title}</CardDescription>
          <CardTitle className="text-2xl">{props.value}</CardTitle>
        </div>
        <props.icon data-icon="inline-start" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton className="h-32" key={index} />
      ))}
    </div>
  );
}

export function OverviewPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboardData()
      .then(setDashboard)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      });
  }, []);

  return (
    <>
      <PageHeader
        description="查看 agent 当前健康状态、最近运行记录和下一步需要处理的事项。"
        title="Overview"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!dashboard && !error ? <OverviewSkeleton /> : null}

      {dashboard ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              description="最近 50 条运行记录"
              icon={ActivityIcon}
              title="Runs"
              value={dashboard.runs.items.length}
            />
            <MetricCard
              description="声明式 skill 草稿与发布态"
              icon={BotIcon}
              title="Skills"
              value={dashboard.skills.items.length}
            />
            <MetricCard
              description="自动规划和执行的长任务"
              icon={ListChecksIcon}
              title="Long Tasks"
              value={dashboard.longTasks.items.length}
            />
            <MetricCard
              description="待办、记忆和审批数据面"
              icon={DatabaseIcon}
              title="Data"
              value={
                dashboard.todos.items.length +
                dashboard.memories.items.length +
                dashboard.approvals.items.length
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle>Recent Runs</CardTitle>
                <CardDescription>
                  默认展示最近记录，后续迁移为独立 trace 详情页。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.runs.items.slice(0, 8).map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell>{truncateText(run.messageText)}</TableCell>
                        <TableCell>{formatDateTime(run.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                    {dashboard.runs.items.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-muted-foreground" colSpan={3}>
                          暂无运行记录
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Diagnostics</CardTitle>
                <CardDescription>线上 smoke 时优先看这里。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">LLM</span>
                  <Badge variant={dashboard.agentConfig.llmConfigured ? "secondary" : "outline"}>
                    {dashboard.agentConfig.llmConfigured ? "configured" : "missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Search</span>
                  <Badge
                    variant={
                      dashboard.agentConfig.braveSearchConfigured
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {dashboard.agentConfig.braveSearchConfigured
                      ? "configured"
                      : "missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Model</span>
                  <span>{dashboard.agentConfig.llmModel ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Schedules</span>
                  <span>{dashboard.schedules.items.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
