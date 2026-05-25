import {
  escapeLike,
  toApproval,
  toMemory,
  toRun,
  toSchedule,
  toScheduleExecution,
  toSkill,
  toSkillRouteDecision,
  toSkillRun,
  toSkillVersion,
  toTodo,
  toToolCall,
  toWorkflowRun,
  toWorkflowStep,
  type ApprovalRequestRow,
  type MemoryRow,
  type RunRow,
  type ScheduleExecutionRow,
  type ScheduleRow,
  type SkillRouteDecisionRow,
  type SkillRow,
  type SkillRunRow,
  type SkillVersionRow,
  type TodoRow,
  type ToolCallRow,
  type WorkflowRunRow,
  type WorkflowStepRow
} from "./mappers.js";
import { type AgentRepositories, type RunnableSkillRecord } from "../../repositories.js";

export function createD1SkillRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createSkill"
  | "updateSkillDraft"
  | "listSkills"
  | "getSkill"
  | "setSkillEnabled"
  | "softDeleteSkill"
  | "publishSkill"
  | "getRunnableSkillById"
  | "listRunnableSkills"
  | "createSkillRouteDecision"
  | "listSkillRouteDecisions"
  | "getSkillRouteDecisionForRun"
  | "createSkillRun"
  | "updateSkillRun"
  | "listSkillRuns"
  | "getSkillRunForRun"
