import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
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
import { loadApprovals } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { type AdminApproval } from "@personal-agent/shared";
import { EmptyState, useAsyncData } from "./resource-common";

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
