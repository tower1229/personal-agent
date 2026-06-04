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
The assistant was given a user query, retrieved context from its personal knowledge base (Log memory, Core memory, SOUL, etc.), and generated a response.

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
1. Groundedness (groundednessScore): Did the agent avoid factual hallucinations? (1=Fabricated facts/events not in context, 5=Perfectly grounded. Note: Acute logical synthesis or psychological deduction based on existing context to reveal fallacies is NOT a hallucination and should be rewarded).
2. Context Weighting (oldDataMisuseScore): Did the agent correctly apply time-weighting to the context? (1=Treats 10-day old logs as current urgent states, 5=Correctly weights recency of logs while recognizing Core memory and SOUL as timeless).
3. Advice Fit (adviceFitScore): Does the advice fit the user's personal context and stated goals? (1=Generic/misaligned, 5=Highly personalized and fitting).
4. Emotional Calibration (emotionalCalibrationScore): Does the agent acutely discover deep fallacies without taking a stance or showing emotion? (1=Overly dramatic, judgmental, or overly pleasing/sycophantic, 5=Sharply reveals fallacies but with an objective and calm tone).

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
