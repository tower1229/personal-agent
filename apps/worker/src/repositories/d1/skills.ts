import {
  toSkill,
  toSkillRouteDecision,
  toSkillIntent,
  toSkillRun,
  toSkillVersion,
  type SkillRouteDecisionRow,
  type SkillIntentRow,
  type SkillRow,
  type SkillRunRow,
  type SkillVersionRow
} from "./mappers.js";
import { type AgentRepositories, type RunnableSkillRecord } from "../../repositories.js";
import {
  markSkillPackageNameConflict,
  parseSkillPackageFiles,
  type ParsedSkillPackage
} from "../../skillPackages.js";

async function activeNameConflict(input: {
  db: D1Database;
  ownerTgUserId: number;
  name: string;
  excludeSkillId?: string;
}): Promise<boolean> {
  const row = await input.db
    .prepare(
      `SELECT s.id FROM skills s
      LEFT JOIN skill_versions v ON v.id = s.published_version_id
      WHERE s.owner_tg_user_id = ?
        AND s.deleted_at IS NULL
        AND (? IS NULL OR s.id != ?)
        AND (s.name = ? OR v.name = ?)
      LIMIT 1`
    )
    .bind(
      input.ownerTgUserId,
      input.excludeSkillId ?? null,
      input.excludeSkillId ?? null,
      input.name,
      input.name
    )
    .first<{ id: string }>();

  return Boolean(row);
}

async function parseAndValidateSkillDraft(input: {
  db: D1Database;
  ownerTgUserId: number;
  files: Record<string, string>;
  excludeSkillId?: string;
}): Promise<ParsedSkillPackage> {
  const parsed = parseSkillPackageFiles(input.files);
  if (
    await activeNameConflict({
      db: input.db,
      ownerTgUserId: input.ownerTgUserId,
      name: parsed.metadata.name,
      excludeSkillId: input.excludeSkillId
    })
  ) {
    return markSkillPackageNameConflict(parsed);
  }

  return parsed;
}

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
  | "getRunnableSkillByName"
  | "listRunnableSkills"
  | "createSkillRouteDecision"
  | "listSkillRouteDecisions"
  | "getSkillRouteDecisionForRun"
  | "createSkillIntent"
  | "createSkillIntentsBatch"
  | "deleteSkillIntent"
  | "listSkillIntents"
  | "createSkillRun"
  | "updateSkillRun"
  | "listSkillRuns"
  | "getSkillRunForRun"
