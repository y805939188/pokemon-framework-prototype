/** Messages that leave a battle session (protocol v1). Plain JSON values only; no engine objects. */
export interface BattleEvent {
  type: string;
  args: string[];
  raw: string;
}

export interface EventsMessage { kind: "events"; seq: number; events: BattleEvent[] }
export interface RequestMessage { kind: "request"; seq: number; side: string; request: Record<string, any> }
export interface GrowthMessage { kind: "growth"; member: string; foe: string; exp: number; level: number; levelUps: number[]; hp: number }
export interface LearnPromptMessage { kind: "learn-prompt"; member: string; move: { id: string; name: string; pp: number }; slots: unknown[] }
export interface LearnedMessage { kind: "learned"; member: string; move: string; replaced: number | null }
export interface ErrorMessage { kind: "error"; seq: number; side: string; choice?: string; message: string; payload?: unknown }
export interface EndMessage { kind: "end"; reason: string; outcome: Record<string, unknown> | null; winner: string | null }

export type SessionMessage =
  | EventsMessage | RequestMessage | GrowthMessage | LearnPromptMessage | LearnedMessage | ErrorMessage | EndMessage;
