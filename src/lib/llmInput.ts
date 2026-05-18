/**
 * Length caps for /api/llm/* request bodies.
 * Hardens against prompt-injection through long inputs (analyze.md §12.12).
 */

const MAX_NAME = 100;
const MAX_TEXT = 5_000;
const MAX_ARRAY_ITEMS = 50;
const MAX_ARRAY_ITEM_LEN = 200;

const NAME_FIELDS = new Set(["name"]);

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateBody(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") {
      const limit = NAME_FIELDS.has(key) ? MAX_NAME : MAX_TEXT;
      if (value.length > limit) {
        return { ok: false, error: `${key} exceeds ${limit} chars` };
      }
    } else if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_ITEMS) {
        return { ok: false, error: `${key} has more than ${MAX_ARRAY_ITEMS} items` };
      }
      for (const item of value) {
        if (typeof item === "string" && item.length > MAX_ARRAY_ITEM_LEN) {
          return { ok: false, error: `${key} item exceeds ${MAX_ARRAY_ITEM_LEN} chars` };
        }
      }
    }
  }
  return { ok: true };
}
