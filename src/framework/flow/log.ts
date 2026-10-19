/**
 * Structured diagnostics for battle sessions: every entry carries the battle id and a running number, so a failed
 * test or a differential mismatch can be traced from the session through request, choice, ledger and result.
 * Entries are redacted when they are written (home-directory paths, over-long strings) and kept in a bounded ring:
 * nothing is written to disk by default and no raw requests or logs are stored.
 */
export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  n: number;
  battleId: string;
  level: LogLevel;
  kind: string;
  data: Record<string, unknown>;
}

export type LogSink = (entry: Omit<LogEntry, "n">) => void;

const HOME_PATH = /(?:\/Users\/[^/\s"']+|\/home\/[^/\s"']+|[A-Za-z]:\\Users\\[^\\\s"']+)/g;

/** Make a value safe to keep: no personal paths, bounded size, plain JSON only. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    const s = value.replace(HOME_PATH, "~");
    return s.length > 200 ? `${s.slice(0, 200)}…(+${s.length - 200})` : s;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1)).concat(value.length > 20 ? [`…(+${value.length - 20})`] : []);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 30).map(([k, v]) => [k, redact(v, depth + 1)]));
  return undefined;
}

export interface RingLogger {
  sink: LogSink;
  entries(): LogEntry[];
  tail(count: number): LogEntry[];
  clear(): void;
}

export function createRingLogger(capacity = 500): RingLogger {
  let n = 0;
  let ring: LogEntry[] = [];
  return {
    sink(entry) {
      ring.push({ n: n++, battleId: entry.battleId, level: entry.level, kind: entry.kind, data: redact(entry.data) as Record<string, unknown> });
      if (ring.length > capacity) ring = ring.slice(ring.length - capacity);
    },
    entries: () => ring.slice(),
    tail: (count) => ring.slice(-count),
    clear() { ring = []; },
  };
}
