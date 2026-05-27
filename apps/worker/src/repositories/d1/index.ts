import { type AgentRepositories } from "../../repositories.js";
import { createD1CoreDataRepositories } from "./coreData.js";
import { createD1LongTaskRepositories } from "./longTasks.js";
import { createD1PersonalModelRepositories } from "./personalModel.js";
import { createD1RunRepositories } from "./runs.js";
import { createD1ScheduleRepositories } from "./schedules.js";
import { createD1SkillRepositories } from "./skills.js";

export function createD1Repositories(db: D1Database): AgentRepositories {
  return {
    ...createD1RunRepositories(db),
    ...createD1CoreDataRepositories(db),
    ...createD1PersonalModelRepositories(db),
    ...createD1SkillRepositories(db),
    ...createD1LongTaskRepositories(db),
    ...createD1ScheduleRepositories(db)
  };
}
