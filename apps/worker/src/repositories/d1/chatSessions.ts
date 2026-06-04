import { type AgentRepositories } from "../../repositories.js";
import { toChatSession, type ChatSessionRow } from "./mappers.js";

export function createD1ChatSessionRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createChatSession"
  | "getActiveChatSession"
  | "closeActiveChatSession"
  | "updateChatSession"
> {
  return {
    async createChatSession(input) {
      const row = await db
        .prepare(
          `INSERT INTO chat_sessions (
            id, owner_tg_user_id, status, theme_summary, summarized_up_to_run_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.ownerTgUserId,
          input.status,
          input.themeSummary,
          input.summarizedUpToRunId,
          input.createdAt,
          input.updatedAt
        )
        .first<ChatSessionRow>();

      if (!row) {
        throw new Error("Failed to create chat session");
      }

      return toChatSession(row);
    },

    async getActiveChatSession(ownerTgUserId) {
      const row = await db
        .prepare(
          `SELECT * FROM chat_sessions
          WHERE owner_tg_user_id = ? AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(ownerTgUserId)
        .first<ChatSessionRow>();

      return row ? toChatSession(row) : null;
    },

    async closeActiveChatSession(ownerTgUserId, updatedAt) {
      await db
        .prepare(
          `UPDATE chat_sessions
          SET status = 'closed', updated_at = ?
          WHERE owner_tg_user_id = ? AND status = 'active'`
        )
        .bind(updatedAt, ownerTgUserId)
        .run();
    },

    async updateChatSession(id, patch) {
      const updates: string[] = [];
      const bindings: any[] = [];
      
      if (patch.themeSummary !== undefined) {
        updates.push("theme_summary = ?");
        bindings.push(patch.themeSummary);
      }
      if (patch.summarizedUpToRunId !== undefined) {
        updates.push("summarized_up_to_run_id = ?");
        bindings.push(patch.summarizedUpToRunId);
      }
      
      updates.push("updated_at = ?");
      bindings.push(patch.updatedAt);
      
      bindings.push(id);

      await db
        .prepare(`UPDATE chat_sessions SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...bindings)
        .run();
    }
  };
}
