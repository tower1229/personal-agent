import { type Hono } from "hono";
import {
  adminPersonalModelClaimCreateRequestSchema,
  adminPersonalModelClaimDetailResponseSchema,
  adminPersonalModelClaimEventsResponseSchema,
  adminPersonalModelClaimsResponseSchema,
  adminPersonalModelClaimUpdateRequestSchema,
  personalModelScenarioSchema,
  personalModelStatusSchema
} from "@personal-agent/shared";
import { type WorkerEnv } from "../types.js";
import { defaultGenerateId, limitParam } from "./helpers.js";
import {
  toAdminPersonalModelClaim,
  toAdminPersonalModelEvent
} from "./serializers.js";
import { type WorkerRouteContext } from "./routeContext.js";

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

    return c.json(
      adminPersonalModelClaimDetailResponseSchema.parse({
        claim: toAdminPersonalModelClaim(claim),
        events: events.map(toAdminPersonalModelEvent)
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

    await repo.createPersonalModelEvent({
      id: (options.generateId ?? defaultGenerateId)(),
      claimId: claim.id,
      ownerTgUserId: authenticatedOwnerId,
      eventType: "updated",
      payloadJson: JSON.stringify({ source: "admin", patch: body.data }),
      createdAt: now
    });

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
}
