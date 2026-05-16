export interface WorkflowRunResult {
  workflowId: number;
  output: string;
}

export interface DailyBriefWorkflowInput {
  userId: string;
  chatId: string;
  triggerMessage: string;
}