> {
  return {
    async createSkill(input) {
      const manifestJson = JSON.stringify(input.manifest);
      const row = await db
        .prepare(
          `INSERT INTO skills (
            id, owner_tg_user_id, draft_manifest_json, enabled, deleted_at,
            published_version_id, published_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
          RETURNING *`
        )
        .bind(
          input.manifest.id,
          input.ownerTgUserId,
          manifestJson,
          input.manifest.enabled ? 1 : 0,
          input.createdAt,
          input.createdAt
        )
        .first<SkillRow>();

      if (!row) {
        throw new Error("Failed to create skill");
      }

      return toSkill(row);
    },

    async updateSkillDraft(input) {
      const row = await db
        .prepare(
          `UPDATE skills
          SET draft_manifest_json = ?, enabled = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(
          JSON.stringify(input.manifest),
          input.manifest.enabled ? 1 : 0,
          input.updatedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<SkillRow>();

      return row ? toSkill(row) : null;
    },

    async listSkills(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skills
          WHERE owner_tg_user_id = ? AND deleted_at IS NULL
          ORDER BY updated_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<SkillRow>();

      return (results ?? []).map(toSkill);
    },

    async getSkill(input) {
      const row = await db
        .prepare(
          `SELECT * FROM skills
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<SkillRow>();

      return row ? toSkill(row) : null;
    },

    async setSkillEnabled(input) {
      const row = await db
        .prepare(
          `UPDATE skills
          SET enabled = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(
          input.enabled ? 1 : 0,
          input.updatedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<SkillRow>();

      return row ? toSkill(row) : null;
    },

    async softDeleteSkill(input) {
      const row = await db
        .prepare(
          `UPDATE skills
          SET enabled = 0, deleted_at = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(input.deletedAt, input.deletedAt, input.ownerTgUserId, input.id)
        .first<SkillRow>();

      if (row) {
        return toSkill(row);
      }

      const existing = await this.getSkill({
        ownerTgUserId: input.ownerTgUserId,
        id: input.id
      });

      return existing?.deletedAt !== null ? existing : null;
    },

    async publishSkill(input) {
      const skill = await this.getSkill({
        ownerTgUserId: input.ownerTgUserId,
        id: input.id
      });

      if (!skill || skill.deletedAt !== null) {
        return null;
      }

      const nextVersion = (skill.publishedVersion ?? 0) + 1;
      const versionRow = await db
        .prepare(
          `INSERT INTO skill_versions (
            id, skill_id, owner_tg_user_id, version, manifest_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.versionId,
          skill.id,
          input.ownerTgUserId,
          nextVersion,
          JSON.stringify(skill.draftManifest),
          input.createdAt
        )
        .first<SkillVersionRow>();

      if (!versionRow) {
        throw new Error("Failed to publish skill");
      }

      await db
        .prepare(
          `UPDATE skills
          SET published_version_id = ?, published_version = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(
          versionRow.id,
          versionRow.version,
          input.createdAt,
          input.ownerTgUserId,
          skill.id
        )
        .run();

      return toSkillVersion(versionRow);
    },

    async getRunnableSkillById(input) {
      const row = await db
        .prepare(
          `SELECT
            s.id AS skill_id,
            s.owner_tg_user_id AS skill_owner_tg_user_id,
            s.draft_manifest_json,
            s.enabled,
            s.deleted_at,
            s.published_version_id,
            s.published_version,
            s.created_at AS skill_created_at,
            s.updated_at,
            v.id AS version_id,
            v.version,
            v.manifest_json,
            v.created_at AS version_created_at
          FROM skills s
          JOIN skill_versions v ON v.id = s.published_version_id
          WHERE s.owner_tg_user_id = ?
            AND s.id = ?
            AND s.enabled = 1
            AND s.deleted_at IS NULL`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<{
          skill_id: string;
          skill_owner_tg_user_id: number;
          draft_manifest_json: string;
          enabled: number;
          deleted_at: number | null;
          published_version_id: string | null;
          published_version: number | null;
          skill_created_at: number;
          updated_at: number;
          version_id: string;
          version: number;
          manifest_json: string;
          version_created_at: number;
        }>();

      if (!row) {
        return null;
      }

      return {
        skill: toSkill({
          id: row.skill_id,
          owner_tg_user_id: row.skill_owner_tg_user_id,
          draft_manifest_json: row.draft_manifest_json,
          enabled: row.enabled,
          deleted_at: row.deleted_at,
          published_version_id: row.published_version_id,
          published_version: row.published_version,
          created_at: row.skill_created_at,
          updated_at: row.updated_at
        }),
        version: toSkillVersion({
          id: row.version_id,
          skill_id: row.skill_id,
          owner_tg_user_id: row.skill_owner_tg_user_id,
          version: row.version,
          manifest_json: row.manifest_json,
          created_at: row.version_created_at
        })
      };
    },

    async listRunnableSkills(ownerTgUserId) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skills
          WHERE owner_tg_user_id = ?
            AND enabled = 1
            AND deleted_at IS NULL
            AND published_version_id IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 100`
        )
        .bind(ownerTgUserId)
        .all<SkillRow>();
      const runnable: RunnableSkillRecord[] = [];

      for (const skillRow of results ?? []) {
        const skill = toSkill(skillRow);
        const version = skill.publishedVersionId
          ? await db
              .prepare(
                `SELECT * FROM skill_versions
                WHERE owner_tg_user_id = ? AND id = ?`
              )
              .bind(ownerTgUserId, skill.publishedVersionId)
              .first<SkillVersionRow>()
          : null;

        if (version) {
          runnable.push({
            skill,
            version: toSkillVersion(version)
          });
        }
      }

      return runnable;
    },

    async createSkillRouteDecision(input) {
      const row = await db
        .prepare(
          `INSERT INTO skill_route_decisions (
            id, run_id, owner_tg_user_id, input_text, trigger_type,
            matched_skill_id, matched_skill_version_id, confidence,
            reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.inputText,
          input.triggerType,
          input.matchedSkillId,
          input.matchedSkillVersionId,
          input.confidence,
          input.reason,
          input.createdAt
        )
        .first<SkillRouteDecisionRow>();

      if (!row) {
        throw new Error("Failed to create skill route decision");
      }

      return toSkillRouteDecision(row);
    },

    async listSkillRouteDecisions(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skill_route_decisions
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<SkillRouteDecisionRow>();

      return (results ?? []).map(toSkillRouteDecision);
    },

    async getSkillRouteDecisionForRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM skill_route_decisions
          WHERE owner_tg_user_id = ? AND run_id = ?
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(input.ownerTgUserId, input.runId)
        .first<SkillRouteDecisionRow>();

      return row ? toSkillRouteDecision(row) : null;
    },

    async createSkillRun(input) {
      const row = await db
        .prepare(
          `INSERT INTO skill_runs (
            id, run_id, owner_tg_user_id, skill_id, skill_version_id, status,
            input_text, output_text, error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.skillId,
          input.skillVersionId,
          input.status,
          input.inputText,
          input.outputText,
          input.error,
          input.createdAt,
          input.updatedAt
        )
        .first<SkillRunRow>();

      if (!row) {
        throw new Error("Failed to create skill run");
      }

      return toSkillRun(row);
    },

    async updateSkillRun(input) {
      await db
        .prepare(
          `UPDATE skill_runs
          SET status = ?, output_text = ?, error = ?, updated_at = ?
          WHERE id = ?`
        )
        .bind(
          input.status,
          input.outputText ?? null,
          input.error ?? null,
          input.updatedAt,
          input.id
        )
        .run();
    },

    async listSkillRuns(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skill_runs
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<SkillRunRow>();

      return (results ?? []).map(toSkillRun);
    },

    async getSkillRunForRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM skill_runs
          WHERE owner_tg_user_id = ? AND run_id = ?
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(input.ownerTgUserId, input.runId)
        .first<SkillRunRow>();

      return row ? toSkillRun(row) : null;
    },

  };
}
