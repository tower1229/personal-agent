export type ProgressEventType =
  | "status"
  | "tool_start"
  | "tool_done"
  | "workflow_step"
  | "approval_required"
  | "finalizing";

export type ProgressEventOutcome = "succeeded" | "failed";

export interface ProgressEvent {
  type: ProgressEventType;
  message: string;
  toolName?: string;
  workflowStep?: string;
  outcome?: ProgressEventOutcome;
}

export type ProgressHandler = (
  event: ProgressEvent
) => Promise<void> | void;

export async function emitProgress(
  handler: ProgressHandler | undefined,
  event: ProgressEvent
): Promise<void> {
  if (!handler) {
    return;
  }

  try {
    await handler(event);
  } catch (error) {
    console.error("Progress handler failed:", error);
  }
}
