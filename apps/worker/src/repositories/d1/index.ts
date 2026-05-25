import { type AgentRepositories } from "../../repositories.js";
import { createD1CoreDataRepositories } from "./coreData.js";
import { createD1RunRepositories } from "./runs.js";
import { createD1ScheduleRepositories } from "./schedules.js";
import { createD1SkillRepositories } from "./skills.js";
import { createD1WorkflowRepositories } from "./workflows.js";

export function createD1Repositories(db: D1Database): AgentRepositories {
  return {
    ...createD1RunRepositories(db),
    ...createD1CoreDataRepositories(db),
    ...createD1SkillRepositories(db),
    ...createD1WorkflowRepositories(db),
    ...createD1ScheduleRepositories(db)
  };
}
