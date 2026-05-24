import { Badge } from "@/components/ui/badge";

function variantForStatus(status: string) {
  if (status === "failed" || status === "cancelled" || status === "rejected") {
    return "destructive";
  }

  if (
    status === "succeeded" ||
    status === "completed" ||
    status === "executed" ||
    status === "active"
  ) {
    return "secondary";
  }

  if (status === "running" || status === "pending") {
    return "outline";
  }

  return "outline";
}

export function StatusBadge(props: { status: string }) {
  return (
    <Badge variant={variantForStatus(props.status)}>{props.status}</Badge>
  );
}
