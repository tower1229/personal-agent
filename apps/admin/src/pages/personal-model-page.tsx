import { useMemo, useState } from "react";
import {
  personalModelConfidences,
  personalModelEvidenceTypes,
  personalModelEvidenceWeights,
  personalModelLayers,
  personalModelScenarios,
  personalModelSensitivities,
  personalModelSourceStatuses,
  personalModelSourceTypes,
  personalModelStatuses,
  personalModelUsagePolicies,
  type AdminPersonalModelClaim,
  type AdminPersonalModelClaimEvent,
  type AdminPersonalModelEvidence,
  type AdminPersonalModelSourceChunk,
  type AdminPersonalModelSourceDocument,
  type PersonalModelConfidence,
  type PersonalModelEvidenceType,
  type PersonalModelEvidenceWeight,
  type PersonalModelLayer,
  type PersonalModelScenario,
  type PersonalModelSensitivity,
  type PersonalModelSourceStatus,
  type PersonalModelSourceType,
  type PersonalModelStatus,
  type PersonalModelUsagePolicy
} from "@personal-agent/shared";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createPersonalModelClaim, createPersonalModelEvidence, createPersonalModelSource, loadPersonalModelClaimDetail, loadPersonalModelClaims, loadPersonalModelSourceDetail, loadPersonalModelSources, updatePersonalModelClaim, updatePersonalModelSource } from "@/lib/api";
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

interface SourceFormState {
  title: string;
  content: string;
  sourceType: PersonalModelSourceType;
}

const emptySourceForm: SourceFormState = {
  title: "",
  content: "",
  sourceType: "manual_note"
};

