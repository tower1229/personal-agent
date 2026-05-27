import { useState, useMemo } from "react";
import { 
  type PersonalModelMetacognitionLogDto,
  metacognitionReflectionTypes
} from "@personal-agent/shared";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { loadPersonalModelMetacognitionLogs } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { EmptyState, filterText, useAsyncData } from "./resource-common";

export function MetacognitionPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const logs = useAsyncData(() => loadPersonalModelMetacognitionLogs(), []);

  const items = useMemo(() => {
    return (logs.data?.items ?? []).filter(
      (log) =>
        (type === "all" || log.reflectionType === type) &&
        filterText(log.content, log.relatedClaimId ?? "", log.relatedGapId ?? "").includes(query.toLowerCase())
    );
  }, [logs.data?.items, query, type]);

  return (
    <>
      <PageHeader
        description="代理的反思、认知冲突以及来自用户的理解修正记录。"
        title="Metacognition Logs"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Logs</CardTitle>
              <CardDescription>审计代理的内部认知演进过程。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-48"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索内容/ID"
                value={query}
              />
              <Select onValueChange={setType} value={type}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Reflection Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Types</SelectItem>
                    {metacognitionReflectionTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LogsTable 
            items={items} 
            loading={logs.loading} 
          />
        </CardContent>
      </Card>
    </>
  );
}

function LogsTable(props: { 
  items: PersonalModelMetacognitionLogDto[]; 
  loading: boolean;
}) {
  if (props.loading) {
    return <Skeleton className="h-64" />;
  }
  if (props.items.length === 0) {
    return <EmptyState>暂无日志。</EmptyState>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Related Claim</TableHead>
          <TableHead>Related Gap</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((log) => (
          <TableRow key={log.id}>
            <TableCell>{log.reflectionType}</TableCell>
            <TableCell className="max-w-md">{log.content}</TableCell>
            <TableCell>{log.relatedClaimId ?? "-"}</TableCell>
            <TableCell>{log.relatedGapId ?? "-"}</TableCell>
            <TableCell>{formatDateTime(log.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
