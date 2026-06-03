import { type AdminSkillDetail } from "@personal-agent/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, CodeBlock, EmptyState, type SkillFormState } from "@/pages/resource-common";
import { Plus, Trash2 } from "lucide-react";

interface SkillPackageEditorProps {
  form: SkillFormState;
  onChange: (form: SkillFormState) => void;
  isDeletedSkill: boolean;
  selectedSkill: AdminSkillDetail | null;
}

export function SkillPackageEditor({
  form,
  onChange,
  isDeletedSkill,
  selectedSkill
}: SkillPackageEditorProps) {
  function updateFilePath(index: number, path: string) {
    const newFiles = [...form.extraFiles];
    if (newFiles[index]) {
      newFiles[index] = { ...newFiles[index]!, path };
      onChange({ ...form, extraFiles: newFiles });
    }
  }

  function updateFileContent(index: number, content: string) {
    const newFiles = [...form.extraFiles];
    if (newFiles[index]) {
      newFiles[index] = { ...newFiles[index]!, content };
      onChange({ ...form, extraFiles: newFiles });
    }
  }

  function removeFile(index: number) {
    onChange({
      ...form,
      extraFiles: form.extraFiles.filter((_, i) => i !== index)
    });
  }

  function addFile() {
    onChange({
      ...form,
      extraFiles: [...form.extraFiles, { path: "", content: "" }]
    });
  }

  return (
    <div className="flex flex-col gap-5 py-4">
      <Field label="SKILL.md">
        <Textarea
          disabled={isDeletedSkill}
          onChange={(event) =>
            onChange({ ...form, skillMarkdown: event.target.value })
          }
          rows={14}
          value={form.skillMarkdown}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Extra Files</span>
            <span className="text-xs text-muted-foreground">
              额外的文本文件，例如 references/style.md 或 scripts/helper.js
            </span>
          </div>
          {!isDeletedSkill && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFile}
              className="gap-1 text-xs"
            >
              <Plus className="h-3 w-3" /> Add File
            </Button>
          )}
        </div>

        {form.extraFiles.length === 0 ? (
          <EmptyState>
            {!isDeletedSkill ? "暂无额外文件。点击右上角 \"Add File\" 添加新文件。" : "无额外文件。"}
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {form.extraFiles.map((item, index) => (
              <Card key={index} className="border-muted bg-card/50">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 p-3 pb-2">
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="文件路径，如 references/rules.md"
                    disabled={isDeletedSkill}
                    value={item.path}
                    onChange={(e) => updateFilePath(index, e.target.value)}
                  />
                  {!isDeletedSkill && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeFile(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <Textarea
                    className="font-mono text-xs leading-relaxed"
                    placeholder="输入文件内容..."
                    rows={6}
                    disabled={isDeletedSkill}
                    value={item.content}
                    onChange={(e) => updateFileContent(index, e.target.value)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedSkill ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <span className="text-sm font-medium mb-2 block">Validation</span>
            <CodeBlock value={selectedSkill.validation} />
          </div>
          <div>
            <span className="text-sm font-medium mb-2 block">File inventory</span>
            <CodeBlock value={selectedSkill.fileInventory} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
