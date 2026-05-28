import {
  type PersonalModelClaimRecord,
  type PersonalModelSourceChunkRecord,
  type PersonalModelUnderstandingGapRecord,
  type AgentRepositories
} from "./repositories.js";
import { type PersonalModelScenario } from "@personal-agent/shared";

const scenarioKeywords: Record<PersonalModelScenario, string[]> = {
  writing: ["写作", "写", "文章", "博客", "文字", "修改", "润色"],
  health: ["睡觉", "休息", "累", "失眠", "健康", "疲劳", "作息", "精力"],
  relationship: ["朋友", "关系", "吵架", "父母", "恋人", "对象", "沟通", "别人"],
  self_knowledge: ["我是谁", "性格", "测试", "mbti", "探索", "潜意识", "星盘", "自己", "价值观"],
  emotional_support: ["难受", "伤心", "烦躁", "焦虑", "抑郁", "情绪", "哭", "压力"],
  work_decision: ["工作", "离职", "辞职", "职业", "面试", "老板", "公司", "业务"],
  technical_writing: ["技术文章", "教程", "代码注释", "文档", "readme"],
  technical_collaboration: ["code review", "pr", "协作", "团队", "开发", "代码", "bug"],
  life_decision: ["搬家", "买房", "决定", "人生", "选择", "规划"],
  global: []
};