> {
  return {
    async createSkill(input) {
      const parsed = await parseAndValidateSkillDraft({
        db,
        ownerTgUserId: input.ownerTgUserId,
        files: input.files
      });
      const row = await db
        .prepare(
          `INSERT INTO skills (
            id, owner_tg_user_id, name, description, draft_files_json,
            draft_metadata_json, draft_body, draft_file_inventory_json,
            draft_validation_json, draft_content_hash, enabled, deleted_at,
            published_version_id, published_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
          RETURNING *`
        )
        .bind(
          crypto.randomUUID(),
          input.ownerTgUserId,
          parsed.metadata.name,
          parsed.metadata.description,
          JSON.stringify(parsed.files),
          JSON.stringify(parsed.metadata),
          parsed.body,
          JSON.stringify(parsed.fileInventory),
          JSON.stringify(parsed.validation),
          parsed.contentHash,
          input.enabled ? 1 : 0,
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
      const parsed = await parseAndValidateSkillDraft({
        db,
        ownerTgUserId: input.ownerTgUserId,
        files: input.files,
        excludeSkillId: input.id
      });
      const row = await db
        .prepare(
          `UPDATE skills
          SET name = ?, description = ?, draft_files_json = ?,
            draft_metadata_json = ?, draft_body = ?,
            draft_file_inventory_json = ?, draft_validation_json = ?,
            draft_content_hash = ?, enabled = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(
          parsed.metadata.name,
          parsed.metadata.description,
          JSON.stringify(parsed.files),
          JSON.stringify(parsed.metadata),
          parsed.body,
          JSON.stringify(parsed.fileInventory),
          JSON.stringify(parsed.validation),
          parsed.contentHash,
          input.enabled ? 1 : 0,
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

      if (!skill || skill.deletedAt !== null || !skill.draftValidation.ok) {
        return null;
      }

      const nextVersion = (skill.publishedVersion ?? 0) + 1;
      const versionRow = await db
        .prepare(
          `INSERT INTO skill_versions (
            id, skill_id, owner_tg_user_id, version, name, description,
            files_json, metadata_json, body, file_inventory_json,
            validation_json, content_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.versionId,
          skill.id,
          input.ownerTgUserId,
          nextVersion,
          skill.name,
          skill.description,
          JSON.stringify(skill.draftFiles),
          JSON.stringify(skill.draftMetadata),
          skill.draftBody,
          JSON.stringify(skill.draftFileInventory),
          JSON.stringify(skill.draftValidation),
          skill.draftContentHash,
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

    async getRunnableSkillByName(input) {
      const row = await db
        .prepare(
          `SELECT
            s.id AS skill_id,
            s.owner_tg_user_id AS skill_owner_tg_user_id,
            s.name AS skill_name,
            s.description AS skill_description,
            s.draft_files_json,
            s.draft_metadata_json,
            s.draft_body,
            s.draft_file_inventory_json,
            s.draft_validation_json,
            s.draft_content_hash,
            s.enabled,
            s.deleted_at,
            s.published_version_id,
            s.published_version,
            s.created_at AS skill_created_at,
            s.updated_at,
            v.id AS version_id,
            v.version,
            v.name AS version_name,
            v.description AS version_description,
            v.files_json,
            v.metadata_json,
            v.body,
            v.file_inventory_json,
            v.validation_json,
            v.content_hash,
            v.created_at AS version_created_at
          FROM skills s
          JOIN skill_versions v ON v.id = s.published_version_id
          WHERE s.owner_tg_user_id = ?
            AND v.name = ?
            AND s.enabled = 1
            AND s.deleted_at IS NULL`
        )
        .bind(input.ownerTgUserId, input.name)
        .first<{
          skill_id: string;
          skill_owner_tg_user_id: number;
          skill_name: string;
          skill_description: string;
          draft_files_json: string;
          draft_metadata_json: string;
          draft_body: string;
          draft_file_inventory_json: string;
          draft_validation_json: string;
          draft_content_hash: string;
          enabled: number;
          deleted_at: number | null;
          published_version_id: string | null;
          published_version: number | null;
          skill_created_at: number;
          updated_at: number;
          version_id: string;
          version: number;
          version_name: string;
          version_description: string;
          files_json: string;
          metadata_json: string;
          body: string;
          file_inventory_json: string;
          validation_json: string;
          content_hash: string;
          version_created_at: number;
        }>();

      if (!row) {
        return null;
      }

      return {
        skill: toSkill({
          id: row.skill_id,
          owner_tg_user_id: row.skill_owner_tg_user_id,
          name: row.skill_name,
          description: row.skill_description,
          draft_files_json: row.draft_files_json,
          draft_metadata_json: row.draft_metadata_json,
          draft_body: row.draft_body,
          draft_file_inventory_json: row.draft_file_inventory_json,
          draft_validation_json: row.draft_validation_json,
          draft_content_hash: row.draft_content_hash,
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
          name: row.version_name,
          description: row.version_description,
          files_json: row.files_json,
          metadata_json: row.metadata_json,
          body: row.body,
          file_inventory_json: row.file_inventory_json,
          validation_json: row.validation_json,
          content_hash: row.content_hash,
          created_at: row.version_created_at
        })
      };
    },

    async listRunnableSkills(ownerTgUserId) {
      const { results } = await db
        .prepare(
          `SELECT
            s.id AS skill_id,
            s.owner_tg_user_id AS skill_owner_tg_user_id,
            s.name AS skill_name,
            s.description AS skill_description,
            s.draft_files_json,
            s.draft_metadata_json,
            s.draft_body,
            s.draft_file_inventory_json,
            s.draft_validation_json,
            s.draft_content_hash,
            s.enabled,
            s.deleted_at,
            s.published_version_id,
            s.published_version,
            s.created_at AS skill_created_at,
            s.updated_at,
            v.id AS version_id,
            v.version,
            v.name AS version_name,
            v.description AS version_description,
            v.files_json,
            v.metadata_json,
            v.body,
            v.file_inventory_json,
            v.validation_json,
            v.content_hash,
            v.created_at AS version_created_at
          FROM skills s
          JOIN skill_versions v ON v.id = s.published_version_id
          WHERE s.owner_tg_user_id = ?
            AND s.enabled = 1
            AND s.deleted_at IS NULL
          ORDER BY s.updated_at DESC
          LIMIT 100`
        )
        .bind(ownerTgUserId)
        .all<{
          skill_id: string;
          skill_owner_tg_user_id: number;
          skill_name: string;
          skill_description: string;
          draft_files_json: string;
          draft_metadata_json: string;
          draft_body: string;
          draft_file_inventory_json: string;
          draft_validation_json: string;
          draft_content_hash: string;
          enabled: number;
          deleted_at: number | null;
          published_version_id: string | null;
          published_version: number | null;
          skill_created_at: number;
          updated_at: number;
          version_id: string;
          version: number;
          version_name: string;
          version_description: string;
          files_json: string;
          metadata_json: string;
          body: string;
          file_inventory_json: string;
          validation_json: string;
          content_hash: string;
          version_created_at: number;
        }>();

      return (results ?? []).map((row): RunnableSkillRecord => ({
        skill: toSkill({
          id: row.skill_id,
          owner_tg_user_id: row.skill_owner_tg_user_id,
          name: row.skill_name,
          description: row.skill_description,
          draft_files_json: row.draft_files_json,
          draft_metadata_json: row.draft_metadata_json,
          draft_body: row.draft_body,
          draft_file_inventory_json: row.draft_file_inventory_json,
          draft_validation_json: row.draft_validation_json,
          draft_content_hash: row.draft_content_hash,
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
          name: row.version_name,
          description: row.version_description,
          files_json: row.files_json,
          metadata_json: row.metadata_json,
          body: row.body,
          file_inventory_json: row.file_inventory_json,
          validation_json: row.validation_json,
          content_hash: row.content_hash,
          created_at: row.version_created_at
        })
      }));
    },

    async createSkillRouteDecision(input) {
      const row = await db
        .prepare(
          `INSERT INTO skill_route_decisions (
            id, run_id, owner_tg_user_id, input_text, trigger_type,
            matched_skill_id, matched_skill_name, matched_skill_version_id,
            confidence, reason, candidates_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.inputText,
          input.triggerType,
          input.matchedSkillId,
          input.matchedSkillName,
          input.matchedSkillVersionId,
          input.confidence,
          input.reason,
          input.candidatesJson,
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

    async createSkillIntent(input) {
      const row = await db
        .prepare(
          `INSERT INTO skill_intents (
            id, owner_tg_user_id, skill_id, skill_name, intent_text, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.ownerTgUserId,
          input.skillId,
          input.skillName,
          input.intentText,
          input.status,
          input.createdAt,
          input.updatedAt
        )
        .first<SkillIntentRow>();

      if (!row) {
        throw new Error("Failed to create skill intent");
      }

      return toSkillIntent(row);
    },

    async createSkillIntentsBatch(inputs) {
      if (inputs.length === 0) return;
      const stmt = db.prepare(
        `INSERT INTO skill_intents (
            id, owner_tg_user_id, skill_id, skill_name, intent_text, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const batch = inputs.map((input) =>
        stmt.bind(
          input.id,
          input.ownerTgUserId,
          input.skillId,
          input.skillName,
          input.intentText,
          input.status,
          input.createdAt,
          input.updatedAt
        )
      );
      await db.batch(batch);
    },

    async deleteSkillIntent(input) {
      await db
        .prepare(
          `DELETE FROM skill_intents
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .run();
    },

    async listSkillIntents(ownerTgUserId) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skill_intents
          WHERE owner_tg_user_id = ?
          ORDER BY updated_at DESC`
        )
        .bind(ownerTgUserId)
        .all<SkillIntentRow>();

      return (results ?? []).map(toSkillIntent);
    }
  };
}
