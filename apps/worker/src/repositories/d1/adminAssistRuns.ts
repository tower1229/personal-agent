import { type AgentRepositories, type AdminAssistRunRecord } from "../../repositories.js";

export function createD1AdminAssistRunRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  "createAdminAssistRun" | "updateAdminAssistRun" | "getAdminAssistRun"
> {
  return {
    async createAdminAssistRun(input) {
      const row = await db
        .prepare(
          `INSERT INTO admin_assist_runs (
            id, capability, target_type, target_id, status, model,
            draft_json, warnings_json, prompt_version, context_summary,
            owner_tg_user_id, created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.capability,
          input.targetType,
          input.targetId,
          input.status,
          input.model,
          input.draftJson,
          input.warningsJson,
          input.promptVersion,
          input.contextSummary,
          input.ownerTgUserId,
          input.createdAt,
          input.completedAt
        )
        .first<any>();

      if (!row) {
        throw new Error("Failed to create admin assist run");
      }

      return toAdminAssistRun(row);
    },

    async updateAdminAssistRun(input) {
      await db
        .prepare(
          `UPDATE admin_assist_runs
          SET status = ?, draft_json = COALESCE(?, draft_json),
              warnings_json = COALESCE(?, warnings_json),
              completed_at = COALESCE(?, completed_at)
          WHERE id = ? AND owner_tg_user_id = ?`
        )
        .bind(
          input.status,
          input.draftJson ?? null,
          input.warningsJson ?? null,
          input.completedAt ?? null,
          input.id,
          input.ownerTgUserId
        )
        .run();
    },

    async getAdminAssistRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM admin_assist_runs
          WHERE id = ? AND owner_tg_user_id = ?`
        )
        .bind(input.id, input.ownerTgUserId)
        .first<any>();

      return row ? toAdminAssistRun(row) : null;
    }
  };
}

function toAdminAssistRun(row: any): AdminAssistRunRecord {
  return {
    id: row.id,
    capability: row.capability,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    model: row.model,
    draftJson: row.draft_json,
    warningsJson: row.warnings_json,
    promptVersion: row.prompt_version,
    contextSummary: row.context_summary,
    ownerTgUserId: row.owner_tg_user_id,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}