export function classifyScenario(inputText: string): PersonalModelScenario {
  let bestScenario: PersonalModelScenario = "global";
  let maxScore = 0;

  for (const [scenario, keywords] of Object.entries(scenarioKeywords)) {
    let score = 0;
    for (const keyword of keywords) {
      if (inputText.toLowerCase().includes(keyword.toLowerCase())) {
        // Score is the length of the matched keyword to favor longer, more specific keywords
        score += keyword.length;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestScenario = scenario as PersonalModelScenario;
    }
  }

  return bestScenario;
}

function extractSearchKeyword(inputText: string): string | null {
  if (inputText.length < 20) {
    return inputText;
  }
  // Try to find a meaningful keyword, or just use the first 10 chars
  return inputText.slice(0, 10);
}

export interface AssembleContextTrace {
  scenario: PersonalModelScenario;
  selectedClaimIds: string[];
  excludedClaimIds: string[];
  selectedChunkIds: string[];
  selectedGapIds: string[];
}

export async function assemblePersonalModelContext(input: {
  repositories: AgentRepositories;
  ownerTgUserId: number;
  inputText: string;
  now: number;
}): Promise<{ contextString: string | null; trace: AssembleContextTrace }> {
  const scenario = classifyScenario(input.inputText);
  
  // 1. Fetch active claims (which already handles validFrom/validUntil and usagePolicy != 'do_not_use')
  const allClaims = await input.repositories.listActivePersonalModelClaims({
    ownerTgUserId: input.ownerTgUserId,
    limit: 50,
    now: input.now
  });

  const selectedClaims: PersonalModelClaimRecord[] = [];
  const excludedClaimIds: string[] = [];

  for (const claim of allClaims) {
    // We prioritize matching scenario and global
    if (claim.scenario === scenario || claim.scenario === "global") {
      selectedClaims.push(claim);
    } else {
      excludedClaimIds.push(claim.id);
    }
  }

  // Ensure exact scenario matches appear before global ones, preserving the confidence order from DB
  selectedClaims.sort((a, b) => {
    if (a.scenario === scenario && b.scenario !== scenario) return -1;
    if (b.scenario === scenario && a.scenario !== scenario) return 1;
    return 0;
  });

  // Slice to max 8 claims to avoid prompt bloat
  const finalClaims = selectedClaims.slice(0, 8);

  // 2. Fetch source chunks
  const keyword = extractSearchKeyword(input.inputText);
  let chunks: PersonalModelSourceChunkRecord[] = [];
  if (keyword && keyword.trim().length > 0) {
    chunks = await input.repositories.searchPersonalModelSourceChunks({
      ownerTgUserId: input.ownerTgUserId,
      keyword: keyword.trim().toLowerCase(),
      limit: 3
    });
  }

  const anyGaps = await input.repositories.listPersonalModelUnderstandingGaps({
    ownerTgUserId: input.ownerTgUserId,
    limit: 1,
    offset: 0
  });

  if (anyGaps.length === 0) {
    const defaultGaps = [
      {
        scenario: "self_knowledge" as const,
        description: "初始化个人信息：需要发起关于基本性格特征与认知框架（如MBTI、个人核心价值观）的集中采访。"
      },
      {
        scenario: "health" as const,
        description: "初始化健康档案：需要发起关于日常作息、运动与饮食习惯的健康状况采访。"
      },
      {
        scenario: "relationship" as const,
        description: "初始化人际档案：需要发起关于家庭背景、核心人际关系和社交喜好的采访。"
      }
    ];

    for (const gap of defaultGaps) {
      await input.repositories.createPersonalModelUnderstandingGap({
        id: crypto.randomUUID(),
        ownerTgUserId: input.ownerTgUserId,
        scenario: gap.scenario,
        gapDescription: gap.description,
        status: "open",
        createdAt: input.now,
        updatedAt: input.now
      });
    }
  }

  const openGaps = await input.repositories.listPersonalModelUnderstandingGaps({
    ownerTgUserId: input.ownerTgUserId,
    limit: 50,
    offset: 0,
    status: "open"
  });

  const selectedGaps = openGaps.filter(
    (gap) => gap.scenario === scenario || gap.scenario === "global"
  ).slice(0, 3);

  const trace: AssembleContextTrace = {
    scenario,
    selectedClaimIds: finalClaims.map(c => c.id),
    excludedClaimIds,
    selectedChunkIds: chunks.map(c => c.id),
    selectedGapIds: selectedGaps.map(g => g.id)
  };

  if (finalClaims.length === 0 && chunks.length === 0 && selectedGaps.length === 0) {
    return { contextString: null, trace };
  }

  const lines: string[] = ["User model context:"];
  
  if (finalClaims.length > 0) {
    lines.push("- Stable preferences & states:");
    for (const claim of finalClaims) {
      lines.push(`  - [${claim.layer}/${claim.scenario}/${claim.confidence}] ${claim.claim}`);
    }
  }

  if (chunks.length > 0) {
    lines.push("- Relevant source chunks:");
    const documents = await Promise.all(
      chunks.map((c) =>
        input.repositories.getPersonalModelSourceDocument({
          ownerTgUserId: input.ownerTgUserId,
          id: c.documentId
        })
      )
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const doc = documents[i];
      let prefix = "[Source Chunk]";

      if (doc) {
        try {
          const meta = doc.metadataJson ? JSON.parse(doc.metadataJson) : {};
          if (doc.sourceType === "writing" || doc.sourceType === "blog") {
            prefix = meta.isOriginal ? "[Original Writing]" : "[External Article]";
          } else if (
            doc.sourceType === "qq_export" ||
            doc.sourceType === "weibo_export"
          ) {
            prefix = meta.isHistoricalExpression
              ? "[Historical Social Expression]"
              : "[Social Expression]";
          } else if (doc.sourceType === "personality_framework") {
            prefix = "[Personality Framework]";
          }
        } catch {
          // fallback
        }
      }
      lines.push(`  - ${prefix}: ${chunk.content}`);
    }
  }

  if (selectedGaps.length > 0) {
    lines.push("- Known understanding gaps (things you need to figure out):");
    for (const gap of selectedGaps) {
      lines.push(`  - [${gap.scenario}] ${gap.gapDescription}`);
    }
  }

  lines.push("");
  lines.push("Use this context implicitly. Only cite it explicitly when correcting a conflict, explaining a challenge, handling sensitive reasoning, asking questions to fill gaps, or when the user asks why.");

  return {
    contextString: lines.join("\\n"),
    trace
  };
}
