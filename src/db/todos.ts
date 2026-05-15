import { and, asc, eq } from "drizzle-orm";
import { db } from "./client.js";
import { todos, type Todo } from "./schema.js";

export async function createTodo(input: {
  userId: string;
  title: string;
  dueAt: Date | null;
}): Promise<Todo> {
  const created = await db
    .insert(todos)
    .values({
      userId: input.userId,
      title: input.title,
      status: "open",
      dueAt: input.dueAt,
      createdAt: new Date(),
      completedAt: null
    })
    .returning();

  const todo = created[0];

  if (!todo) {
    throw new Error("Failed to create todo");
  }

  return todo;
}

export async function listOpenTodos(userId: string): Promise<Todo[]> {
  return db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.status, "open")))
    .orderBy(asc(todos.id));
}

export async function completeTodo(input: {
  userId: string;
  id: number;
}): Promise<Todo> {
  const existing = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, input.userId),
        eq(todos.id, input.id),
        eq(todos.status, "open")
      )
    )
    .limit(1);

  const todo = existing[0];

  if (!todo) {
    throw new Error(`Open todo ${input.id} was not found`);
  }

  const updated = await db
    .update(todos)
    .set({
      status: "completed",
      completedAt: new Date()
    })
    .where(and(eq(todos.userId, input.userId), eq(todos.id, input.id)))
    .returning();

  const completed = updated[0];

  if (!completed) {
    throw new Error(`Failed to complete todo ${input.id}`);
  }

  return completed;
}
