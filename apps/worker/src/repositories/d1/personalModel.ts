import {
  toPersonalModelClaim,
  toPersonalModelEvidence,
  toPersonalModelEvent,
  toPersonalModelSourceChunk,
  toPersonalModelSourceDocument,
  type PersonalModelClaimRow,
  type PersonalModelEvidenceRow,
  type PersonalModelSourceChunkRow,
  type PersonalModelSourceDocumentRow,
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
  | "createPersonalModelSourceDocument"
  | "updatePersonalModelSourceDocument"
  | "getPersonalModelSourceDocument"
  | "listPersonalModelSourceDocuments"
  | "createPersonalModelSourceChunk"
  | "getPersonalModelSourceChunk"
  | "listPersonalModelSourceChunks"
  | "searchPersonalModelSourceChunks"
  | "createPersonalModelEvidence"
  | "listPersonalModelEvidence"
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
    },

    async createPersonalModelSourceDocument(input) {
      const row = await db
        .prepare(
          `INSERT INTO source_documents (
            id, owner_tg_user_id, source_type, title, uri, content,
            normalized_content, status, usage_policy, sensitivity,
            source_created_at, source_updated_at, ingested_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.ownerTgUserId,
          input.sourceType,
          input.title,
          input.uri,
          input.content,
          input.normalizedContent,
          input.status,
          input.usagePolicy,
          input.sensitivity,
          input.sourceCreatedAt,
          input.sourceUpdatedAt,
          input.ingestedAt,
          input.metadataJson
        )
        .first<PersonalModelSourceDocumentRow>();

      if (!row) {
        throw new Error("Failed to create source document");
      }

      return toPersonalModelSourceDocument(row);
    },

    async updatePersonalModelSourceDocument(input) {
      const current = await db
        .prepare(
          `SELECT * FROM source_documents
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<PersonalModelSourceDocumentRow>();

      if (!current) {
        return null;
      }

      const patch = input.patch;
      const row = await db
        .prepare(
          `UPDATE source_documents
          SET source_type = ?, title = ?, uri = ?, status = ?,
            usage_policy = ?, sensitivity = ?, source_created_at = ?,
            source_updated_at = ?, metadata_json = ?
          WHERE owner_tg_user_id = ? AND id = ?
          RETURNING *`
        )
        .bind(
          patch.sourceType ?? current.source_type,
          patch.title ?? current.title,
          patch.uri !== undefined ? patch.uri : current.uri,
          patch.status ?? current.status,
          patch.usagePolicy ?? current.usage_policy,
          patch.sensitivity ?? current.sensitivity,
          patch.sourceCreatedAt !== undefined
            ? patch.sourceCreatedAt
            : current.source_created_at,
          patch.sourceUpdatedAt !== undefined
            ? patch.sourceUpdatedAt
            : current.source_updated_at,
          patch.metadataJson ?? current.metadata_json,
          input.ownerTgUserId,
          input.id
        )
        .first<PersonalModelSourceDocumentRow>();

      return row ? toPersonalModelSourceDocument(row) : null;
    },

    async getPersonalModelSourceDocument(input) {
      const row = await db
        .prepare(
          `SELECT * FROM source_documents
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<PersonalModelSourceDocumentRow>();

      return row ? toPersonalModelSourceDocument(row) : null;
    },

    async listPersonalModelSourceDocuments(input) {
      const sourceType = input.sourceType ?? null;
      const status = input.status ?? null;
      const { results } = await db
        .prepare(
          `SELECT * FROM source_documents
          WHERE owner_tg_user_id = ?
            AND (? IS NULL OR source_type = ?)
            AND (? IS NULL OR status = ?)
          ORDER BY ingested_at DESC
          LIMIT ?`
        )
        .bind(
          input.ownerTgUserId,
          sourceType,
          sourceType,
          status,
          status,
          input.limit
        )
        .all<PersonalModelSourceDocumentRow>();

      return (results ?? []).map(toPersonalModelSourceDocument);
    },

    async createPersonalModelSourceChunk(input) {
      const row = await db
        .prepare(
          `INSERT INTO source_chunks (
            id, document_id, owner_tg_user_id, chunk_index, content,
            normalized_content, token_count, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.documentId,
          input.ownerTgUserId,
          input.chunkIndex,
          input.content,
          input.normalizedContent,
          input.tokenCount,
          input.metadataJson,
          input.createdAt
        )
        .first<PersonalModelSourceChunkRow>();

      if (!row) {
        throw new Error("Failed to create source chunk");
      }

      return toPersonalModelSourceChunk(row);
    },

    async listPersonalModelSourceChunks(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM source_chunks
          WHERE owner_tg_user_id = ? AND document_id = ?
          ORDER BY chunk_index ASC
          LIMIT ?`
        )
        .bind(input.ownerTgUserId, input.documentId, input.limit)
        .all<PersonalModelSourceChunkRow>();

      return (results ?? []).map(toPersonalModelSourceChunk);
    },

    async searchPersonalModelSourceChunks(input) {
      const { results } = await db
        .prepare(
          "SELECT sc.* FROM source_chunks sc " +
          "JOIN source_documents sd ON sd.id = sc.document_id " +
          "WHERE sc.owner_tg_user_id = ? " +
          "  AND sd.usage_policy != 'do_not_use' " +
          "  AND sd.status = 'active' " +
          "  AND sc.normalized_content LIKE ? " +
          "ORDER BY sc.created_at DESC " +
          "LIMIT ?"
        )
        .bind(input.ownerTgUserId, "%" + input.keyword + "%", input.limit)
        .all<PersonalModelSourceChunkRow>();

      return (results ?? []).map(toPersonalModelSourceChunk);
    },

    async getPersonalModelSourceChunk(input) {
      const row = await db
        .prepare(
          `SELECT * FROM source_chunks
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<PersonalModelSourceChunkRow>();

      return row ? toPersonalModelSourceChunk(row) : null;
    },

    async createPersonalModelEvidence(input) {
      const row = await db
        .prepare(
          `INSERT INTO personal_model_evidence (
            id, claim_id, owner_tg_user_id, evidence_type,
            source_document_id, source_chunk_id, run_id, quote, weight,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.claimId,
          input.ownerTgUserId,
          input.evidenceType,
          input.sourceDocumentId,
          input.sourceChunkId,
          input.runId,
          input.quote,
          input.weight,
          input.createdAt
        )
        .first<PersonalModelEvidenceRow>();

      if (!row) {
        throw new Error("Failed to create personal model evidence");
      }

      return toPersonalModelEvidence(row);
    },

    async listPersonalModelEvidence(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM personal_model_evidence
          WHERE owner_tg_user_id = ? AND claim_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(input.ownerTgUserId, input.claimId, input.limit)
        .all<PersonalModelEvidenceRow>();

      return (results ?? []).map(toPersonalModelEvidence);
    }
  };
}
