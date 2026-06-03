import { useState } from "react";
import { type AdminAssistResponse } from "@personal-agent/shared";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { batchCreateSkillIntents, generateSkillRoutingExamples } from "@/lib/api";

interface SkillRoutingExamplesGenerateSheetProps {
  skillId: string;
  onApplied: () => void;
}

export function SkillRoutingExamplesGenerateSheet({
  skillId,
  onApplied
}: SkillRoutingExamplesGenerateSheetProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("为这个技能生成 5 条典型的中文触发语料");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdminAssistResponse | null>(null);

  // Review List State
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [draftItems, setDraftItems] = useState<{ exampleText: string }[]>([]);
  const [applying, setApplying] = useState(false);

  const handleGenerate = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await generateSkillRoutingExamples(skillId, instruction);
      setResult(res);
      const items = (res.draft as any)?.items ?? [];
      setDraftItems(items.map((i: string) => ({ exampleText: i })));
      // Default select all
      setSelectedIndices(new Set(items.map((_: any, i: number) => i)));
    } catch (e: any) {
      toast.error("Generation failed", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const handleTextChange = (index: number, val: string) => {
    const newItems = [...draftItems];
    newItems[index] = { exampleText: val };
    setDraftItems(newItems);
  };

  const handleApply = async () => {
    const itemsToApply = draftItems.filter((_, idx) => selectedIndices.has(idx));
    if (itemsToApply.length === 0) return;

    setApplying(true);
    try {
      await batchCreateSkillIntents(skillId, {
        items: itemsToApply,
        assistRunId: result?.assistRun.id
      });
      toast.success("Applied successfully");
      setOpen(false);
      onApplied();
    } catch (e: any) {
      toast.error("Failed to apply", { description: e.message });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (val) {
          setResult(null);
          setLoading(false);
          setApplying(false);
        }
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Generate with LLM
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-none flex flex-col gap-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Generate Routing Examples</SheetTitle>
          <SheetDescription>
            使用 Admin LLM Assist 为此技能自动生成语料草案。
          </SheetDescription>
        </SheetHeader>

        {!result && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium leading-none">Instruction</label>
              <Textarea
                rows={4}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="例如: 生成 10 条中文语料，包含不同的疑问句式..."
              />
            </div>
            <Button
              onClick={() => void handleGenerate()}
              disabled={loading || !instruction.trim()}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Generating..." : "Generate"}
            </Button>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Review Draft</h3>
              <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
                Regenerate
              </Button>
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                有 {result.warnings.length} 条警告。
              </div>
            )}

            <div className="flex flex-col gap-3">
              {draftItems.map((item, index) => (
                <div key={index} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id={`draft-${index}`}
                    className="mt-2"
                    checked={selectedIndices.has(index)}
                    onCheckedChange={() => toggleSelect(index)}
                  />
                  <Input
                    className="flex-1"
                    value={item.exampleText}
                    onChange={(e) => handleTextChange(index, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <Button
              className="mt-4"
              disabled={selectedIndices.size === 0 || applying}
              onClick={() => void handleApply()}
            >
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply {selectedIndices.size} Selected
            </Button>
            
            <div className="text-xs text-muted-foreground mt-2">
              Assist Run ID: {result.assistRun.id}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
