import { type AgentRuntime } from "./agent.js";
import { type RunEvaluationRecord, type RunRecord } from "./repositories.js";

export async function evaluateRun(
  run: RunRecord,
  runtime: AgentRuntime
): Promise<RunEvaluationRecord | null> {
  if (!run.responseText || !run.contextTraceJson) {
    return null;
  }
  
  if (!runtime.llmClient) {
    return null;
  }

  const prompt = `You are an expert evaluator assessing the performance of an AI assistant (Personal Agent).
The assistant was given a user query, retrieved context from its personal knowledge base, and generated a response.

Review the following:
User Query:
<query>
${run.messageText ?? "N/A"}
</query>

Agent Response:
<response>
${run.responseText}
</response>

Context Trace (JSON):
<trace>
${run.contextTraceJson}
</trace>

Please evaluate the Agent Response across the following 4 dimensions on a scale of 1 to 5 (where 1 is worst, and 5 is best):
1. Groundedness (groundednessScore): Does the response correctly rely on the provided context trace without hallucinating? (1=Hallucinates heavily, 5=Perfectly grounded)
2. Old Data Misuse (oldDataMisuseScore): If the query concerns recent events but the context is old, did the agent clarify the data is old instead of confidently answering? (1=Confidently misuses old data, 5=Appropriately hedges or data is up-to-date)
3. Advice Fit (adviceFitScore): Does the advice fit the user's personal context and stated goals? (1=Generic/misaligned, 5=Highly personalized and fitting)
4. Emotional Calibration (emotionalCalibrationScore): Is the tone appropriate for the context? (1=Overly dramatic, robotic, or inappropriate, 5=Natural, empathetic, appropriate)

First, write out your reasoning. Then, provide the final scores as a JSON block wrapped in \`\`\`json. The JSON should match exactly this shape:
{
  "groundednessScore": number,
  "oldDataMisuseScore": number,
  "adviceFitScore": number,
  "emotionalCalibrationScore": number
}`;

  try {
    const llmResult = await runtime.llmClient.createChatCompletion({
      messages: [
        { role: "system", content: "You are an AI assistant evaluation system." },
        { role: "user", content: prompt }
      ],
      thinkingTier: "max"
    });

    const content = llmResult.content ?? "";
    const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!jsonMatch) {
      return null;
    }

    const scores = JSON.parse(jsonMatch[1]);
    
    const evaluation: RunEvaluationRecord = {
      id: runtime.generateId(),
      runId: run.id,
      ownerTgUserId: run.ownerTgUserId,
      groundednessScore: Number(scores.groundednessScore) || 3,
      oldDataMisuseScore: Number(scores.oldDataMisuseScore) || 3,
      adviceFitScore: Number(scores.adviceFitScore) || 3,
      emotionalCalibrationScore: Number(scores.emotionalCalibrationScore) || 3,
      reasoning: content,
      createdAt: runtime.now()
    };

    return await runtime.repositories.createRunEvaluation(evaluation);
  } catch (error) {
    console.error("evaluateRun failed:", error);
    return null;
  }
}
