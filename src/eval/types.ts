import { type EvalCategory } from "../db/schema.js";
import { type ToolRiskLevel } from "../tools/types.js";

export type EvalSetupAction =
  | {
      type: "create_todo";
      title: string;
      dueAt?: string | null;
    }
  | {
      type: "save_memory";
      memoryType: "profile" | "preference" | "fact" | "project" | "note";
      content: string;
      confidence?: number;
      importance?: number;
      source?: string | null;
    }
  | {
      type: "add_document";
      title: string;
      content: string;
      sourceType?: "text" | "markdown";
    }
  | {
      type: "create_pending_approval";
      toolName: string;
      args: Record<string, unknown>;
    };

export interface EvalCase {
  id: string;
  category: EvalCategory;
  input: string;
  setup?: EvalSetupAction[];
  expectedTools: string[];
  expectedKeywords: string[];
  expectedAnyKeywords?: string[];
  forbiddenKeywords: string[];
  expectedBehavior: string;
  riskLevel?: ToolRiskLevel;
}

export interface EvalExecutionResult {
  output: string;
  error: string | null;
  startedAt: Date;
}

export interface EvalScore {
  keywordPassed: boolean;
  forbiddenPassed: boolean;
  expectedToolsPassed: boolean;
  approvalPassed: boolean;
  passed: boolean;
  matchedKeywords: string[];
  missingKeywords: string[];
  expectedAnyKeywords: string[];
  matchedAnyKeywords: string[];
  forbiddenMatches: string[];
  expectedTools: string[];
  observedTools: string[];
  missingTools: string[];
  approvalExpected: boolean;
  approvalCreated: boolean;
  failureReasons: string[];
  notes: string[];
}
