/**
 * Real-host test evidence (5.2 D-02). A scenario id is a label, never a path: screenshot files get a sanitized,
 * collision-free name inside the evidence directory, and a capture that throws, fails to write or never calls back
 * resolves with an error instead of leaving the run waiting.
 */
export interface CapturePorts {
  capture(done: (buffer: unknown) => void): void;
  write(file: string, buffer: unknown): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}
export type CaptureResult = { ok: true } | { ok: false; error: string };
interface PathLike { resolve(...parts: string[]): string; sep: string }

const message = (error: unknown) => String((error as { message?: unknown })?.message ?? error);

/** Letters, digits, dot, dash and underscore only; case-insensitive uniqueness because macOS volumes usually are. */
export function screenshotFileName(label: string, taken: Set<string>): string {
  const base = String(label).normalize('NFKC').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 96) || 'shot';
  let name = `${base}.png`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}~${n}.png`;
  taken.add(name.toLowerCase());
  return name;
}

/** The absolute file for `name`, refusing anything that would leave `dir`. */
export function fileInside(dir: string, name: string, path: PathLike): string {
  const root = path.resolve(dir), file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) throw new Error(`screenshot path escapes the evidence directory: ${name}`);
  return file;
}

export function captureScreenshot(p: CapturePorts, file: string, timeoutMs = 10000): Promise<CaptureResult> {
  return new Promise((resolve) => {
    let settled = false, timer: unknown;
    const finish = (result: CaptureResult) => {
      if (settled) return;
      settled = true; resolve(result);
      try { p.clearTimer(timer); } catch { /* a stray timer only calls finish again, which is ignored */ }
    };
    timer = p.setTimer(() => finish({ ok: false, error: `screenshot callback did not return within ${timeoutMs} ms` }), timeoutMs);
    try {
      p.capture((buffer) => {
        if (settled) return; // a callback after the timeout writes nothing
        try { p.write(file, buffer); finish({ ok: true }); }
        catch (error) { finish({ ok: false, error: `screenshot write failed: ${message(error)}` }); }
      });
    } catch (error) { finish({ ok: false, error: `screenshot capture failed: ${message(error)}` }); }
  });
}
