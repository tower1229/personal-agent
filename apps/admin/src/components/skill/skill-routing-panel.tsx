import { useState } from "react";
import { type SkillIntent } from "@personal-agent/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeBlock, EmptyState } from "@/pages/resource-common";
import { Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkillRoutingExamplesGenerateSheet } from "./skill-routing-examples-generate-sheet";

interface SkillRoutingPanelProps {
  skillId?: string;
  skillName?: string;
  routeDecisions: any[];
  intents: SkillIntent[];
  onAddIntent: (text: string) => Promise<void>;
  onRemoveIntent: (id: string) => Promise<void>;
  onReloadIntents: () => void;
}

export function SkillRoutingPanel({
  skillId,
  skillName,
  routeDecisions,
  intents,
  onAddIntent,
  onRemoveIntent,
  onReloadIntents
}: SkillRoutingPanelProps) {
  const [newIntentText, setNewIntentText] = useState("");

  const handleAdd = async () => {
    if (!skillName || !newIntentText.trim()) return;
    await onAddIntent(newIntentText);
    setNewIntentText("");
  };

  return (
    <Tabs defaultValue="examples" className="py-4">
      <TabsList>
        <TabsTrigger value="examples">Routing Examples</TabsTrigger>
        <TabsTrigger value="routes">Recent Routes</TabsTrigger>
      </TabsList>

      <TabsContent value="examples" className="flex flex-col gap-3 pt-4">
        <div className="flex gap-2">
          {skillId && (
            <SkillRoutingExamplesGenerateSheet
              skillId={skillId}
              onApplied={() => void onReloadIntents()}
            />
          )}
          <Input
            placeholder="例如: 添加待办事项"
            value={newIntentText}
            onChange={(e) => setNewIntentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          <Button onClick={() => void handleAdd()} disabled={!newIntentText.trim()}>
            Add
          </Button>
        </div>
        <div className="grid gap-2">
          {intents.map((intent) => (
            <div key={intent.id} className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">{intent.intentText}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 text-destructive"
                onClick={() => void onRemoveIntent(intent.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {intents.length === 0 ? (
            <EmptyState>暂无示例语料</EmptyState>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="routes" className="pt-4">
        {routeDecisions.length === 0 ? (
          <EmptyState>No recent routes for this skill.</EmptyState>
        ) : (
          <CodeBlock value={routeDecisions} />
        )}
      </TabsContent>
    </Tabs>
  );
}
