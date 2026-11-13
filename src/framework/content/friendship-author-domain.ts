/** Author-only gate. Compiled/runtime readers deliberately keep their historical safe-integer domain. */
import type { AuthorSchema, ContentError } from "./schema";

export function authorSchemaProblem(schema: unknown): string | null {
  return schema === 1 || schema === 2 ? null : "must be author schema 2 (standard) or 1 (explicit legacy compatibility)";
}

export function authorCompatibilityDiagnostics(schema: unknown): ContentError[] {
  return schema === 1 ? [{
    file: "manifest.json", path: "$.schema",
    message: "legacy-author-schema: schema 1 explicitly enables legacy happiness values above 255; values are preserved. Use schema 2 for standard 0..255 authoring. No data was migrated.",
  }] : [];
}

export function authorHappinessProblem(value: unknown, schema: AuthorSchema): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && (schema === 1 || value <= 255)
    ? null : schema === 2 ? "must be an integer from 0 to 255 (author schema 2)" : "must be a nonnegative safe integer (explicit legacy author schema 1)";
}
