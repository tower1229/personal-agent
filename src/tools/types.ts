import { type z } from "zod";

export type ToolRiskLevel =
  | "read"
  | "write_low"
  | "write_high"
  | "external_send"
  | "destructive";

export interface ToolExecutionContext {
  userId: string;
  chatId: string;
  runId?: number | null;
}

export interface AgentTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TSchema;
  riskLevel: ToolRiskLevel;
  execute(args: z.infer<TSchema>, context: ToolExecutionContext): Promise<unknown>;
}
