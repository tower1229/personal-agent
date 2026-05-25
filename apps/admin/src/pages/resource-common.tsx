import { useEffect, useState, type ReactNode } from "react";
import { skillManifestSchema, type AdminSkillDetail, type AdminSkillListItem, type BuiltInToolName, type SkillKind } from "@personal-agent/shared";

export const weekDays = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" }
];

export interface SkillFormState {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  enabled: boolean;
  triggerPhrases: string;
  instructions: string;
  allowedTools: BuiltInToolName[];
  workflowTemplate: string;
}

export interface ScheduleFormState {
  id: string | null;
  name: string;
  commandText: string;
  enabled: boolean;
  cadence: "daily" | "weekly";
  timeOfDay: string;
  daysOfWeek: number[];
}

export const emptySkillForm: SkillFormState = {
  id: "",
  name: "",
  description: "",
  kind: "chat",
  enabled: true,
  triggerPhrases: "",
  instructions: "",
  allowedTools: ["list_todos", "search_memory"],
  workflowTemplate: "[]"
};

export const emptyScheduleForm: ScheduleFormState = {
  id: null,
  name: "",
  commandText: "",
  enabled: true,
  cadence: "daily",
  timeOfDay: "09:00",
  daysOfWeek: [1]
};

export function Field(props: {
  children: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium">{props.label}</span>
      {props.children}
      {props.description ? (
        <span className="text-xs text-muted-foreground">{props.description}</span>
      ) : null}
    </label>
  );
}

export function EmptyState(props: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {props.children}
    </div>
  );
}

export function CodeBlock(props: { value: unknown }) {
  const text =
    typeof props.value === "string"
      ? props.value
      : JSON.stringify(props.value, null, 2);

  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
      {text || "-"}
    </pre>
  );
}

export function parseJsonText(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function skillStatus(skill: AdminSkillListItem | AdminSkillDetail) {
  if (skill.deleted) {
    return "deleted";
  }
  if (!skill.enabled) {
    return "disabled";
  }
  return skill.publishedVersionId ? "published" : "draft";
}

export function formFromSkill(skill: AdminSkillDetail): SkillFormState {
  return {
    id: skill.manifest.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    kind: skill.manifest.kind,
    enabled: skill.enabled,
    triggerPhrases: skill.manifest.triggerPhrases.join("\n"),
    instructions: skill.manifest.instructions,
    allowedTools: [...skill.manifest.allowedTools],
    workflowTemplate: JSON.stringify(skill.manifest.workflowTemplate, null, 2)
  };
}

export function manifestFromForm(form: SkillFormState) {
  return skillManifestSchema.parse({
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    kind: form.kind,
    enabled: form.enabled,
    triggerPhrases: form.triggerPhrases
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    intentExamples: [],
    instructions: form.instructions.trim(),
    allowedTools: form.allowedTools,
    riskLevel: "read",
    autoRunThreshold: 0.75,
    confirmThreshold: 0.45,
    workflowTemplate: JSON.parse(form.workflowTemplate || "[]") as unknown
  });
}

export function filterText(...parts: Array<string | null | undefined>) {
  return parts.join(" ").toLowerCase();
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void loader()
      .then((value) => {
        if (!cancelled) {
          setData(value);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return { data, error, loading, setData };
}

