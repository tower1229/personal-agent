# AI Agent Development Guidelines (AGENTS.md)

This file contains development conventions and rules for AI agents working on this project. Agents MUST review these rules before making code modifications to avoid recurring issues.

## 0. Product Implementation Principle

When designing or implementing product capabilities, do not weaken the target solution, split the work into a reduced "first version", or trade away correctness and user goals for implementation cost unless the user explicitly asks for phased delivery or cost reduction.

Default to a complete solution that satisfies the user's stated goal. If scope, cost, or risk is high, explain the trade-off and recommend an implementation order, but do not silently redefine the requirement into a smaller version.

## 1. Zod Schema Definitions for OpenAI Tools
When creating or modifying Zod schemas (`inputSchema`) for OpenAI tools, adhere to the following rules regarding number validation:

### 🚫 Anti-Pattern: `.positive()` and `.negative()`
Do **NOT** use `z.number().positive()` or `z.number().negative()`. 

**Reason:** The `zod-to-json-schema` library translates these methods into `{"exclusiveMinimum": true}` or `{"exclusiveMaximum": true}`. In the JSON schema standard expected by the OpenAI API, `exclusiveMinimum` and `exclusiveMaximum` must be numeric values, not booleans. Passing a boolean will cause the OpenAI API to reject the schema and throw a `BadRequestError` (e.g., `400 Invalid schema for function: true is not of type "number"`).

### ✅ Best Practice: Explicit `.min()` and `.max()`
Always use `.min()` and `.max()` with explicit numeric values.
- To require a positive integer (>= 1): `z.number().int().min(1)`
- To require a non-negative integer (>= 0): `z.number().int().min(0)`
- To require a negative integer (<= -1): `z.number().int().max(-1)`

**Example:**
```typescript
// BAD: Will crash OpenAI tool parsing
const inputSchema = z.object({
  id: z.number().int().positive().describe("The item id.")
});

// GOOD: Works perfectly with OpenAI API
const inputSchema = z.object({
  id: z.number().int().min(1).describe("The item id.")
});
```
