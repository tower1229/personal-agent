import { useMemo, useState } from "react";
import {
  personalModelConfidences,
  personalModelLayers,
  personalModelScenarios,
  personalModelStatuses,
  personalModelUsagePolicies,
  type AdminPersonalModelClaim,
  type AdminPersonalModelClaimEvent,
  type PersonalModelConfidence,
  type PersonalModelLayer,
  type PersonalModelScenario,
  type PersonalModelStatus,
  type PersonalModelUsagePolicy
} from "@personal-agent/shared";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createPersonalModelClaim, loadPersonalModelClaimDetail, loadPersonalModelClaims, updatePersonalModelClaim } from "@/lib/api";
import { formatDateTime, truncateText } from "@/lib/format";
import { EmptyState, Field, filterText, useAsyncData } from "./resource-common";

interface ClaimFormState {
  claim: string;
  layer: PersonalModelLayer;
  scenario: PersonalModelScenario;
  confidence: PersonalModelConfidence;
  status: PersonalModelStatus;
  usagePolicy: PersonalModelUsagePolicy;
}

const emptyForm: ClaimFormState = {
  claim: "",
  layer: "preference",
  scenario: "global",
  confidence: "high",
  status: "active",
  usagePolicy: "default_available"
};

export function PersonalModelPage() {
  const claims = useAsyncData(() => loadPersonalModelClaims(), []);
  const [query, setQuery] = useState("");
  const [scenario, setScenario] = useState("all");
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState<ClaimFormState>(emptyForm);
  const [editing, setEditing] = useState<ClaimFormState>(emptyForm);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [events, setEvents] = useState<AdminPersonalModelClaimEvent[]>([]);
  const [saving, setSaving] = useState(false);

  async function refreshClaims() {
    claims.setData(await loadPersonalModelClaims());
  }

  const items = useMemo(
    () =>
      (claims.data?.items ?? []).filter(
        (claim) =>
          (scenario === "all" || claim.scenario === scenario) &&
          (status === "all" || claim.status === status) &&
          filterText(
            claim.claim,
            claim.layer,
            claim.scenario,
            claim.confidence,
            claim.usagePolicy
          ).includes(query.toLowerCase())
      ),
    [claims.data?.items, query, scenario, status]
  );

  async function submitClaim() {
    if (!form.claim.trim()) {
      toast.error("Claim 不能为空");
      return;
    }
    setSaving(true);
    try {
      await createPersonalModelClaim({
        ...form,
        claim: form.claim.trim(),
        sensitivity: "medium",
        metadata: { source: "admin" }
      });
      toast.success("已创建个人理解");
      setForm(emptyForm);
      await refreshClaims();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function patchClaim(
    claim: AdminPersonalModelClaim,
    request: Partial<ClaimFormState>
  ) {
    try {
      await updatePersonalModelClaim({
        id: claim.id,
        request
      });
      toast.success("已更新");
      await refreshClaims();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    }
  }

  async function selectClaim(claim: AdminPersonalModelClaim) {
    setSelectedClaimId(claim.id);
    setEditing({
      claim: claim.claim,
      layer: claim.layer,
      scenario: claim.scenario,
      confidence: claim.confidence,
      status: claim.status,
      usagePolicy: claim.usagePolicy
    });
    try {
      const detail = await loadPersonalModelClaimDetail(claim.id);
      setEvents(detail.events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载详情失败");
    }
  }

  async function saveSelectedClaim() {
    if (!selectedClaimId) {
      return;
    }
    if (!editing.claim.trim()) {
      toast.error("Claim 不能为空");
      return;
    }
    setSaving(true);
    try {
      await updatePersonalModelClaim({
        id: selectedClaimId,
        request: {
          ...editing,
          claim: editing.claim.trim()
        }
      });
      toast.success("已保存修改");
      await refreshClaims();
      const detail = await loadPersonalModelClaimDetail(selectedClaimId);
      setEvents(detail.events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        description="结构化个人理解模型。这里管理的是 agent 对你的可审计理解，而不是原始资料。"
        title="Personal Model"
      />

      <Card>
        <CardHeader>
          <CardTitle>New Claim</CardTitle>
          <CardDescription>
            先保存明确确认过的高置信理解，后续批次再加入证据链和自动提议。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Claim">
            <Textarea
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  claim: event.target.value
                }))
              }
              placeholder="例如：写作修改默认保留我的表达气质，只有明确要求成稿时才大幅重写。"
              value={form.claim}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Layer">
              <EnumSelect
                items={personalModelLayers}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    layer: value as PersonalModelLayer
                  }))
                }
                value={form.layer}
              />
            </Field>
            <Field label="Scenario">
              <EnumSelect
                items={personalModelScenarios}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    scenario: value as PersonalModelScenario
                  }))
                }
                value={form.scenario}
              />
            </Field>
            <Field label="Confidence">
              <EnumSelect
                items={personalModelConfidences}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    confidence: value as PersonalModelConfidence
                  }))
                }
                value={form.confidence}
              />
            </Field>
            <Field label="Usage">
              <EnumSelect
                items={personalModelUsagePolicies}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    usagePolicy: value as PersonalModelUsagePolicy
                  }))
                }
                value={form.usagePolicy}
              />
            </Field>
          </div>
          <div>
            <Button disabled={saving} onClick={() => void submitClaim()}>
              Save Claim
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Claims</CardTitle>
              <CardDescription>支持搜索、场景过滤和状态过滤。</CardDescription>
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                className="w-full md:w-64"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
                value={query}
              />
              <FilterSelect
                items={personalModelScenarios}
                onChange={setScenario}
                value={scenario}
              />
              <FilterSelect
                items={personalModelStatuses}
                onChange={setStatus}
                value={status}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ClaimsTable
            items={items}
            loading={claims.loading}
            onPatch={(claim, request) => void patchClaim(claim, request)}
            onSelect={(claim) => void selectClaim(claim)}
            selectedId={selectedClaimId}
          />
        </CardContent>
      </Card>

      {selectedClaimId ? (
        <Card>
          <CardHeader>
            <CardTitle>Claim Detail</CardTitle>
            <CardDescription>
              编辑完整字段并查看该理解的事件历史。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Claim">
              <Textarea
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    claim: event.target.value
                  }))
                }
                value={editing.claim}
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-5">
              <Field label="Layer">
                <EnumSelect
                  items={personalModelLayers}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      layer: value as PersonalModelLayer
                    }))
                  }
                  value={editing.layer}
                />
              </Field>
              <Field label="Scenario">
                <EnumSelect
                  items={personalModelScenarios}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      scenario: value as PersonalModelScenario
                    }))
                  }
                  value={editing.scenario}
                />
              </Field>
              <Field label="Confidence">
                <EnumSelect
                  items={personalModelConfidences}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      confidence: value as PersonalModelConfidence
                    }))
                  }
                  value={editing.confidence}
                />
              </Field>
              <Field label="Status">
                <EnumSelect
                  items={personalModelStatuses}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      status: value as PersonalModelStatus
                    }))
                  }
                  value={editing.status}
                />
              </Field>
              <Field label="Usage">
                <EnumSelect
                  items={personalModelUsagePolicies}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      usagePolicy: value as PersonalModelUsagePolicy
                    }))
                  }
                  value={editing.usagePolicy}
                />
              </Field>
            </div>
            <div>
              <Button disabled={saving} onClick={() => void saveSelectedClaim()}>
                Save Changes
              </Button>
            </div>
            <div className="grid gap-2">
              <h2 className="text-sm font-medium">Events</h2>
              {events.length === 0 ? (
                <EmptyState>暂无事件。</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Payload</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{event.eventType}</TableCell>
                        <TableCell className="max-w-md">
                          {truncateText(event.payloadJson, 160)}
                        </TableCell>
                        <TableCell>{formatDateTime(event.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function EnumSelect(props: {
  items: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select onValueChange={props.onChange} value={props.value}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {props.items.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function FilterSelect(props: {
  items: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select onValueChange={props.onChange} value={props.value}>
      <SelectTrigger className="w-full md:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">All</SelectItem>
          {props.items.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ClaimsTable(props: {
  items: AdminPersonalModelClaim[];
  loading: boolean;
  onPatch: (
    claim: AdminPersonalModelClaim,
    request: Partial<ClaimFormState>
  ) => void;
  onSelect: (claim: AdminPersonalModelClaim) => void;
  selectedId: string | null;
}) {
  if (props.loading) {
    return <Skeleton className="h-64" />;
  }
  if (props.items.length === 0) {
    return <EmptyState>暂无个人理解。</EmptyState>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Claim</TableHead>
          <TableHead>Layer</TableHead>
          <TableHead>Scenario</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Usage</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((claim) => (
          <TableRow
            className={props.selectedId === claim.id ? "bg-muted/50" : ""}
            key={claim.id}
          >
            <TableCell className="max-w-md">
              <div className="flex flex-col gap-1">
                <span>{truncateText(claim.claim, 140)}</span>
                <span className="text-xs text-muted-foreground">
                  {claim.id}
                </span>
                <Button
                  className="w-fit px-0"
                  onClick={() => props.onSelect(claim)}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  Details
                </Button>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{claim.layer}</Badge>
            </TableCell>
            <TableCell>{claim.scenario}</TableCell>
            <TableCell>
              <EnumSelect
                items={personalModelConfidences}
                onChange={(value) =>
                  props.onPatch(claim, {
                    confidence: value as PersonalModelConfidence
                  })
                }
                value={claim.confidence}
              />
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-2">
                <StatusBadge status={claim.status} />
                <EnumSelect
                  items={personalModelStatuses}
                  onChange={(value) =>
                    props.onPatch(claim, {
                      status: value as PersonalModelStatus
                    })
                  }
                  value={claim.status}
                />
              </div>
            </TableCell>
            <TableCell>
              <EnumSelect
                items={personalModelUsagePolicies}
                onChange={(value) =>
                  props.onPatch(claim, {
                    usagePolicy: value as PersonalModelUsagePolicy
                  })
                }
                value={claim.usagePolicy}
              />
            </TableCell>
            <TableCell>{formatDateTime(claim.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
