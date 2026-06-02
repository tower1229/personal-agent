import { useEffect, useState, type ReactNode } from "react";
import { type AdminSkillDetail, type AdminSkillListItem, type AdminSkillUpsertRequest } from "@personal-agent/shared";

export const weekDays = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" }
];

export interface ExtraFileItem {
  path: string;
  content: string;
}

export interface SkillFormState {
  skillMarkdown: string;
  extraFiles: ExtraFileItem[];
  enabled: boolean;
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
  skillMarkdown: [
    "---",
    "name: daily-brief",
    "description: Generate a concise daily briefing from available context.",
    "allowed-tools:",
    "  - list_todos",
    "  - search_memory",
    "---",
    "用简洁中文整理用户输入，并在需要时调用允许的内置工具。"
  ].join("\n"),
  extraFiles: [],
  enabled: true
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
  const { "SKILL.md": skillMarkdown = "", ...restFiles } = skill.files;
  const extraFiles = Object.entries(restFiles).map(([path, content]) => ({
    path,
    content
  }));
  return {
    skillMarkdown,
    extraFiles,
    enabled: skill.enabled
  };
}

export function skillRequestFromForm(form: SkillFormState): AdminSkillUpsertRequest {
  const files: Record<string, string> = {};
  for (const item of form.extraFiles) {
    const trimmedPath = item.path.trim().replace(/\\/g, "/");
    if (trimmedPath) {
      files[trimmedPath] = item.content;
    }
  }

  return {
    files: {
      ...files,
      "SKILL.md": form.skillMarkdown
    },
    enabled: form.enabled
  };
}

export function filterText(...parts: Array<string | null | undefined>) {
  return parts.join(" ").toLowerCase();
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

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
  }, [...deps, tick]);

  const reload = () => setTick((t) => t + 1);

  return { data, error, loading, setData, reload };
}
