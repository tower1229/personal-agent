import { type AdminSkillDetail } from "@personal-agent/shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Field } from "@/pages/resource-common";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { skillStatus } from "@/pages/resource-common";

interface SkillDetailHeaderProps {
  isNew: boolean;
  selectedSkill: AdminSkillDetail | null;
  isDeletedSkill: boolean;
  formEnabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

export function SkillDetailHeader({
  isNew,
  selectedSkill,
  isDeletedSkill,
  formEnabled,
  onEnabledChange,
  onSave,
  onPublish,
  onDelete
}: SkillDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{isNew ? "Create Skill" : "Skill Detail"}</h2>
        {selectedSkill && <StatusBadge status={skillStatus(selectedSkill)} />}
        {!isNew && selectedSkill && (
           <span className="text-sm text-muted-foreground ml-auto">
             Telegram 触发: /skill {selectedSkill.name}
           </span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Protocol name">
          <Input disabled value={selectedSkill?.name ?? "read from SKILL.md"} />
        </Field>
        <Field label="Enabled">
          <div className="flex h-8 items-center gap-2">
            <Switch
              checked={formEnabled}
              disabled={isDeletedSkill}
              onCheckedChange={onEnabledChange}
            />
            <span className="text-sm text-muted-foreground">
              package can be routed after publish
            </span>
          </div>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {!isDeletedSkill ? (
          <>
            <Button onClick={onSave} type="button">
              Save Draft
            </Button>
            {!isNew ? (
              <>
                <Button onClick={onPublish} type="button" variant="secondary">
                  Publish
                </Button>
                <Button
                  onClick={() => onEnabledChange(!selectedSkill?.enabled)}
                  type="button"
                  variant="outline"
                >
                  {selectedSkill?.enabled ? "Disable" : "Enable"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive">
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除这个 skill？</AlertDialogTitle>
                      <AlertDialogDescription>
                        这是软删除，已删除 skill 不会再被路由。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
