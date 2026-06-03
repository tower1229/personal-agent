import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  deleteSkill,
  loadSkillDetail,
  loadSkillRouteDecisions,
  loadSkillRuns,
  loadSkills,
  publishSkill,
  saveSkillDraft,
  setSkillEnabled,
  testSkill,
  loadSkillIntents,
  createSkillIntent,
  deleteSkillIntent
} from "@/lib/api";
import { isCreateRoutePath } from "@/lib/admin-routes";
import { filterText, emptySkillForm, formFromSkill, skillRequestFromForm, skillStatus, useAsyncData, type SkillFormState } from "./resource-common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "./resource-common";

import { SkillDetailHeader } from "@/components/skill/skill-detail-header";
import { SkillPackageEditor } from "@/components/skill/skill-package-editor";
import { SkillRoutingPanel } from "@/components/skill/skill-routing-panel";
import { SkillTestPanel } from "@/components/skill/skill-test-panel";

export function SkillsPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = isCreateRoutePath(location.pathname);
  const hasDetailTarget = isNew || Boolean(params.id);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState<SkillFormState>(emptySkillForm);
  const [inlineError, setInlineError] = useState<string | null>(null);
  
  const skills = useAsyncData(() => loadSkills(), []);
  const skillRuns = useAsyncData(() => loadSkillRuns(), []);
  const routeDecisions = useAsyncData(() => loadSkillRouteDecisions(), []);
  const skillIntents = useAsyncData(() => loadSkillIntents(), []);
  const detail = useAsyncData(
    () =>
      params.id && !isNew
        ? loadSkillDetail(params.id)
        : Promise.resolve(null),
    [params.id, isNew]
  );

  useEffect(() => {
    if (isNew) {
      setForm(emptySkillForm);
      setInlineError(null);
    } else if (detail.data?.skill) {
      setForm(formFromSkill(detail.data.skill));
      setInlineError(null);
    }
  }, [detail.data, isNew]);

  const filtered = useMemo(() => {
    return (skills.data?.items ?? []).filter((skill) => {
      const currentStatus = skillStatus(skill);
      const matchesStatus =
        status === "all" ? currentStatus !== "deleted" : currentStatus === status;
      const matchesQuery = filterText(
        skill.id,
        skill.name,
        skill.description
      ).includes(query.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [query, skills.data, status]);
  
  const selectedSkill = detail.data?.skill ?? null;
  const isDeletedSkill = selectedSkill?.deleted === true;

  async function save() {
    setInlineError(null);
    try {
      const request = skillRequestFromForm(form);
      const response = await saveSkillDraft({
        id: isNew ? null : params.id ?? null,
        request
      });
      toast.success("Skill draft saved");
      navigate(`/admin/skills/${response.skill.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setInlineError(message);
      toast.error(message);
    }
  }

  async function publish() {
    if (!params.id || isNew) return;
    try {
      await publishSkill(params.id);
      toast.success("Skill published");
      navigate(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发布失败";
      setInlineError(message);
      toast.error(message);
    }
  }

  async function setEnabled(enabled: boolean) {
    if (!params.id || isNew) return;
    await setSkillEnabled(params.id, enabled);
    toast.success(enabled ? "Skill enabled" : "Skill disabled");
    navigate(0);
  }

  async function remove() {
    if (!params.id || isNew) return;
    try {
      await deleteSkill(params.id);
      toast.success("Skill deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败";
      toast.error(message);
      return;
    }
    setInlineError(null);
    detail.setData(null);
    navigate("/admin/skills", { replace: true });
  }

  async function handleRunTest(input: string) {
    if (!params.id || isNew) return null;
    const result = await testSkill(params.id, input);
    return result.output;
  }

  async function handleAddIntent(intentText: string) {
    if (!selectedSkill?.name) return;
    await createSkillIntent({
      skillName: selectedSkill.name,
      intentText: intentText.trim()
    });
    skillIntents.reload();
  }

  async function handleRemoveIntent(id: string) {
    await deleteSkillIntent(id);
    skillIntents.reload();
  }

  return (
    <>
      <PageHeader
        actions={
          <Button asChild>
            <Link to="/admin/skills/new">New Skill</Link>
          </Button>
        }
        description="管理标准 Agent Skill package、发布版本和测试运行。"
        title="Skills"
      />
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
            <CardDescription>{filtered.length} skills</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 skill"
              value={query}
            />
            <div className="grid gap-2">
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {skills.loading ? <Skeleton className="h-48" /> : null}
            <div className="flex flex-col gap-2">
              {filtered.map((skill) => (
                <Button
                  asChild
                  className="h-auto justify-start p-3"
                  key={skill.id}
                  variant={params.id === skill.id ? "secondary" : "outline"}
                >
                  <Link to={`/admin/skills/${skill.id}`}>
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      <span className="truncate font-medium">{skill.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <StatusBadge status={skillStatus(skill)} />
                        {skill.validation.ok ? "valid" : "invalid"}
                      </span>
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            {!hasDetailTarget ? (
              <EmptyState>从左侧选择一个 skill，或创建 New Skill。</EmptyState>
            ) : null}
            
            {hasDetailTarget ? (
              <>
                {detail.error ? <EmptyState>{detail.error}</EmptyState> : null}
                {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}
                {isDeletedSkill ? <EmptyState>这个 skill 已删除，只保留历史记录查看。</EmptyState> : null}
                
                {!detail.error ? (
                  <>
                    <SkillDetailHeader
                      isNew={isNew}
                      selectedSkill={selectedSkill}
                      isDeletedSkill={isDeletedSkill}
                      formEnabled={form.enabled}
                      onEnabledChange={(checked) => setForm({ ...form, enabled: checked })}
                      onSave={() => void save()}
                      onPublish={() => void publish()}
                      onDelete={() => void remove()}
                    />
                    
                    {!isNew ? (
                      <Tabs defaultValue="package" className="mt-2">
                        <TabsList>
                          <TabsTrigger value="package">Package</TabsTrigger>
                          <TabsTrigger value="routing">Routing</TabsTrigger>
                          <TabsTrigger value="test">Test & Audit</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="package">
                          <SkillPackageEditor
                            form={form}
                            onChange={setForm}
                            isDeletedSkill={isDeletedSkill}
                            selectedSkill={selectedSkill}
                          />
                        </TabsContent>
                        
                        <TabsContent value="routing">
                          <SkillRoutingPanel
                            skillId={selectedSkill?.id}
                            skillName={selectedSkill?.name}
                            routeDecisions={(routeDecisions.data?.items ?? []).filter(
                              (item) => item.matchedSkillId === params.id
                            )}
                            intents={(skillIntents.data?.items ?? []).filter(
                              (intent) => intent.skillName === selectedSkill?.name
                            )}
                            onAddIntent={handleAddIntent}
                            onRemoveIntent={handleRemoveIntent}
                            onReloadIntents={() => skillIntents.reload()}
                          />
                        </TabsContent>
                        
                        <TabsContent value="test">
                          <SkillTestPanel
                            isDeletedSkill={isDeletedSkill}
                            skillRuns={(skillRuns.data?.items ?? []).filter(
                              (item) => item.skillId === params.id
                            )}
                            onRunTest={handleRunTest}
                          />
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <SkillPackageEditor
                        form={form}
                        onChange={setForm}
                        isDeletedSkill={isDeletedSkill}
                        selectedSkill={selectedSkill}
                      />
                    )}
                  </>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
