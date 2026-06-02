import { useState } from "react";
import { type AdminMemory } from "@personal-agent/shared";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { loadMemories } from "@/lib/api";
import { formatDateTime, truncateText } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, filterText, useAsyncData } from "./resource-common";

export function DataPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const memories = useAsyncData(() => loadMemories(), []);

  return (
    <>
      <PageHeader
        description="记忆数据只读视图，写操作需通过 Telegram 交互或 LLM 反思机制进行。"
        title="Memories"
      />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Memories</CardTitle>
              <CardDescription>支持内容检索和状态过滤。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-64"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索记忆内容"
                value={query}
              />
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </>
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
