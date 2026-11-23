import type { WorldNoticeFlushOutcome, WorldNoticeReceipt } from '../../framework/app';
import type { WorldApplication } from './world-host';
import { projectNativeWeather } from './world-weather-mz';
import { errorText } from './world-host';

/** Receipts are already committed by App. Only the current timeline publishes their final native projection. */
export function createWorldNoticeHost(current: () => WorldApplication | null, change: (type: string, power: number, duration: number) => void, diagnose: (reason: string) => void) {
  let owner: WorldApplication | null = null, generation = -1, sequence = 0, commandRevision = 0, flushing = false, problem: string | null = null;
  const sync = (application: WorldApplication | null): void => {
    if (owner !== application || generation !== application?.stateGeneration) {
      owner = application; generation = application?.stateGeneration ?? -1; sequence = 0; commandRevision = 0; problem = null;
    }
  };
  return {
    commandObserved(application: WorldApplication): void { if (current() !== application) return; sync(application); commandRevision++; },
    flush(): WorldNoticeFlushOutcome | null {
      if (flushing) return null;
      const application = current(); sync(application); if (!application) return null;
      const epoch = application.stateGeneration, displayedCommand = commandRevision; flushing = true;
      try {
        const result = application.flushWorldNotices();
        if (current() !== application || application.stateGeneration !== epoch) { sync(current()); return null; }
        if (result.status !== 'drained') {
          if (result.status === 'refused') { const reason = result.reason ?? 'world-notice-flush-refused'; if (problem !== reason) { problem = reason; diagnose(reason); } }
          return result; // App keeps the full receipt outbox until the complete ordered queue drains.
        }
        problem = null;
        let projection: Readonly<WorldNoticeReceipt> | null = null;
        for (const receipt of result.receipts) {
          if (receipt.sequence <= sequence) continue;
          sequence = receipt.sequence;
          for (const reason of receipt.diagnostics ?? []) diagnose(reason);
          if (receipt.kind === 'weather-command') projection = null; // Native 236 already owns this fade, power and duration.
          else if (receipt.weatherChanged || projection) projection = receipt;
        }
        if (projection && commandRevision === displayedCommand && current() === application && application.stateGeneration === epoch) projectNativeWeather(projection.weather, change, diagnose);
        return result;
      } catch (error) { diagnose(errorText(error)); return null; }
      finally { flushing = false; }
    },
  };
}
