import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock, EmptyState } from "@/pages/resource-common";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SkillTestPanelProps {
  isDeletedSkill: boolean;
  skillRuns: any[];
  onRunTest: (input: string) => Promise<string | null>;
}

export function SkillTestPanel({
  isDeletedSkill,
  skillRuns,
  onRunTest
}: SkillTestPanelProps) {
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const handleTest = async () => {
    if (!testInput.trim()) return;
    try {
      const output = await onRunTest(testInput);
      setTestOutput(output);
      toast.success("Test run completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试失败");
    }
  };

  return (
    <Tabs defaultValue="test" className="py-4">
      <TabsList>
        <TabsTrigger value="test">Test Run</TabsTrigger>
        <TabsTrigger value="runs">Recent Runs</TabsTrigger>
      </TabsList>
      
      <TabsContent value="test" className="flex flex-col gap-3 pt-4">
        {isDeletedSkill ? (
          <EmptyState>已删除 skill 不能再执行测试。</EmptyState>
        ) : (
          <>
            <Textarea
              onChange={(event) => setTestInput(event.target.value)}
              placeholder="输入测试消息"
              rows={4}
              value={testInput}
            />
            <Button
              disabled={!testInput.trim()}
              onClick={() => void handleTest()}
              type="button"
            >
              Run Test
            </Button>
            {testOutput ? <CodeBlock value={testOutput} /> : null}
          </>
        )}
      </TabsContent>

      <TabsContent value="runs" className="pt-4">
        {skillRuns.length === 0 ? (
          <EmptyState>No recent runs for this skill.</EmptyState>
        ) : (
          <CodeBlock value={skillRuns} />
        )}
      </TabsContent>
    </Tabs>
  );
}
