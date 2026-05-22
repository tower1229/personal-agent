import { skillKinds } from "@personal-agent/shared";

export interface WorkerHealth {
  ok: true;
  service: "personal-agent-worker";
  supportedSkillKinds: typeof skillKinds;
}

export function getWorkerHealth(): WorkerHealth {
  return {
    ok: true,
    service: "personal-agent-worker",
    supportedSkillKinds: skillKinds
  };
}
