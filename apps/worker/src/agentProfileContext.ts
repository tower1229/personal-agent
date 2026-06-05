import { type AgentRepositories } from "./repositories.js";

export async function buildAgentProfileContext(input: {
  repositories: AgentRepositories;
  ownerTgUserId: number;
  now: () => number;
}): Promise<string> {
  const profile = await input.repositories.getUserProfile(
    input.ownerTgUserId.toString()
  );
  let profileContext = "";

  if (profile) {
    const parts: string[] = [];
    if (profile.name) parts.push(`称呼: ${profile.name}`);
    if (profile.gender) parts.push(`性别: ${profile.gender}`);
    if (profile.birthdayTimestamp) {
      const age =
        new Date(input.now() - profile.birthdayTimestamp).getUTCFullYear() -
        1970;
      parts.push(`真实年龄: ${age}岁`);
    }

    const basicProfile =
      parts.length > 0 ? `[用户档案: ${parts.join(", ")}]\n` : "";
    const agentSoul = profile.agentSoul
      ? `[Agent SOUL / 行为契约 (最高优先级)]\n${profile.agentSoul}\n`
      : "";
    const coreMemory = profile.coreMemory
      ? `[核心记忆/Core Memory (最高优先级)]\n${profile.coreMemory}\n`
      : "";

    profileContext = basicProfile + agentSoul + coreMemory;
  }

  const recentMemories = await input.repositories.listMemories(
    input.ownerTgUserId,
    50
  );
  const tenDaysAgo = input.now() - 10 * 24 * 60 * 60 * 1000;
  const logMemories = recentMemories.filter(
    (memory) => memory.createdAt >= tenDaysAgo
  );

  if (logMemories.length === 0) {
    return profileContext;
  }

  const memoryStrings = logMemories
    .map((memory) => `- ${memory.content}`)
    .join("\n");
  return `${profileContext}[近期日志记忆 / Log Memory (最近10天)]\n${memoryStrings}\n\n`;
}
