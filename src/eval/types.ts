import { type EvalCategory } from "../db/schema.js";
import { type ToolRiskLevel } from "../tools/types.js";

export interface EvalCase {
  id: string;
  category: EvalCategory;
  input: string;
  expectedTools: string[];
  expectedKeywords: string[];
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
  passed: boolean;
  matchedKeywords: string[];
  missingKeywords: string[];
  forbiddenMatches: string[];
  expectedTools: string[];
  observedTools: string[];
  missingTools: string[];
  approvalExpected: boolean;
  approvalCreated: boolean;
  notes: string[];
}
