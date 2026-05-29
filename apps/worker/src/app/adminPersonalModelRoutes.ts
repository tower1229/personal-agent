import { type Hono } from "hono";
import {
  adminPersonalModelClaimCreateRequestSchema,
  adminPersonalModelClaimDetailResponseSchema,
  adminPersonalModelClaimEventsResponseSchema,
  adminPersonalModelClaimsResponseSchema,
  adminPersonalModelClaimUpdateRequestSchema,
  adminPersonalModelEvidenceCreateRequestSchema,
  adminPersonalModelEvidenceResponseSchema,
  adminPersonalModelSourceCreateRequestSchema,
  adminPersonalModelSourceDetailResponseSchema,
  personalModelWritingMetadataSchema,
  personalModelSocialMetadataSchema,
  personalModelFrameworkMetadataSchema,
  adminPersonalModelSourcesResponseSchema,
  adminPersonalModelSourceUpdateRequestSchema,
  adminPersonalModelMetacognitionLogsResponseSchema,
  adminPersonalModelUnderstandingGapsResponseSchema,
  adminPersonalModelUnderstandingGapCreateRequestSchema,
  adminPersonalModelUnderstandingGapUpdateRequestSchema,
  personalModelScenarioSchema,
  personalModelSourceStatusSchema,
  personalModelSourceTypeSchema,
  personalModelStatusSchema
} from "@personal-agent/shared";
import {
  chunkSourceContent,
  normalizeSourceContent,
  tokenCountForChunk
} from "../personalModelSources.js";
import { type WorkerEnv } from "../types.js";
import { defaultGenerateId, limitParam } from "./helpers.js";
import {
  toAdminPersonalModelClaim,
  toAdminPersonalModelEvidence,
  toAdminPersonalModelEvent,
  toAdminPersonalModelSourceChunk,
  toAdminPersonalModelSourceDocument,
  toAdminPersonalModelMetacognitionLog,
  toAdminPersonalModelUnderstandingGap
} from "./serializers.js";
import { type WorkerRouteContext } from "./routeContext.js";
import { retrieveHybridChunks } from "../personalModelRetrieval.js";

