import { HpPresentation, ExperiencePresentation, hpColour } from './visual-timing';
import type { BattleSceneVisualStep } from './controller';
import type { PictureActor } from './picture-playback';

export interface BattleDisplayCard {
  id: string; side: 'p1' | 'p2'; name: string; level: number; hp: number; maxhp: number;
  status: string; active: boolean; ratio: number | null; flash?: boolean;
  experienceUnavailable?: 'outside-level-interval';
  boxOpacity?: number;
  portraitVisible?: boolean;
}
export interface BattleDisplayPorts {
  current(): boolean;
  paint(cards: readonly BattleDisplayCard[]): void;
  afterPaintNow?(): number;
  cue(kind: 'exp-gain' | 'exp-full'): (() => void) | undefined;
  picture?(kind: 'send-out' | 'recall' | 'damage', actor: PictureActor): BattleSceneVisualStep;
  faint?(actor: PictureActor, box: (opacity: number) => boolean): BattleSceneVisualStep;
}
export interface DisplayEvent { type: string; args: readonly string[]; }
const key = (side: string, id: string) => side + ':' + id;
const copy = (cards: readonly BattleDisplayCard[]) => cards.map(card => ({ ...card }));

/** Only display projections are retained. Planning reads published events, never polls the live battle. */
export class BattleDisplayPlayback {
  private planned: BattleDisplayCard[];
  private shown: BattleDisplayCard[];
  private retired = false;
  private readonly stops: (() => void)[] = [];
  readonly cleanupErrors: string[] = [];
  constructor(cards: readonly BattleDisplayCard[], private readonly ports: BattleDisplayPorts) {
    const seen = new Set<string>();
    for (const card of cards) {
      const id = key(card.side, card.id);
      if (seen.has(id) || !card.id || !['p1', 'p2'].includes(card.side)) throw new Error('invalid display member identity');
      seen.add(id); hpColour(card.hp, card.maxhp);
      if (!Number.isSafeInteger(card.level) || card.level < 1 || card.ratio !== null && (!Number.isFinite(card.ratio) || card.ratio < 0 || card.ratio > 1)) throw new Error('invalid display level/experience');
    }
    this.planned = copy(cards); this.shown = copy(cards);
  }
  current(): boolean { return !this.retired && this.ports.current(); }
  snapshot(): BattleDisplayCard[] { return copy(this.shown); }
  /** Separate post-ME/growth captured-ball hide; never writes the battle model. */
  captureBox(memberId: string, opacity: number): boolean {
    if (!this.current()) return false;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('invalid captured data-box opacity');
    const cards = copy(this.shown), card = cards.find(member => member.side === 'p2' && member.id === memberId && member.active);
    if (!card) return false;
    const planned = this.planned.find(member => member.side === 'p2' && member.id === memberId);
    for (const value of [card, planned]) if (value) { value.boxOpacity = opacity; if (opacity === 0) value.portraitVisible = false; }
    return this.paint(cards);
  }
  private paint(cards: readonly BattleDisplayCard[]): boolean {
    if (!this.current()) return false;
    this.shown = copy(cards); this.ports.paint(copy(cards));
    return this.current();
  }
  private sound(kind: 'exp-gain' | 'exp-full', local: (() => void)[]): boolean {
    if (!this.current()) return false;
    const rawStop = this.ports.cue(kind);
    if (rawStop) {
      let stopped = false;
      const stop = () => { if (!stopped) { stopped = true; rawStop(); } };
      if (this.current()) { this.stops.push(stop); local.push(stop); } else stop();
    }
    return this.current();
  }
  private step(advance: (now: number) => boolean, cancel: () => void = () => {}): BattleSceneVisualStep {
    let cancelled = false, finished = false;
    return { kind: 'visual', advance: now => {
      if (cancelled || finished || !this.current()) return true;
      finished = advance(now); return finished;
    }, cancel: () => { if (!cancelled) { cancelled = true; cancel(); } } };
  }
  initial(): BattleSceneVisualStep { const cards = copy(this.planned); return this.step(() => this.paint(cards)); }
  private instant(): BattleSceneVisualStep { const cards = copy(this.planned); return this.step(() => this.paint(cards)); }
  private picture(kind: 'send-out' | 'recall' | 'damage', card: BattleDisplayCard, before?: BattleSceneVisualStep): BattleSceneVisualStep {
    const actor = { id: card.id, side: card.side, name: card.name };
    let run: BattleSceneVisualStep | null = null, applied = false;
    return this.step(now => {
      if (!applied) {
        if (before && !before.advance(now)) return false;
        applied = true;
      }
      if (!this.current()) return true;
      if (!run) run = this.ports.picture!(kind, { ...actor });
      if (!this.current()) { run.cancel(); return true; }
      return run.advance(now);
    }, () => { before?.cancel(); run?.cancel(); });
  }
  private changes(changes: { card: BattleDisplayCard; hp: number; maxhp: number; status: string }[]): BattleSceneVisualStep {
    const identities = changes.map(change => key(change.card.side, change.card.id));
    if (new Set(identities).size !== identities.length) throw new Error('duplicate published HP target');
    const tweens = changes.map(change => {
      // A published max-HP change is a new display scale; it is not reconstructed from an engine object.
      const from = Math.min(change.card.hp, change.maxhp);
      const tween = new HpPresentation({ memberId: key(change.card.side, change.card.id), from, to: change.hp, total: change.maxhp });
      Object.assign(change.card, { hp: change.hp, maxhp: change.maxhp, status: change.status });
      return { id: key(change.card.side, change.card.id), tween, card: change.card, damage: change.card.active && change.hp < from };
    });
    const pictures = this.ports.picture ? tweens.filter(item => item.damage).map(item => this.picture('damage', item.card)) : [];
    const target = copy(this.planned);
    return this.step(now => {
      const frames = tweens.map(item => ({ id: item.id, value: item.tween.sample(now) }));
      const cards = copy(target);
      for (const frame of frames) cards.find(card => key(card.side, card.id) === frame.id)!.hp = frame.value.value;
      if (!this.paint(cards)) return false;
      const completed: boolean[] = [];
      for (const picture of pictures) { if (!this.current()) return false; completed.push(picture.advance(now)); }
      return this.current() && frames.every(frame => frame.value.complete) && completed.every(Boolean);
    }, () => {
      for (const item of tweens) item.tween.cancel();
      for (const picture of pictures) try { picture.cancel(); } catch (error) { this.cleanupErrors.push(String(error)); }
    });
  }
  private faint(card: BattleDisplayCard): BattleSceneVisualStep {
    const target = copy(this.planned), shown = target.find(x => key(x.side, x.id) === key(card.side, card.id))!;
    card.boxOpacity = 0; card.portraitVisible = false;
    let run: BattleSceneVisualStep | null = null;
    return this.step(now => {
      if (!run) run = this.ports.faint!({ id: card.id, side: card.side, name: card.name }, opacity => {
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('invalid faint data-box opacity');
        shown.boxOpacity = opacity; return this.paint(target);
      });
      if (!this.current()) { run.cancel(); return true; }
      if (!run.advance(now)) return false;
      if (!this.current()) return true;
      shown.boxOpacity = 0; shown.portraitVisible = false;
      return this.paint(target);
    }, () => run?.cancel());
  }
  event(event: DisplayEvent): BattleSceneVisualStep[] {
    const actor = (ident: string | undefined): BattleDisplayCard | undefined => {
      const match = /^(p[12])[a-z]?: (.+)$/.exec(ident || '');
      return match ? this.planned.find(card => card.side === match[1] && card.id === match[2]) : undefined;
    };
    const condition = (text: string | undefined, card: BattleDisplayCard) => {
      if (text === '0 fnt' || text === '0') return { hp: 0, maxhp: card.maxhp, status: '' };
      const match = /^(\d+)\/(\d+)(?: ([a-z]+))?$/.exec(text || '');
      if (!match) throw new Error('unsupported published HP condition');
      const hp = Number(match[1]), maxhp = Number(match[2]); hpColour(hp, maxhp);
      return { hp, maxhp, status: match[3] || '' };
    };
    const card = actor(event.args[0]);
    if (!card) return [];
    if (event.type === '-damage' || event.type === '-heal' || event.type === '-sethp') {
      const changes = [{ card, ...condition(event.args[1], card) }];
      if (event.type === '-sethp' && event.args[2]) {
        const other = actor(event.args[2]); if (!other) throw new Error('unknown published HP actor');
        changes.push({ card: other, ...condition(event.args[3], other) });
      }
      return [this.changes(changes)];
    }
    if (event.type === 'switch' || event.type === 'drag') {
      const previous = this.planned.find(member => member.side === card.side && member.active);
      const old = previous && { ...previous };
      for (const member of this.planned) if (member.side === card.side) member.active = member === card;
      Object.assign(card, condition(event.args[2], card), { boxOpacity: 1, portraitVisible: true });
      const shown = this.instant();
      if (!this.ports.picture) return [shown];
      const steps = old && old.id !== card.id && old.hp > 0 ? [this.picture('recall', old)] : [];
      return [...steps, this.picture('send-out', card, shown)];
    }
    if (event.type === '-status' || event.type === '-curestatus' || event.type === 'faint') {
      card.status = event.type === '-status' ? event.args[1] || '' : '';
      if (event.type === 'faint') {
        card.hp = 0;
        if (this.ports.faint) return [this.faint(card)];
      }
      return [this.instant()];
    }
    return [];
  }
  experience(memberId: string, segment: { level: number; from: number; to: number }): BattleSceneVisualStep | null {
    const card = this.planned.find(member => member.side === 'p1' && member.id === memberId);
    if (!card) return null;
    const visible = card.active && card.ratio !== null;
    const tween = new ExperiencePresentation({ memberId, ...segment, visible });
    card.level = segment.level; card.ratio = segment.to;
    delete card.experienceUnavailable; // A validated published segment supersedes initial uncertainty.
    const target = copy(this.planned); let flashAt: number | null = null;
    const local: (() => void)[] = [];
    return this.step(now => {
      const frame = tween.sample(now);
      const firstFlash = frame.cues.includes('exp-full');
      if (firstFlash) flashAt = now;
      // The real renderer owes 200ms after its first actual flash paint, even when the pure clock caught up.
      const flash = flashAt !== null && now - flashAt < 200;
      const cards = copy(target), shown = cards.find(member => member.side === 'p1' && member.id === memberId)!;
      shown.ratio = frame.ratio; shown.flash = flash;
      if (!this.paint(cards)) return false;
      if (firstFlash && this.ports.afterPaintNow) {
        const painted = this.ports.afterPaintNow();
        if (!Number.isFinite(painted) || painted < now) throw new Error('invalid post-paint monotonic clock');
        flashAt = painted;
      }
      for (const cue of frame.cues) if (!this.sound(cue, local)) return false;
      return frame.complete && !flash;
    }, () => { tween.cancel(); for (const stop of local) stop(); });
  }
  growth(memberId: string, display: { toLevel: number; hp: number; maxhp: number; ratio: number }): BattleSceneVisualStep | null {
    const card = this.planned.find(member => member.side === 'p1' && member.id === memberId);
    if (!card) return null;
    hpColour(display.hp, display.maxhp);
    if (!Number.isFinite(display.ratio) || display.ratio < 0 || display.ratio > 1) throw new Error('invalid published final experience');
    Object.assign(card, { level: display.toLevel, hp: display.hp, maxhp: display.maxhp, ratio: display.ratio, flash: false });
    delete card.experienceUnavailable; // Clear only after the replacement projection has passed validation.
    return this.instant();
  }
  dispose(): void {
    if (this.retired) return;
    this.retired = true;
    for (const stop of this.stops.splice(0)) try { stop(); } catch (error) { this.cleanupErrors.push(String(error)); }
  }
}
