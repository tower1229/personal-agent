import { type RunEvaluationDto, type RunFeedbackDto } from "@personal-agent/shared";
import { PageHeader } from "@/components/layout/app-shell";
import { loadEvaluations, loadFeedbacks } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, useAsyncData } from "./resource-common";
import { Badge } from "@/components/ui/badge";

export function EvaluationsPage() {
  const evaluations = useAsyncData(() => loadEvaluations(), []);
  const feedbacks = useAsyncData(() => loadFeedbacks(), []);

  return (
    <>
      <PageHeader
        description="系统大模型自动评价与用户反馈的追踪记录。"
        title="Evaluations & Feedbacks"
      />
      
      <Tabs defaultValue="evaluations">
        <TabsList>
          <TabsTrigger value="evaluations">Automated Evaluations</TabsTrigger>
          <TabsTrigger value="feedbacks">User Feedbacks</TabsTrigger>
        </TabsList>

        <TabsContent value="evaluations">
          <Card>
            <CardHeader>
              <CardTitle>AI Evaluations</CardTitle>
              <CardDescription>
                后台 LLM-as-judge 对每次 Agent 执行的打分结果
              </CardDescription>
            </CardHeader>
            <CardContent>
              {evaluations.loading ? <Skeleton className="h-64" /> : null}
              {evaluations.data ? (
                <EvaluationsTable items={evaluations.data.items} />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedbacks">
          <Card>
            <CardHeader>
              <CardTitle>User Feedbacks</CardTitle>
              <CardDescription>
                用户在 Telegram 端触发的准确率与特定类型报错反馈
              </CardDescription>
            </CardHeader>
            <CardContent>
              {feedbacks.loading ? <Skeleton className="h-64" /> : null}
              {feedbacks.data ? (
                <FeedbacksTable items={feedbacks.data.items} />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function EvaluationsTable(props: { items: RunEvaluationDto[] }) {
  if (props.items.length === 0) {
    return <EmptyState>暂无评估记录。</EmptyState>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Run ID</TableHead>
          <TableHead>Groundedness</TableHead>
          <TableHead>Old Data Misuse</TableHead>
          <TableHead>Advice Fit</TableHead>
          <TableHead>Emotional Cal.</TableHead>
          <TableHead>Created At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((evaluation) => (
          <TableRow key={evaluation.id}>
            <TableCell className="font-mono text-xs">{evaluation.runId}</TableCell>
            <TableCell>{evaluation.groundednessScore}/5</TableCell>
            <TableCell>{evaluation.oldDataMisuseScore}/5</TableCell>
            <TableCell>{evaluation.adviceFitScore}/5</TableCell>
            <TableCell>{evaluation.emotionalCalibrationScore}/5</TableCell>
            <TableCell>{formatDateTime(evaluation.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FeedbacksTable(props: { items: RunFeedbackDto[] }) {
  if (props.items.length === 0) {
    return <EmptyState>暂无反馈记录。</EmptyState>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Run ID</TableHead>
          <TableHead>Feedback Type</TableHead>
          <TableHead>Comment</TableHead>
          <TableHead>Created At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((fb) => (
          <TableRow key={fb.id}>
            <TableCell className="font-mono text-xs">{fb.runId}</TableCell>
            <TableCell>
              <Badge variant={fb.feedbackType === "positive" ? "default" : "destructive"}>
                {fb.feedbackType}
              </Badge>
            </TableCell>
            <TableCell>{fb.comment}</TableCell>
            <TableCell>{formatDateTime(fb.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
