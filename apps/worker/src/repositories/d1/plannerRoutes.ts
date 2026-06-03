import { type AgentRepositories } from "../../repositories.js";
import {
  toPendingPlannerRouteClarification,
  toPlannerRouteDecision,
  type PendingPlannerRouteClarificationRow,
  type PlannerRouteDecisionRow
} from "./mappers.js";

export function createD1PlannerRouteRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createPlannerRouteDecision"
  | "getPlannerRouteDecisionForRun"
  | "createPendingPlannerRouteClarification"
  | "getPendingPlannerRouteClarification"
  | "deletePendingPlannerRouteClarification"
> {
  return {
    async createPlannerRouteDecision(input) {
      const row = await db
        .prepare(
          `INSERT INTO planner_route_decisions (
            id, run_id, owner_tg_user_id, policy_version, input_text_redacted,
            input_hash, mode, confidence, reason, candidate_tools_json,
            tool_action_risk, freshness_risk, privacy_risk, confirmation_required,
            search_policy_json, fetch_policy_json, signals_json, classifier_used,
            question, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.policyVersion,
          input.inputTextRedacted,
          input.inputHash,
          input.mode,
          input.confidence,
          input.reason,
          JSON.stringify(input.candidateTools),
          input.toolActionRisk,
          input.freshnessRisk,
          input.privacyRisk,
          input.confirmationRequired ? 1 : 0,
          JSON.stringify(input.searchPolicy),
          JSON.stringify(input.fetchPolicy),
          JSON.stringify(input.signals),
          input.classifierUsed ? 1 : 0,
          input.question,
          input.createdAt
        )
        .first<PlannerRouteDecisionRow>();

      if (!row) {
        throw new Error("Failed to create planner route decision");
      }

      return toPlannerRouteDecision(row);
    },

    async getPlannerRouteDecisionForRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM planner_route_decisions
          WHERE owner_tg_user_id = ? AND run_id = ?
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(input.ownerTgUserId, input.runId)
        .first<PlannerRouteDecisionRow>();

      return row ? toPlannerRouteDecision(row) : null;
    },

    async createPendingPlannerRouteClarification(input) {
      const row = await db
        .prepare(
          `INSERT INTO pending_planner_route_clarifications (
            id, run_id, owner_tg_user_id, question, options_json, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.question,
          JSON.stringify(input.options),
          input.expiresAt,
          input.createdAt
        )
        .first<PendingPlannerRouteClarificationRow>();

      if (!row) {
        throw new Error("Failed to create pending planner route clarification");
      }

      return toPendingPlannerRouteClarification(row);
    },

    async getPendingPlannerRouteClarification(ownerTgUserId, now) {
      const row = await db
        .prepare(
          `SELECT * FROM pending_planner_route_clarifications
          WHERE owner_tg_user_id = ? AND expires_at > ?
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(ownerTgUserId, now)
        .first<PendingPlannerRouteClarificationRow>();

      return row ? toPendingPlannerRouteClarification(row) : null;
    },

    async deletePendingPlannerRouteClarification(id) {
      await db
        .prepare("DELETE FROM pending_planner_route_clarifications WHERE id = ?")
        .bind(id)
        .run();
    }
  };
}