export function registerAdminPersonalModelRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const { adminOwnerId, options, repositories } = context;

  app.get("/api/admin/personal-model/claims", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const status = personalModelStatusSchema
      .nullable()
      .catch(null)
      .parse(c.req.query("status") ?? null);
    const scenario = personalModelScenarioSchema
      .nullable()
      .catch(null)
      .parse(c.req.query("scenario") ?? null);
    const items = await repositories(c.env).listPersonalModelClaims({
      ownerTgUserId: authenticatedOwnerId,
      limit: limitParam(c.req.query("limit")),
      status: status ?? undefined,
      scenario: scenario ?? undefined
    });

    return c.json(
      adminPersonalModelClaimsResponseSchema.parse({
        items: items.map(toAdminPersonalModelClaim)
      })
    );
  });

  app.post("/api/admin/personal-model/claims", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminPersonalModelClaimCreateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid personal model claim" }, 400);
    }

    const now = (options.now ?? Date.now)();
    const repo = repositories(c.env);
    const claim = await repo.createPersonalModelClaim({
      id: (options.generateId ?? defaultGenerateId)(),
      ownerTgUserId: authenticatedOwnerId,
      claim: body.data.claim,
      layer: body.data.layer,
      scenario: body.data.scenario,
      confidence: body.data.confidence,
      status: body.data.status,
      usagePolicy: body.data.usagePolicy,
      sensitivity: body.data.sensitivity,
      validFrom: body.data.validFrom ?? null,
      validUntil: body.data.validUntil ?? null,
      lastConfirmedAt: body.data.lastConfirmedAt ?? null,
      metadataJson: JSON.stringify(body.data.metadata),
      createdAt: now,
      updatedAt: now
    });
    await repo.createPersonalModelEvent({
      id: (options.generateId ?? defaultGenerateId)(),
      claimId: claim.id,
      ownerTgUserId: authenticatedOwnerId,
      eventType: "created",
      payloadJson: JSON.stringify({ source: "admin" }),
      createdAt: now
    });

    return c.json(toAdminPersonalModelClaim(claim), 201);
  });

  app.get("/api/admin/personal-model/claims/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const repo = repositories(c.env);
    const claim = await repo.getPersonalModelClaim({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!claim) {
      return c.json({ error: "Personal model claim not found" }, 404);
    }

    const events = await repo.listPersonalModelEvents({
      ownerTgUserId: authenticatedOwnerId,
      claimId: claim.id,
      limit: 50
    });
    const evidence = await repo.listPersonalModelEvidence({
      ownerTgUserId: authenticatedOwnerId,
      claimId: claim.id,
      limit: 50
    });

    return c.json(
      adminPersonalModelClaimDetailResponseSchema.parse({
        claim: toAdminPersonalModelClaim(claim),
        events: events.map(toAdminPersonalModelEvent),
        evidence: evidence.map(toAdminPersonalModelEvidence)
      })
    );
  });

  app.patch("/api/admin/personal-model/claims/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminPersonalModelClaimUpdateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid personal model claim patch" }, 400);
    }

    const now = (options.now ?? Date.now)();
    const repo = repositories(c.env);
    const originalClaim = await repo.getPersonalModelClaim({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!originalClaim) {
      return c.json({ error: "Personal model claim not found" }, 404);
    }

    const claim = await repo.updatePersonalModelClaim({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      patch: {
        ...body.data,
        metadataJson:
          body.data.metadata !== undefined
            ? JSON.stringify(body.data.metadata)
            : undefined
      },
      updatedAt: now
    });
    if (!claim) {
      return c.json({ error: "Personal model claim not found" }, 404);
    }

    let customEventLogged = false;
    if (originalClaim.status === "proposed") {
      if (body.data.status === "active") {
        await repo.createPersonalModelEvent({
          id: (options.generateId ?? defaultGenerateId)(),
          claimId: claim.id,
          ownerTgUserId: authenticatedOwnerId,
          eventType: "confirmed",
          payloadJson: JSON.stringify({ source: "admin", action: "approved" }),
          createdAt: now
        });
        await repo.createPersonalModelMetacognitionLog({
          id: (options.generateId ?? defaultGenerateId)(),
          ownerTgUserId: authenticatedOwnerId,
          reflectionType: "observation",
          content: "管理员确认了该提议：将状态设为 active。",
          relatedClaimId: claim.id,
          relatedGapId: null,
          createdAt: now
        });
        customEventLogged = true;
      } else if (body.data.status === "deprecated" || body.data.status === "deleted") {
        await repo.createPersonalModelEvent({
          id: (options.generateId ?? defaultGenerateId)(),
          claimId: claim.id,
          ownerTgUserId: authenticatedOwnerId,
          eventType: "deprecated",
          payloadJson: JSON.stringify({ source: "admin", action: "rejected", status: body.data.status }),
          createdAt: now
        });
        await repo.createPersonalModelMetacognitionLog({
          id: (options.generateId ?? defaultGenerateId)(),
          ownerTgUserId: authenticatedOwnerId,
          reflectionType: "correction",
          content: `管理员拒绝了该提议：将状态设为 ${body.data.status}。`,
          relatedClaimId: claim.id,
          relatedGapId: null,
          createdAt: now
        });
        customEventLogged = true;
      }
    }

    if (!customEventLogged) {
      await repo.createPersonalModelEvent({
        id: (options.generateId ?? defaultGenerateId)(),
        claimId: claim.id,
        ownerTgUserId: authenticatedOwnerId,
        eventType: "updated",
        payloadJson: JSON.stringify({ source: "admin", patch: body.data }),
        createdAt: now
      });

      if (body.data.status === "deprecated" || body.data.status === "archived") {
        await repo.createPersonalModelMetacognitionLog({
          id: (options.generateId ?? defaultGenerateId)(),
          ownerTgUserId: authenticatedOwnerId,
          reflectionType: "conflict_resolution",
          content: `Admin marked claim as ${body.data.status}.`,
          relatedClaimId: claim.id,
          relatedGapId: null,
          createdAt: now
        });
      } else if (body.data.confidence === "low" || body.data.confidence === "medium") {
        await repo.createPersonalModelMetacognitionLog({
          id: (options.generateId ?? defaultGenerateId)(),
          ownerTgUserId: authenticatedOwnerId,
          reflectionType: "correction",
          content: `Admin adjusted confidence to ${body.data.confidence}.`,
          relatedClaimId: claim.id,
          relatedGapId: null,
          createdAt: now
        });
      }
    }

    return c.json(toAdminPersonalModelClaim(claim));
  });

  app.get("/api/admin/personal-model/claims/:id/events", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listPersonalModelEvents({
      ownerTgUserId: authenticatedOwnerId,
      claimId: c.req.param("id"),
      limit: limitParam(c.req.query("limit"))
    });

    return c.json(
      adminPersonalModelClaimEventsResponseSchema.parse({
        items: items.map(toAdminPersonalModelEvent)
      })
    );
  });

  app.get("/api/admin/personal-model/sources", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sourceType = personalModelSourceTypeSchema
      .nullable()
      .catch(null)
      .parse(c.req.query("sourceType") ?? null);
    const status = personalModelSourceStatusSchema
      .nullable()
      .catch(null)
      .parse(c.req.query("status") ?? null);
    const items = await repositories(c.env).listPersonalModelSourceDocuments({
      ownerTgUserId: authenticatedOwnerId,
      limit: limitParam(c.req.query("limit")),
      sourceType: sourceType ?? undefined,
      status: status ?? undefined
    });

    return c.json(
      adminPersonalModelSourcesResponseSchema.parse({
        items: items.map(toAdminPersonalModelSourceDocument)
      })
    );
  });

  app.post("/api/admin/personal-model/sources", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminPersonalModelSourceCreateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid personal model source" }, 400);
    }

    let metadata = body.data.metadata;
    if (metadata) {
      try {
        if (body.data.sourceType === "writing" || body.data.sourceType === "blog") {
          metadata = personalModelWritingMetadataSchema.parse(metadata);
        } else if (body.data.sourceType === "qq_export" || body.data.sourceType === "weibo_export") {
          metadata = personalModelSocialMetadataSchema.parse(metadata);
        } else if (body.data.sourceType === "personality_framework") {
          metadata = personalModelFrameworkMetadataSchema.parse(metadata);
        }
      } catch (err) {
        return c.json({ error: "Invalid metadata format for the given source type" }, 400);
      }
    }

    const now = (options.now ?? Date.now)();
    const generateId = options.generateId ?? defaultGenerateId;
    const repo = repositories(c.env);
    const source = await repo.createPersonalModelSourceDocument({
      id: generateId(),
      ownerTgUserId: authenticatedOwnerId,
      sourceType: body.data.sourceType,
      title: body.data.title,
      uri: body.data.uri ?? null,
      content: body.data.content,
      normalizedContent: normalizeSourceContent(body.data.content),
      status: "active",
      usagePolicy: body.data.usagePolicy,
      sensitivity: body.data.sensitivity,
      sourceCreatedAt: body.data.sourceCreatedAt ?? null,
      sourceUpdatedAt: body.data.sourceUpdatedAt ?? null,
      ingestedAt: now,
      metadataJson: JSON.stringify(metadata ?? {})
    });
    const chunkDrafts = chunkSourceContent({
      content: body.data.content,
      sourceType: body.data.sourceType
    });
    const chunks = [];
    for (const [index, chunk] of chunkDrafts.entries()) {
      chunks.push(
        await repo.createPersonalModelSourceChunk({
          id: generateId(),
          documentId: source.id,
          ownerTgUserId: authenticatedOwnerId,
          chunkIndex: index,
          content: chunk.content,
          normalizedContent: normalizeSourceContent(chunk.content),
          tokenCount: tokenCountForChunk(chunk.content),
          metadataJson: JSON.stringify(chunk.metadata),
          createdAt: now,
          vectorId: null,
          indexedAt: null,
          indexStatus: "pending"
        })
      );
    }

    return c.json(
      adminPersonalModelSourceDetailResponseSchema.parse({
        source: toAdminPersonalModelSourceDocument(source),
        chunks: chunks.map(toAdminPersonalModelSourceChunk)
      }),
      201
    );
  });

  app.get("/api/admin/personal-model/sources/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const repo = repositories(c.env);
    const source = await repo.getPersonalModelSourceDocument({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!source) {
      return c.json({ error: "Personal model source not found" }, 404);
    }

    const chunks = await repo.listPersonalModelSourceChunks({
      ownerTgUserId: authenticatedOwnerId,
      documentId: source.id,
      limit: 100
    });

    return c.json(
      adminPersonalModelSourceDetailResponseSchema.parse({
        source: toAdminPersonalModelSourceDocument(source),
        chunks: chunks.map(toAdminPersonalModelSourceChunk)
      })
    );
  });

  app.patch("/api/admin/personal-model/sources/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminPersonalModelSourceUpdateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid personal model source patch" }, 400);
    }

    const source = await repositories(c.env).updatePersonalModelSourceDocument({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      patch: {
        ...body.data,
        metadataJson:
          body.data.metadata !== undefined
            ? JSON.stringify(body.data.metadata)
            : undefined
      }
    });
    if (!source) {
      return c.json({ error: "Personal model source not found" }, 404);
    }

    return c.json(toAdminPersonalModelSourceDocument(source));
  });

  app.delete("/api/admin/personal-model/sources/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await repositories(c.env).deletePersonalModelSourceDocument({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });

    return c.json({ ok: true });
  });

  app.get("/api/admin/personal-model/claims/:id/evidence", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listPersonalModelEvidence({
      ownerTgUserId: authenticatedOwnerId,
      claimId: c.req.param("id"),
      limit: limitParam(c.req.query("limit"))
    });

    return c.json(
      adminPersonalModelEvidenceResponseSchema.parse({
        items: items.map(toAdminPersonalModelEvidence)
      })
    );
  });

  app.post("/api/admin/personal-model/claims/:id/evidence", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminPersonalModelEvidenceCreateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid personal model evidence" }, 400);
    }

    const repo = repositories(c.env);
    const claim = await repo.getPersonalModelClaim({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!claim) {
      return c.json({ error: "Personal model claim not found" }, 404);
    }

    const validationError = await validateEvidenceReference({
      repo,
      ownerTgUserId: authenticatedOwnerId,
      evidenceType: body.data.evidenceType,
      sourceDocumentId: body.data.sourceDocumentId ?? null,
      sourceChunkId: body.data.sourceChunkId ?? null,
      runId: body.data.runId ?? null,
      quote: body.data.quote ?? null
    });
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    const now = (options.now ?? Date.now)();
    const evidence = await repo.createPersonalModelEvidence({
      id: (options.generateId ?? defaultGenerateId)(),
      claimId: claim.id,
      ownerTgUserId: authenticatedOwnerId,
      evidenceType: body.data.evidenceType,
      sourceDocumentId: body.data.sourceDocumentId ?? null,
      sourceChunkId: body.data.sourceChunkId ?? null,
      runId: body.data.runId ?? null,
      quote: body.data.quote ?? null,
      weight: body.data.weight,
      createdAt: now
    });
    await repo.createPersonalModelEvent({
      id: (options.generateId ?? defaultGenerateId)(),
      claimId: claim.id,
      ownerTgUserId: authenticatedOwnerId,
      eventType: "updated",
      payloadJson: JSON.stringify({
        source: "admin",
        evidenceId: evidence.id
      }),
      createdAt: now
    });

    return c.json(toAdminPersonalModelEvidence(evidence), 201);
  });

  app.get("/api/admin/personal-model/metacognition-logs", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.text("Unauthorized", 401);
    }

    const limit = limitParam(c.req.query("limit"));
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const repo = repositories(c.env);
    const logs = await repo.listPersonalModelMetacognitionLogs({
      ownerTgUserId: authenticatedOwnerId,
      limit,
      offset
    });

    return c.json({
      items: logs.map(toAdminPersonalModelMetacognitionLog)
    });
  });

  app.get("/api/admin/personal-model/understanding-gaps", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.text("Unauthorized", 401);
    }

    const limit = limitParam(c.req.query("limit"));
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const statusQuery = c.req.query("status");
    let status: "open" | "resolved" | "ignored" | undefined;
    if (statusQuery === "open" || statusQuery === "resolved" || statusQuery === "ignored") {
      status = statusQuery as any;
    }

    const repo = repositories(c.env);
    const gaps = await repo.listPersonalModelUnderstandingGaps({
      ownerTgUserId: authenticatedOwnerId,
      limit,
      offset,
      status
    });

    return c.json({
      items: gaps.map(toAdminPersonalModelUnderstandingGap)
    });
  });

  app.post("/api/admin/personal-model/understanding-gaps", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.text("Unauthorized", 401);
    }

    const body = await c.req.json();
    const result = adminPersonalModelUnderstandingGapCreateRequestSchema.safeParse(body);
    if (!result.success) {
      return c.text("Bad Request: " + result.error.message, 400);
    }

    const now = Date.now();
    const gap = {
      id: (options.generateId ?? defaultGenerateId)(),
      ownerTgUserId: authenticatedOwnerId,
      scenario: result.data.scenario,
      gapDescription: result.data.gapDescription,
      status: "open" as const,
      createdAt: now,
      updatedAt: now
    };

    const repo = repositories(c.env);
    await repo.createPersonalModelUnderstandingGap(gap);

    return c.json(toAdminPersonalModelUnderstandingGap(gap), 201);
  });

  app.patch("/api/admin/personal-model/understanding-gaps/:id/status", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.text("Unauthorized", 401);
    }

    const id = c.req.param("id");
    const body = await c.req.json();
    const result = adminPersonalModelUnderstandingGapUpdateRequestSchema.safeParse(body);
    if (!result.success) {
      return c.text("Bad Request: " + result.error.message, 400);
    }

    const repo = repositories(c.env);
    await repo.updatePersonalModelUnderstandingGapStatus({
      ownerTgUserId: authenticatedOwnerId,
      gapId: id,
      status: result.data.status,
      updatedAt: Date.now()
    });

    return c.json({ success: true }, 200);
  });

  app.get("/api/admin/personal-model/test-retrieval", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.text("Unauthorized", 401);
    }

    const query = c.req.query("query") || "";
    const repo = repositories(c.env);

    const searchResult = await retrieveHybridChunks({
      repositories: repo,
      ownerTgUserId: authenticatedOwnerId,
      query: query.trim(),
      limit: 5,
      env: c.env
    });

    const items = await Promise.all(
      searchResult.chunks.map(async (chunk) => {
        const doc = await repo.getPersonalModelSourceDocument({
          ownerTgUserId: authenticatedOwnerId,
          id: chunk.documentId
        });
        return {
          ...toAdminPersonalModelSourceChunk(chunk),
          documentTitle: doc?.title || "Unknown Document",
          sourceType: doc?.sourceType || "unknown"
        };
      })
    );

    return c.json({
      chunks: items,
      trace: searchResult.trace
    });
  });
}