export function PersonalModelPage() {
  const claims = useAsyncData(() => loadPersonalModelClaims(), []);
  const [sourceTypeFilter, setSourceTypeFilter] = useState("all");
  const sources = useAsyncData(() => loadPersonalModelSources(sourceTypeFilter !== "all" ? sourceTypeFilter : undefined), [sourceTypeFilter]);
  const [query, setQuery] = useState("");
  const [scenario, setScenario] = useState("all");
  const [status, setStatus] = useState("all");
  const [sourceForm, setSourceForm] = useState<SourceFormState>(emptySourceForm);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClaimFormState>(emptyForm);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [events, setEvents] = useState<AdminPersonalModelClaimEvent[]>([]);
  const [evidence, setEvidence] = useState<AdminPersonalModelEvidence[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<AdminPersonalModelSourceChunk[]>([]);
  const [selectedChunkId, setSelectedChunkId] = useState("");
  const [evidenceType, setEvidenceType] =
    useState<PersonalModelEvidenceType>("source_chunk");
  const [evidenceWeight, setEvidenceWeight] =
    useState<PersonalModelEvidenceWeight>("medium");
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const [evidenceRunId, setEvidenceRunId] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshClaims() {
    claims.setData(await loadPersonalModelClaims());
  }

  async function refreshSources() {
    sources.setData(await loadPersonalModelSources(sourceTypeFilter !== "all" ? sourceTypeFilter : undefined));
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
      setEvidence(detail.evidence);
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
      setEvidence(detail.evidence);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function submitSource() {
    if (!sourceForm.title.trim() || !sourceForm.content.trim()) {
      toast.error("Title 和 Content 不能为空");
      return;
    }
    setSaving(true);
    
    try {
      const detail = await createPersonalModelSource({
        title: sourceForm.title.trim(),
        content: sourceForm.content.trim(),
        sourceType: sourceForm.sourceType,
        uri: null,
        usagePolicy: "default_available",
        sensitivity: "medium",
        metadata: { source: "admin" }
      });
      toast.success(`已导入资料，生成 ${detail.chunks.length} 个 chunk`);
      setSourceForm(emptySourceForm);
      setIsImportModalOpen(false);
      await refreshSources();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setSaving(false);
    }
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setSourceForm((current) => ({
        ...current,
        title: file.name.replace(/\.[^/.]+$/, ""),
        content
      }));
    };
    reader.onerror = () => toast.error("读取文件失败");
    reader.readAsText(file);
  }

  async function selectSource(source: AdminPersonalModelSourceDocument) {
    setSelectedSourceId(source.id);
    try {
      const detail = await loadPersonalModelSourceDetail(source.id);
      setChunks(detail.chunks);
      setSelectedChunkId(detail.chunks[0]?.id ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载资料失败");
    }
  }

  async function patchSource(
    source: AdminPersonalModelSourceDocument,
    request: {
      status?: PersonalModelSourceStatus;
      usagePolicy?: PersonalModelUsagePolicy;
    }
  ) {
    try {
      await updatePersonalModelSource({
        id: source.id,
        request
      });
      toast.success("已更新资料治理策略");
      await refreshSources();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    }
  }

  async function addEvidence() {
    if (!selectedClaimId) {
      toast.error("请选择 claim");
      return;
    }
    try {
      const chunk = chunks.find((item) => item.id === selectedChunkId);
      if (evidenceType === "source_chunk" && (!selectedSourceId || !chunk)) {
        toast.error("请选择 source chunk");
        return;
      }
      if (evidenceType === "conversation_run" && !evidenceRunId.trim()) {
        toast.error("Run ID 不能为空");
        return;
      }
      if (
        evidenceType === "manual_confirmation" &&
        !evidenceQuote.trim()
      ) {
        toast.error("Manual confirmation 需要 quote");
        return;
      }
      await createPersonalModelEvidence({
        claimId: selectedClaimId,
        request: {
          evidenceType,
          sourceDocumentId:
            evidenceType === "source_chunk" ? selectedSourceId : null,
          sourceChunkId:
            evidenceType === "source_chunk" ? selectedChunkId : null,
          runId:
            evidenceType === "conversation_run"
              ? evidenceRunId.trim()
              : null,
          quote:
            evidenceType === "source_chunk"
              ? chunk?.content ?? null
              : evidenceQuote.trim() || null,
          weight: evidenceWeight
        }
      });
      toast.success("已添加证据");
      setEvidenceQuote("");
      setEvidenceRunId("");
      const detail = await loadPersonalModelClaimDetail(selectedClaimId);
      setEvidence(detail.evidence);
      setEvents(detail.events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加证据失败");
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
              <h2 className="text-sm font-medium">Evidence</h2>
              {evidence.length === 0 ? (
                <EmptyState>暂无证据。</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>Quote</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evidence.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.evidenceType}</TableCell>
                        <TableCell>{item.sourceChunkId ?? item.runId}</TableCell>
                        <TableCell>{item.weight}</TableCell>
                        <TableCell className="max-w-md">
                          {truncateText(item.quote ?? "", 160)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="grid gap-3 md:grid-cols-[180px_1fr_180px_auto]">
                <EnumSelect
                  items={personalModelEvidenceTypes}
                  onChange={(value) =>
                    setEvidenceType(value as PersonalModelEvidenceType)
                  }
                  value={evidenceType}
                />
                {evidenceType === "source_chunk" ? (
                  chunks.length > 0 ? (
                    <EnumSelect
                      items={chunks.map((chunk) => chunk.id)}
                      onChange={setSelectedChunkId}
                      value={selectedChunkId}
                    />
                  ) : (
                    <Input disabled value="先选择一个包含 chunks 的 source" />
                  )
                ) : null}
                {evidenceType === "conversation_run" ? (
                  <Input
                    onChange={(event) => setEvidenceRunId(event.target.value)}
                    placeholder="Run ID"
                    value={evidenceRunId}
                  />
                ) : null}
                {evidenceType !== "source_chunk" &&
                evidenceType !== "conversation_run" ? (
                  <Input
                    onChange={(event) => setEvidenceQuote(event.target.value)}
                    placeholder="Quote / confirmation"
                    value={evidenceQuote}
                  />
                ) : null}
                <EnumSelect
                  items={personalModelEvidenceWeights}
                  onChange={(value) =>
                    setEvidenceWeight(value as PersonalModelEvidenceWeight)
                  }
                  value={evidenceWeight}
                />
                <Button
                  disabled={evidenceType === "source_chunk" && chunks.length === 0}
                  onClick={() => void addEvidence()}
                  type="button"
                >
                  Add Evidence
                </Button>
              </div>
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

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Sources</CardTitle>
              <CardDescription>
                导入原始资料并生成 chunks。原文不可在这里修改，只能治理使用策略。
              </CardDescription>
            </div>
            <div>
              <Dialog onOpenChange={setIsImportModalOpen} open={isImportModalOpen}>
                <DialogTrigger asChild>
                  <Button>Import Source</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Import Source</DialogTitle>
                    <DialogDescription>
                      直接粘贴文本，或上传 Markdown / TXT 文件。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Field label="Upload File">
                      <Input accept=".md,.txt" onChange={handleFileUpload} type="file" />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Title">
                        <Input
                          onChange={(event) =>
                            setSourceForm((current) => ({
                              ...current,
                              title: event.target.value
                            }))
                          }
                          value={sourceForm.title}
                        />
                      </Field>
                      <Field label="Source Type">
                        <EnumSelect
                          items={personalModelSourceTypes}
                          onChange={(value) =>
                            setSourceForm((current) => ({
                              ...current,
                              sourceType: value as PersonalModelSourceType
                            }))
                          }
                          value={sourceForm.sourceType}
                        />
                      </Field>
                    </div>
                    <Field label="Content">
                      <Textarea
                        className="min-h-[200px]"
                        onChange={(event) =>
                          setSourceForm((current) => ({
                            ...current,
                            content: event.target.value
                          }))
                        }
                        value={sourceForm.content}
                      />
                    </Field>
                    <div className="flex justify-end">
                      <Button disabled={saving} onClick={() => void submitSource()}>
                        Import
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <Field label="Filter by Source Type">
              <FilterSelect
                items={personalModelSourceTypes}
                onChange={setSourceTypeFilter}
                value={sourceTypeFilter}
              />
            </Field>
          </div>
          <SourcesTable
            items={sources.data?.items ?? []}
            loading={sources.loading}
            onPatch={(source, request) => void patchSource(source, request)}
            onSelect={(source) => void selectSource(source)}
            selectedId={selectedSourceId}
          />
          {selectedSourceId ? (
            <div className="grid gap-2">
              <h2 className="text-sm font-medium">Chunks</h2>
              {chunks.length === 0 ? (
                <EmptyState>暂无 chunks。</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead>Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chunks.map((chunk) => (
                      <TableRow key={chunk.id}>
                        <TableCell>{chunk.chunkIndex}</TableCell>
                        <TableCell>{truncateText(chunk.content, 180)}</TableCell>
                        <TableCell>{chunk.tokenCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
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

function SourcesTable(props: {
  items: AdminPersonalModelSourceDocument[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (source: AdminPersonalModelSourceDocument) => void;
  onPatch: (
    source: AdminPersonalModelSourceDocument,
    request: {
      status?: PersonalModelSourceStatus;
      usagePolicy?: PersonalModelUsagePolicy;
    }
  ) => void;
}) {
  if (props.loading) {
    return <Skeleton className="h-48" />;
  }
  if (props.items.length === 0) {
    return <EmptyState>暂无资料源。</EmptyState>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Usage</TableHead>
          <TableHead>Ingested</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((source) => (
          <TableRow
            className={props.selectedId === source.id ? "bg-muted/50" : ""}
            key={source.id}
          >
            <TableCell className="max-w-md">
              <div className="flex flex-col gap-1">
                <span>{truncateText(source.title, 120)}</span>
                <span className="text-xs text-muted-foreground">
                  {source.id}
                </span>
                <Button
                  className="w-fit px-0"
                  onClick={() => props.onSelect(source)}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  Chunks
                </Button>
              </div>
            </TableCell>
            <TableCell>{source.sourceType}</TableCell>
            <TableCell>
              <EnumSelect
                items={personalModelSourceStatuses}
                onChange={(value) =>
                  props.onPatch(source, {
                    status: value as PersonalModelSourceStatus
                  })
                }
                value={source.status}
              />
            </TableCell>
            <TableCell>
              <EnumSelect
                items={personalModelUsagePolicies}
                onChange={(value) =>
                  props.onPatch(source, {
                    usagePolicy: value as PersonalModelUsagePolicy
                  })
                }
                value={source.usagePolicy}
              />
            </TableCell>
            <TableCell>{formatDateTime(source.ingestedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
