import { useEffect, useState, type ReactNode } from "react";
import type { DashboardData } from "@/lib/api";
import { loadDashboardData } from "@/lib/api";
import { formatDateTime, truncateText } from "@/lib/format";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

function useDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboardData()
      .then(setDashboard)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      });
  }, []);

  return { dashboard, error };
}

function PageFrame(props: {
  title: string;
  description: string;
  children: (dashboard: DashboardData) => ReactNode;
}) {
  const { dashboard, error } = useDashboard();

  return (
    <>
      <PageHeader description={props.description} title={props.title} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!dashboard && !error ? <Skeleton className="h-72" /> : null}
      {dashboard ? props.children(dashboard) : null}
    </>
  );
}

export function RunsPage() {
  return (
    <PageFrame
      description="统一 trace 中心的第一版列表视图，详情页会在下一步补齐。"
      title="Runs"
    >
      {(dashboard) => (
        <Card>
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
            <CardDescription>按更新时间倒序展示最近 50 条。</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.runs.items.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>{truncateText(run.messageText, 72)}</TableCell>
                    <TableCell>{truncateText(run.responseText, 72)}</TableCell>
                    <TableCell>{formatDateTime(run.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageFrame>
  );
}

export function SkillsPage() {
  return (
    <PageFrame
      description="下一步会迁移为左侧列表加右侧 manifest 编辑器。"
      title="Skills"
    >
      {(dashboard) => (
        <Card>
          <CardHeader>
            <CardTitle>Skill Inventory</CardTitle>
            <CardDescription>先保留清单视图，CRUD 编辑器后续迁移。</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.skills.items.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell>{skill.name}</TableCell>
                    <TableCell>{skill.kind}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={
                          skill.deleted
                            ? "deleted"
                            : skill.enabled
                              ? "enabled"
                              : "disabled"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {skill.publishedVersionId ? "published" : "draft only"}
                    </TableCell>
                    <TableCell>{formatDateTime(skill.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageFrame>
  );
}

export function WorkflowsPage() {
  return (
    <PageFrame
      description="长任务实例和 step trace 的入口，详情页下一步补齐。"
      title="Workflows"
    >
      {(dashboard) => (
        <Card>
          <CardHeader>
            <CardTitle>Workflow Runs</CardTitle>
            <CardDescription>Cloudflare Workflow execution trace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Skill</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.workflowRuns.items.map((workflow) => (
                  <TableRow key={workflow.id}>
                    <TableCell>
                      <StatusBadge status={workflow.status} />
                    </TableCell>
                    <TableCell>{workflow.skillId}</TableCell>
                    <TableCell>{truncateText(workflow.inputText, 96)}</TableCell>
                    <TableCell>{formatDateTime(workflow.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageFrame>
  );
}

export function SchedulesPage() {
  return (
    <PageFrame
      description="动态定时任务的列表视图，表单编辑器下一步迁移。"
      title="Schedules"
    >
      {(dashboard) => (
        <Card>
          <CardHeader>
            <CardTitle>Schedules</CardTitle>
            <CardDescription>单 Cron Trigger 轮询 D1 schedule。</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Last Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.schedules.items.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>{schedule.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={schedule.enabled ? "enabled" : "disabled"} />
                    </TableCell>
                    <TableCell>
                      {schedule.cadence} {schedule.timeOfDay}
                    </TableCell>
                    <TableCell>{formatDateTime(schedule.nextRunAt)}</TableCell>
                    <TableCell>{formatDateTime(schedule.lastRunAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageFrame>
  );
}

export function DataPage() {
  return (
    <PageFrame
      description="当前先聚合 todo 和 memory，后续会拆出详情与操作。"
      title="Data"
    >
      {(dashboard) => (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Todos</CardTitle>
              <CardDescription>未完成和已完成待办。</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.todos.items.map((todo) => (
                    <TableRow key={todo.id}>
                      <TableCell>{todo.id}</TableCell>
                      <TableCell>{todo.title}</TableCell>
                      <TableCell>
                        <StatusBadge status={todo.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Memories</CardTitle>
              <CardDescription>Owner memory records.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.memories.items.map((memory) => (
                    <TableRow key={memory.id}>
                      <TableCell>{memory.id}</TableCell>
                      <TableCell>{truncateText(memory.content, 96)}</TableCell>
                      <TableCell>
                        <StatusBadge status={memory.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </PageFrame>
  );
}

export function ApprovalsPage() {
  return (
    <PageFrame
      description="Destructive 操作确认请求，当前 Telegram 侧确认仍是主流程。"
      title="Approvals"
    >
      {(dashboard) => (
        <Card>
          <CardHeader>
            <CardTitle>Approval Requests</CardTitle>
            <CardDescription>删除记忆等高风险操作的确认记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.approvals.items.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell>{approval.action}</TableCell>
                    <TableCell>
                      <StatusBadge status={approval.status} />
                    </TableCell>
                    <TableCell>{approval.code}</TableCell>
                    <TableCell>{formatDateTime(approval.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageFrame>
  );
}

export function SettingsPage() {
  return (
    <PageFrame
      description="LLM/Search 配置诊断会在这里集中管理。"
      title="Settings"
    >
      {(dashboard) => (
        <Card>
          <CardHeader>
            <CardTitle>Agent Configuration</CardTitle>
            <CardDescription>密钥只显示配置状态，不在 Admin 暴露。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">LLM</span>
              <StatusBadge
                status={dashboard.agentConfig.llmConfigured ? "configured" : "missing"}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Brave Search</span>
              <StatusBadge
                status={
                  dashboard.agentConfig.braveSearchConfigured
                    ? "configured"
                    : "missing"
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Base URL</span>
              <span>{dashboard.agentConfig.llmBaseUrl ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Model</span>
              <span>{dashboard.agentConfig.llmModel ?? "-"}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </PageFrame>
  );
}
