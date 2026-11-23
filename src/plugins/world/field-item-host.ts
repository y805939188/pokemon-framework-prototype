import type { FieldItemExecutionPort, FieldItemHandoff, FieldItemRunOutcome } from '../../framework/app';
import type { WorldBattleAdmission } from '../../framework/app/ports';
import type { FieldItemApplication } from './world-host';
import { errorText } from './world-host';

interface QueuedFieldItem { application: FieldItemApplication; handoff: Readonly<FieldItemHandoff>; done(outcome: FieldItemRunOutcome): void; started: boolean }
export function createFieldItemHost(current: () => FieldItemApplication | null, openBattle?: (app: FieldItemApplication, admission: WorldBattleAdmission) => void) {
  let queued: QueuedFieldItem | null = null;
  const finish = (item: QueuedFieldItem, outcome: FieldItemRunOutcome): void => {
    if (queued !== item) return; queued = null;
    let result = outcome;
    if (outcome.status === 'battle-admitted') {
      try {
        if (current() !== item.application || item.application.stateGeneration !== item.handoff.generation || !openBattle) throw Error('field-battle-presentation-unavailable');
        openBattle(item.application, outcome.admission);
      } catch (error) { item.application.abortAdmittedWorldBattle?.(outcome.admission, errorText(error)); result = { status: 'failed', reason: errorText(error), fishing: outcome.fishing }; }
    }
    try { item.done(result); } catch (error) { console.error('PS_World field completion:', error); }
  };
  const cancel = (token: string): void => {
    const item = queued; if (!item || item.handoff.token !== token) return;
    const outcome = item.application.cancelFieldItemHandoff(token);
    if (outcome.status !== 'refused') finish(item, { status: 'cancelled' });
    else if (current() !== item.application || item.application.stateGeneration !== item.handoff.generation) finish(item, { status: 'refused', reason: outcome.reason });
    // A current owner's refusal is authoritative. Keep its queue until its actual result settles.
  };
  return {
    pending: (): boolean => queued !== null,
    queue(application: FieldItemApplication, handoff: Readonly<FieldItemHandoff>, done: (outcome: FieldItemRunOutcome) => void): void {
      if (queued) throw new Error('field-presentation-active');
      if (current() !== application || application.stateGeneration !== handoff.generation) throw new Error('stale-operation');
      queued = { application, handoff, done, started: false };
    },
    cancel,
    update(mapReady: boolean, abandoned = false): void {
      const item = queued;
      if (!item) return;
      if (abandoned || current() !== item.application || item.application.stateGeneration !== item.handoff.generation) { cancel(item.handoff.token); return; }
      if (!mapReady || item.started) return;
      item.started = true;
      Promise.resolve().then(() => {
        if (queued !== item || current() !== item.application || item.application.stateGeneration !== item.handoff.generation) return { status: 'cancelled' } as const;
        return item.application.runFieldItemHandoff(item.handoff.token);
      }).then(outcome => finish(item, outcome), error => { item.application.cancelFieldItemHandoff(item.handoff.token); finish(item, { status: 'failed', reason: errorText(error) }); });
    },
    /** B has no fishing/field ability implementation yet. Application owns all consumption. */
    execution: { async execute(request) { request.assertCurrent(); return { status: 'refused', reason: 'field-handler-unavailable' }; } } satisfies FieldItemExecutionPort,
  };
}