async function validateEvidenceReference(input: {
  repo: ReturnType<WorkerRouteContext["repositories"]>;
  ownerTgUserId: number;
  evidenceType: string;
  sourceDocumentId: string | null;
  sourceChunkId: string | null;
  runId: string | null;
  quote: string | null;
}) {
  if (input.evidenceType === "source_chunk") {
    if (!input.sourceDocumentId || !input.sourceChunkId) {
      return "source_chunk evidence requires sourceDocumentId and sourceChunkId";
    }
    if (input.runId) {
      return "source_chunk evidence cannot include runId";
    }

    const source = await input.repo.getPersonalModelSourceDocument({
      ownerTgUserId: input.ownerTgUserId,
      id: input.sourceDocumentId
    });
    if (!source) {
      return "Source document not found";
    }
    const chunk = await input.repo.getPersonalModelSourceChunk({
      ownerTgUserId: input.ownerTgUserId,
      id: input.sourceChunkId
    });
    if (!chunk || chunk.documentId !== source.id) {
      return "Source chunk not found for source document";
    }
    return null;
  }

  if (input.evidenceType === "conversation_run") {
    if (!input.runId) {
      return "conversation_run evidence requires runId";
    }
    if (input.sourceDocumentId || input.sourceChunkId) {
      return "conversation_run evidence cannot include source ids";
    }
    const run = await input.repo.getRun({
      ownerTgUserId: input.ownerTgUserId,
      id: input.runId
    });
    if (!run) {
      return "Run not found";
    }
    return null;
  }

  if (input.evidenceType === "manual_confirmation") {
    if (!input.quote?.trim()) {
      return "manual_confirmation evidence requires quote";
    }
    if (input.sourceDocumentId || input.sourceChunkId || input.runId) {
      return "manual_confirmation evidence cannot include source ids or runId";
    }
    return null;
  }

  if (input.evidenceType === "admin_edit") {
    if (input.sourceDocumentId || input.sourceChunkId || input.runId) {
      return "admin_edit evidence cannot include source ids or runId";
    }
    return null;
  }

  if (input.evidenceType === "framework_consistency") {
    if (!input.sourceDocumentId && !input.quote?.trim()) {
      return "framework_consistency evidence requires sourceDocumentId or quote";
    }
    if (input.sourceChunkId && !input.sourceDocumentId) {
      return "framework_consistency evidence with sourceChunkId requires sourceDocumentId";
    }
    if (input.sourceDocumentId) {
      const source = await input.repo.getPersonalModelSourceDocument({
        ownerTgUserId: input.ownerTgUserId,
        id: input.sourceDocumentId
      });
      if (!source) {
        return "Source document not found";
      }
      if (input.sourceChunkId) {
        const chunk = await input.repo.getPersonalModelSourceChunk({
          ownerTgUserId: input.ownerTgUserId,
          id: input.sourceChunkId
        });
        if (!chunk || chunk.documentId !== source.id) {
          return "Source chunk not found for source document";
        }
      }
    }
    return null;
  }

  if (input.evidenceType === "behavioral_observation") {
    if (!input.quote?.trim() && !input.runId && !input.sourceChunkId) {
      return "behavioral_observation evidence requires quote, runId, or sourceChunkId";
    }
    if (input.runId) {
      const run = await input.repo.getRun({
        ownerTgUserId: input.ownerTgUserId,
        id: input.runId
      });
      if (!run) {
        return "Run not found";
      }
    }
    if (input.sourceChunkId) {
      if (!input.sourceDocumentId) {
        return "behavioral_observation evidence with sourceChunkId requires sourceDocumentId";
      }
      const source = await input.repo.getPersonalModelSourceDocument({
        ownerTgUserId: input.ownerTgUserId,
        id: input.sourceDocumentId
      });
      const chunk = await input.repo.getPersonalModelSourceChunk({
        ownerTgUserId: input.ownerTgUserId,
        id: input.sourceChunkId
      });
      if (!source || !chunk || chunk.documentId !== source.id) {
        return "Source chunk not found for source document";
      }
    }
  }

  return null;
}
