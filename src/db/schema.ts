import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runStatuses = ["succeeded", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  chatId: text("chat_id").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  status: text("status", { enum: runStatuses }).notNull(),
  latencyMs: integer("latency_ms").notNull(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
