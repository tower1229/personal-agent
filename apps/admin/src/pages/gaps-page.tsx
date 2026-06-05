import { PageHeader } from "@/components/layout/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { loadPersonalModelUnderstandingGaps, updatePersonalModelUnderstandingGapStatus } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  personalModelScenarios,
  understandingGapStatuses,
  type PersonalModelUnderstandingGapDto,
  type UnderstandingGapStatus
} from "@personal-agent/shared";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, filterText, useAsyncData } from "./resource-common";

export function GapsPage() {
  const [query, setQuery] = useState("");
  const [scenario, setScenario] = useState("all");
  const [status, setStatus] = useState("all");
  const gaps = useAsyncData(() => loadPersonalModelUnderstandingGaps(), []);

  const items = useMemo(() => {
    return (gaps.data?.items ?? []).filter(
      (gap) =>
        (scenario === "all" || gap.scenario === scenario) &&
        (status === "all" || gap.status === status) &&
        filterText(gap.gapDescription, gap.scenario).includes(query.toLowerCase())
    );
  }, [gaps.data?.items, query, scenario, status]);

  async function updateStatus(id: string, newStatus: UnderstandingGapStatus) {
    try {
      await updatePersonalModelUnderstandingGapStatus({ id, request: { status: newStatus } });
      toast.success("已更新状态");
      gaps.setData(await loadPersonalModelUnderstandingGaps());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    }
  }

  return (
    <>
      <PageHeader
        description="系统追踪到的认知缺口。标记为 resolved 后的 gap 不会再用于主动提问。"
        title="Understanding Gaps"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Gaps</CardTitle>
              <CardDescription>管理需要补充的认知和待解问题。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-48"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
                value={query}
              />
              <Select onValueChange={setScenario} value={scenario}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="场景" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Scenarios</SelectItem>
                    {personalModelScenarios.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {understandingGapStatuses.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <GapsTable 
            items={items} 
            loading={gaps.loading} 
            onStatusChange={updateStatus}
          />
        </CardContent>
      </Card>
    </>
  );
}

function GapsTable(props: { 
  items: PersonalModelUnderstandingGapDto[]; 
  loading: boolean;
  onStatusChange: (id: string, status: UnderstandingGapStatus) => void;
}) {
  if (props.loading) {
    return <Skeleton className="h-64" />;
  }
  if (props.items.length === 0) {
    return <EmptyState>暂无 Gaps。</EmptyState>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Scenario</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((gap) => (
          <TableRow key={gap.id}>
            <TableCell>{gap.scenario}</TableCell>
            <TableCell className="max-w-md">{gap.gapDescription}</TableCell>
            <TableCell>
              <Select 
                onValueChange={(val) => props.onStatusChange(gap.id, val as UnderstandingGapStatus)} 
                value={gap.status}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {understandingGapStatuses.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>{formatDateTime(gap.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
