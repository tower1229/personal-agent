import {
  toPersonalModelClaim,
  toPersonalModelEvent,
  type PersonalModelClaimRow,
  type PersonalModelEventRow
} from "./mappers.js";
import { type AgentRepositories } from "../../repositories.js";

export function createD1PersonalModelRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createPersonalModelClaim"
  | "updatePersonalModelClaim"
  | "getPersonalModelClaim"
  | "listPersonalModelClaims"
  | "listActivePersonalModelClaims"
  | "createPersonalModelEvent"
  | "listPersonalModelEvents"
> {
  return {
    async createPersonalModelClaim(input) {
      const row = await db
        .prepare(
          `INSERT INTO personal_model_claims (
            id, owner_tg_user_id, claim, layer, scenario, confidence, status,
            usage_policy, sensitivity, valid_from, valid_until,
            last_confirmed_at, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.ownerTgUserId,
          input.claim,
          input.layer,
          input.scenario,
          input.confidence,
          input.status,
          input.usagePolicy,
          input.sensitivity,
          input.validFrom,
          input.validUntil,
          input.lastConfirmedAt,
          input.metadataJson,
          input.createdAt,
          input.updatedAt
        )
        .first<PersonalModelClaimRow>();

      if (!row) {
        throw new Error("Failed to create personal model claim");
      }

      return toPersonalModelClaim(row);
    },

    async updatePersonalModelClaim(input) {
      const current = await db
        .prepare(
          `SELECT * FROM personal_model_claims
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<PersonalModelClaimRow>();

      if (!current) {
        return null;
      }

      const patch = input.patch;
      const row = await db
        .prepare(
          `UPDATE personal_model_claims
          SET claim = ?, layer = ?, scenario = ?, confidence = ?, status = ?,
            usage_policy = ?, sensitivity = ?, valid_from = ?,
            valid_until = ?, last_confirmed_at = ?, metadata_json = ?,
            updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ?
          RETURNING *`
        )
        .bind(
          patch.claim ?? current.claim,
          patch.layer ?? current.layer,
          patch.scenario ?? current.scenario,
          patch.confidence ?? current.confidence,
          patch.status ?? current.status,
          patch.usagePolicy ?? current.usage_policy,
          patch.sensitivity ?? current.sensitivity,
          patch.validFrom !== undefined ? patch.validFrom : current.valid_from,
          patch.validUntil !== undefined
            ? patch.validUntil
            : current.valid_until,
          patch.lastConfirmedAt !== undefined
            ? patch.lastConfirmedAt
            : current.last_confirmed_at,
          patch.metadataJson ?? current.metadata_json,
          input.updatedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<PersonalModelClaimRow>();

      return row ? toPersonalModelClaim(row) : null;
    },

    async getPersonalModelClaim(input) {
      const row = await db
        .prepare(
          `SELECT * FROM personal_model_claims
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<PersonalModelClaimRow>();

      return row ? toPersonalModelClaim(row) : null;
    },

    async listPersonalModelClaims(input) {
      const status = input.status ?? null;
      const scenario = input.scenario ?? null;
      const { results } = await db
        .prepare(
          `SELECT * FROM personal_model_claims
          WHERE owner_tg_user_id = ?
            AND (? IS NULL OR status = ?)
            AND (? IS NULL OR scenario = ?)
          ORDER BY updated_at DESC
          LIMIT ?`
        )
        .bind(
          input.ownerTgUserId,
          status,
          status,
          scenario,
          scenario,
          input.limit
        )
        .all<PersonalModelClaimRow>();

      return (results ?? []).map(toPersonalModelClaim);
    },

    async listActivePersonalModelClaims(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM personal_model_claims
          WHERE owner_tg_user_id = ?
            AND status = 'active'
            AND usage_policy != 'do_not_use'
            AND (valid_from IS NULL OR valid_from <= ?)
            AND (valid_until IS NULL OR valid_until > ?)
          ORDER BY
            CASE confidence
              WHEN 'high' THEN 0
              WHEN 'medium' THEN 1
              ELSE 2
            END,
            updated_at DESC
          LIMIT ?`
        )
        .bind(input.ownerTgUserId, input.now, input.now, input.limit)
        .all<PersonalModelClaimRow>();

      return (results ?? []).map(toPersonalModelClaim);
    },

    async createPersonalModelEvent(input) {
      const row = await db
        .prepare(
          `INSERT INTO personal_model_events (
            id, claim_id, owner_tg_user_id, event_type, payload_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.claimId,
          input.ownerTgUserId,
          input.eventType,
          input.payloadJson,
          input.createdAt
        )
        .first<PersonalModelEventRow>();

      if (!row) {
        throw new Error("Failed to create personal model event");
      }

      return toPersonalModelEvent(row);
    },

    async listPersonalModelEvents(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM personal_model_events
          WHERE owner_tg_user_id = ? AND claim_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(input.ownerTgUserId, input.claimId, input.limit)
        .all<PersonalModelEventRow>();

      return (results ?? []).map(toPersonalModelEvent);
    }
  };
}
