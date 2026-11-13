import { BasicPictureGroup } from './visual-timing';
import type { BattleSceneVisualStep } from './controller';
import { planFaintSchedule } from './faint-schedule';
import type { FaintMedia } from './faint-media';

export interface PictureActor { id: string; side: 'p1' | 'p2'; name: string; }
export interface PicturePose { body: number; shadow: number; drop?: number; }
export interface PicturePlaybackPorts<T> {
  current(): boolean;
  updateOrdinal(): number;
  create(actor: Readonly<PictureActor>): T;
  paint(handle: T, pose: Readonly<PicturePose>): void;
  release(handle: T): void;
  failed(error: unknown): void;
  prepareFaint?(actor: Readonly<PictureActor>): FaintMedia;
}
interface Entry<T> { actor: PictureActor; handle: T; released: boolean; pose: PicturePose; }
const key = (actor: PictureActor) => actor.side + ':' + actor.id;
const actorCopy = (actor: PictureActor): PictureActor => {
  if (!actor || typeof actor.id !== 'string' || !actor.id || !['p1', 'p2'].includes(actor.side) || typeof actor.name !== 'string') throw new Error('invalid picture actor');
  return { id: actor.id, side: actor.side, name: actor.name };
};

/** Owned display handles only. The caller supplies public actors and a Scene.update ordinal. */
export class BattlePicturePlayback<T> {
  private retired = false;
  private syncing = false;
  private sampling = false;
  private entries = new Map<string, Entry<T>>();
  private runs = new Set<() => void>();
  private faintMedia = new Set<FaintMedia>();
  private lastUpdate = -1;
  readonly cleanupErrors: string[] = [];
  constructor(private readonly ports: PicturePlaybackPorts<T>, private readonly effects = true,
    private readonly units = { sendOut: 10, recall: 5 }) {
    if (typeof effects !== 'boolean' || !Number.isFinite(units.sendOut) || !Number.isFinite(units.sendOut * 50) || units.sendOut < 0 || !Number.isFinite(units.recall) || !Number.isFinite(units.recall * 50) || units.recall < 0) throw new Error('invalid picture presentation preset');
    this.units = { ...units };
  }
  current(): boolean { return !this.retired && this.ports.current(); }
  /** Ball visuals may scale an already shown foe, never create a missing/replaced portrait. */
  captureScale(memberId: string, scale: number): boolean {
    if (!Number.isFinite(scale) || scale < 0 || scale > 1) throw new Error('invalid captured portrait scale');
    const entry = this.entries.get('p2:' + memberId);
    return !!entry && this.paint(entry, { ...entry.pose, body: scale, shadow: scale });
  }
  private release(entry: Entry<T>): void {
    if (entry.released) return;
    entry.released = true;
    if (this.entries.get(key(entry.actor)) === entry) this.entries.delete(key(entry.actor));
    try { this.ports.release(entry.handle); }
    catch (error) {
      this.cleanupErrors.push(String(error));
      if (this.current()) try { this.ports.failed(error); } catch (secondary) { this.cleanupErrors.push(String(secondary)); }
    }
  }
  private paint(entry: Entry<T>, pose: PicturePose, allowed: () => boolean = () => true): boolean {
    if (!this.current() || !allowed() || entry.released) return false;
    entry.pose = { ...pose };
    try { this.ports.paint(entry.handle, { ...pose }); }
    catch (error) { this.dispose(); throw error; }
    if (!this.current()) { this.dispose(); return false; }
    return allowed() && !entry.released;
  }
  private ensure(actor: PictureActor, allowed: () => boolean = () => true): Entry<T> | null {
    if (!this.current()) { this.dispose(); return null; }
    if (!allowed()) return null;
    const id = key(actor), previous = this.entries.get(id);
    if (previous) return previous;
    const entry = { actor: actorCopy(actor), handle: this.ports.create(actorCopy(actor)), released: false, pose: { body: 1, shadow: 1 } };
    if (!this.current() || !allowed()) { this.release(entry); if (!this.current()) this.dispose(); return null; }
    this.entries.set(id, entry);
    if (this.paint(entry, entry.pose, allowed)) return entry;
    this.release(entry); return null;
  }
  sync(input: readonly PictureActor[]): void {
    if (!this.current()) { this.dispose(); return; }
    if (this.syncing) return;
    const actors = input.map(actorCopy), wanted = new Set(actors.map(key));
    if (wanted.size !== actors.length) throw new Error('duplicate public picture actor');
    this.syncing = true;
    try {
      for (const [id, entry] of [...this.entries]) if (!wanted.has(id)) this.release(entry);
      for (const actor of actors) { if (!this.current()) { this.dispose(); return; } this.ensure(actor); }
    } finally { this.syncing = false; }
  }
  step(kind: 'send-out' | 'recall' | 'damage', input: PictureActor): BattleSceneVisualStep {
    const actor = actorCopy(input);
    if (!['send-out', 'recall', 'damage'].includes(kind)) throw new Error('unsupported basic picture transition');
    if (!this.current()) return { kind: 'visual', advance: () => true, cancel() {} };
    let group: BasicPictureGroup | null = null, entry: Entry<T> | null = null, origin: PicturePose | null = null;
    let cancelled = false, finished = false;
    const cancel = () => {
      if (cancelled || finished) return;
      cancelled = true; group?.cancel(); this.runs.delete(cancel);
      if (entry) this.release(entry);
    };
    this.runs.add(cancel);
    return { kind: 'visual', cancel, advance: now => {
      if (cancelled || finished) return true;
      if (!this.current()) { cancel(); this.dispose(); return true; }
      if (this.sampling) return false;
      if (!Number.isFinite(now) || now < 0) throw new Error('invalid picture clock');
      this.sampling = true;
      try {
        const update = this.ports.updateOrdinal();
        if (!this.current() || cancelled) { cancel(); return true; }
        if (!Number.isSafeInteger(update) || update < 0 || update < this.lastUpdate) throw new Error('invalid picture Scene.update ordinal');
        if (!entry) entry = this.ensure(actor, () => !cancelled);
        if (!entry || cancelled || !this.current()) { if (entry && cancelled) this.release(entry); cancel(); return true; }
        if (!group) {
          // Simple default feedback: four 75ms on/off cycles. HP timing is owned separately.
          const duration = kind === 'damage' ? 12 : kind === 'send-out' ? this.units.sendOut : this.units.recall;
          origin = { ...entry.pose };
          group = new BasicPictureGroup(['body', 'shadow'].map(id => ({ id, kind, startUnits: 0, durationUnits: duration })), this.effects);
        }
        if (!this.current() || cancelled) { cancel(); return true; }
        const frame = group.sample(now, update); this.lastUpdate = update;
        const value = (id: string) => {
          const progress = frame.frames.find(item => item.id === id)!.progress;
          if (kind === 'damage') return id === 'shadow' ? origin!.shadow : origin!.body * (progress >= 1 || Math.floor(progress * 8) % 2 === 0 ? 1 : 0);
          return kind === 'send-out' ? progress : 1 - progress;
        };
        // HP0 may legitimately remove a portrait during this parallel group, including a late endpoint.
        // Retain the group's completion observation without repainting/recreating the released image.
        if (cancelled || (!(kind === 'damage' && entry.released) && !this.paint(entry, { body: value('body'), shadow: value('shadow') }))) { cancel(); return true; }
        if (frame.complete) { finished = true; this.runs.delete(cancel); }
        return finished;
      } finally { this.sampling = false; }
    } };
  }
  /** Mandatory parallel faint tracks. The box callback belongs to the display
   * projection; it never hides a later actor's status or mutates the model. */
  faint(input: PictureActor, box: (opacity: number) => boolean): BattleSceneVisualStep {
    const actor = actorCopy(input);
    if (!this.current()) return { kind: 'visual', advance: () => true, cancel() {} };
    let entry: Entry<T> | null = null, media: FaintMedia | null = null, group: BasicPictureGroup | null = null;
    let cancelled = false, finished = false, effectSent = false, sampled = -1, lastNow = -1;
    const cancel = () => {
      if (cancelled || finished) return;
      cancelled = true; group?.cancel(); this.runs.delete(cancel);
      if (media) this.faintMedia.delete(media);
      try { media?.dispose(); } catch (error) { this.cleanupErrors.push(String(error)); }
      if (entry) this.release(entry);
    };
    this.runs.add(cancel);
    return { kind: 'visual', cancel, advance: now => {
      if (cancelled || finished) return true;
      if (!this.current()) { cancel(); this.dispose(); return true; }
      if (this.sampling) return false;
      if (!Number.isFinite(now) || now < 0) throw new Error('invalid faint clock');
      this.sampling = true;
      try {
        const update = this.ports.updateOrdinal();
        if (!this.current() || cancelled) { cancel(); return true; }
        if (!Number.isSafeInteger(update) || update < 0 || update < this.lastUpdate || update < sampled) throw new Error('invalid faint Scene.update ordinal');
        if (update === sampled) return false;
        if (now < lastNow) throw new Error('faint clock regressed');
        lastNow = now;
        sampled = update; this.lastUpdate = update;
        if (!entry) entry = this.ensure(actor, () => !cancelled);
        if (!entry || cancelled || !this.current()) { if (entry && cancelled) this.release(entry); cancel(); return true; }
        if (!group) {
          if (!media) {
            const created = this.ports.prepareFaint?.({ ...actor });
            if (created) {
              if (cancelled || !this.current()) { try { created.dispose(); } finally { cancel(); } return true; }
              media = created;
              this.faintMedia.add(created);
            }
          }
          const result = media ? media.poll(now) : planFaintSchedule({ battleEffects: this.effects, candidates: {
            dedicatedForm: { state: 'missing' }, dedicatedBase: { state: 'missing' }, ordinaryForm: { state: 'missing' }, ordinaryBase: { state: 'missing' },
          } });
          if (cancelled || !this.current()) { cancel(); return true; }
          if (result.state === 'pending') return false;
          if (result.state === 'failed') throw new Error('faint media preparation: ' + (result.detail || result.code));
          const d = result.plan.bodyDropStartUnits;
          group = new BasicPictureGroup([
            { id: 'body', kind: 'faint', startUnits: d, durationUnits: 10 },
            { id: 'shadow', kind: 'faint', startUnits: d, durationUnits: 0 },
            { id: 'box', kind: 'faint', startUnits: 0, durationUnits: 5 },
          ], this.effects);
          media?.playCry();
        }
        if (cancelled || !this.current()) { cancel(); return true; }
        const frame = group.sample(now, update), body = frame.frames.find(x => x.id === 'body')!, shadow = frame.frames.find(x => x.id === 'shadow')!, dataBox = frame.frames.find(x => x.id === 'box')!;
        if (body.started && !effectSent) { effectSent = true; media?.playEffect(); }
        if (cancelled || !this.current()) { cancel(); return true; }
        if (!this.paint(entry, { body: 1 - body.progress, shadow: shadow.started ? 0 : 1, drop: body.progress }, () => !cancelled)) { cancel(); return true; }
        if (!box(1 - dataBox.progress) || cancelled || !this.current()) { cancel(); return true; }
        if (frame.complete) {
          finished = true; this.runs.delete(cancel);
          // Independent SE tails do not lengthen the picture wait and are not
          // cut at the visual endpoint. Their owner is this battle Scene.
          this.release(entry);
        }
        return finished;
      } finally { this.sampling = false; }
    } };
  }
  snapshot(): object {
    return { version: 'd2-basic-picture-consumer-v2', preset: 'simple-default-pictures-v1', damagePreset: 'simple-damage-feedback-v1', effects: this.effects, retired: this.retired,
      faintPreset: 'simple-faint-feedback-v1', faintAudio: [...this.faintMedia].map(media => media.snapshot()), lastUpdate: this.lastUpdate, runningGroups: this.runs.size, actors: [...this.entries.values()].map(entry => ({ ...entry.actor, ...entry.pose })), cleanupErrors: [...this.cleanupErrors] };
  }
  dispose(): void {
    if (this.retired) return;
    this.retired = true;
    for (const cancel of [...this.runs]) cancel();
    for (const media of [...this.faintMedia]) {
      this.faintMedia.delete(media);
      try { media.dispose(); } catch (error) { this.cleanupErrors.push(String(error)); }
    }
    for (const entry of [...this.entries.values()]) this.release(entry);
  }
}
