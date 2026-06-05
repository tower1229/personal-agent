import { type AgentRuntime } from "./agent.js";

// Helper to get start of day in Asia/Shanghai
function getStartOfDayMs(timestampMs: number): number {
  const d = new Date(timestampMs);
  d.setUTCHours(d.getUTCHours() + 8);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCHours(d.getUTCHours() - 8);
  return d.getTime();
}

// Format the date as YYYY-MM-DD in Asia/Shanghai
function getDateStr(timestampMs: number): string {
  const d = new Date(timestampMs);
  d.setUTCHours(d.getUTCHours() + 8);
  return d.toISOString().split("T")[0];
}

export async function extractDailyMemories(runtime: AgentRuntime, ownerTgUserId: number): Promise<void> {
  const userProfile = await runtime.repositories.getUserProfile(ownerTgUserId.toString());
  if (!userProfile) return;

  let prefs: any = {};
  if (userProfile.preferences) {
    try {
      prefs = JSON.parse(userProfile.preferences);
    } catch {
      // Ignore parse error
    }
  }

  const nowMs = runtime.now();
  const todayStr = getDateStr(nowMs);
  const todayStartMs = getStartOfDayMs(nowMs);

  const lastExtractedDate = prefs.lastMemoryExtractionDate;
  if (lastExtractedDate === todayStr) {
    return; // Already extracted for today
  }

  // Set cursor to 24 hours ago if not present, otherwise use stored cursor
  let cursorMs = prefs.lastMemoryExtractionCursor;
  if (!cursorMs || typeof cursorMs !== "number") {
    cursorMs = nowMs - 24 * 3600 * 1000;
  }

  // Eagerly update the lastMemoryExtractionDate to prevent race conditions
  prefs.lastMemoryExtractionDate = todayStr;
  await runtime.repositories.upsertUserProfile({
    ...userProfile,
    preferences: JSON.stringify(prefs),
    updatedAt: nowMs
  });

  const limit = 50;
  const runs = await runtime.repositories.listUnextractedRuns({
    ownerTgUserId,
    cursorMs,
    endMs: todayStartMs,
    limit
  });

  if (runs.length === 0) {
    // No more runs to extract before today. Advance cursor to todayStartMs to skip the gap.
    prefs.lastMemoryExtractionCursor = todayStartMs;
    await runtime.repositories.upsertUserProfile({
      ...userProfile,
      preferences: JSON.stringify(prefs),
      updatedAt: runtime.now()
    });
    return;
  }

  // Prepare LLM request
  const transcript = runs
    .map(r => `User: ${r.messageText ?? ""}\nAgent: ${r.responseText ?? ""}`)
    .join("\n\n");

  const prompt = `You are a background memory extractor for a Personal Agent.
Review the following user conversation logs from a single day:

<transcript>
${transcript}
</transcript>

Extract any new, long-term personal facts, events, and preferences stated by the User that the Agent should remember for the future. 
Focus ONLY on factual, persistent context (e.g., "I started a new job", "I bought a dog", "I prefer dark mode").
Do not extract transient details or facts already acknowledged as '记忆已保存'.

Output ONLY a JSON array of strings, where each string is a concise memory. Wrap the JSON in \`\`\`json.
If there are no new facts worth saving, output an empty array \`\`\`json [] \`\`\`.`;

  let newMemories: string[] = [];
  if (runtime.llmClient) {
    try {
      const llmResult = await runtime.llmClient.createChatCompletion({
        messages: [
          { role: "system", content: "You are a factual memory extractor." },
          { role: "user", content: prompt }
        ],
        thinkingTier: "none"
      });
      const match = llmResult.content.match(/```json\s*(\[[\s\S]*?\])\s*```/);
      if (match) {
        newMemories = JSON.parse(match[1]);
      }
    } catch (e) {
      console.error("Memory extraction LLM failed:", e);
      // We encountered an error. Revert the date so it can try again later.
      prefs.lastMemoryExtractionDate = lastExtractedDate;
      await runtime.repositories.upsertUserProfile({
        ...userProfile,
        preferences: JSON.stringify(prefs),
        updatedAt: runtime.now()
      });
      return;
    }
  }

  // Save new memories
  for (const memoryContent of newMemories) {
    if (typeof memoryContent !== "string" || !memoryContent.trim()) continue;
    
    // Check if exactly same memory already exists
    const normalized = memoryContent.toLowerCase().replace(/\s+/g, "");
    const existing = await runtime.repositories.searchMemories({
      ownerTgUserId,
      keyword: normalized,
      limit: 1
    });
    if (existing.length > 0) continue;

    const mem = await runtime.repositories.createMemory({
      ownerTgUserId,
      content: memoryContent,
      normalizedContent: normalized,
      createdAt: runtime.now()
    });
    
    await runtime.repositories.recordMemoryEvent({
      memoryId: mem.id,
      ownerTgUserId,
      eventType: "created",
      payload: { source: "background_extractor" },
      createdAt: runtime.now()
    });
  }

  // Update cursor to the timestamp of the last run in this batch
  const lastRunInBatch = runs[runs.length - 1];
  if (lastRunInBatch) {
    prefs.lastMemoryExtractionCursor = lastRunInBatch.createdAt;
  }

  // If there were exactly 'limit' runs, there might be more. We revert the date so the next message triggers the rest.
  if (runs.length === limit) {
    prefs.lastMemoryExtractionDate = lastExtractedDate;
  }

  await runtime.repositories.upsertUserProfile({
    ...userProfile,
    preferences: JSON.stringify(prefs),
    updatedAt: runtime.now()
  });
}
