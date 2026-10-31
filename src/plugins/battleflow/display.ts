import { HpPresentation, ExperiencePresentation, hpColour } from './visual-timing';
import type { BattleSceneVisualStep } from './controller';

export interface BattleDisplayCard {
  id: string; side: 'p1' | 'p2'; name: string; level: number; hp: number; maxhp: number;
  status: string; active: boolean; ratio: number | null; flash?: boolean;
}
export interface BattleDisplayPorts {
  current(): boolean;
  paint(cards: readonly BattleDisplayCard[]): void;
  afterPaintNow?(): number;
  cue(kind: 'exp-gain' | 'exp-full'): (() => void) | undefined;
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
  private changes(changes: { card: BattleDisplayCard; hp: number; maxhp: number; status: string }[]): BattleSceneVisualStep {
    const tweens = changes.map(change => {
      // A published max-HP change is a new display scale; it is not reconstructed from an engine object.
      const from = Math.min(change.card.hp, change.maxhp);
      const tween = new HpPresentation({ memberId: key(change.card.side, change.card.id), from, to: change.hp, total: change.maxhp });
      Object.assign(change.card, { hp: change.hp, maxhp: change.maxhp, status: change.status });
      return { id: key(change.card.side, change.card.id), tween };
    });
    const target = copy(this.planned);
    return this.step(now => {
      const frames = tweens.map(item => ({ id: item.id, value: item.tween.sample(now) }));
      const cards = copy(target);
      for (const frame of frames) cards.find(card => key(card.side, card.id) === frame.id)!.hp = frame.value.value;
      return this.paint(cards) && frames.every(frame => frame.value.complete);
    }, () => { for (const item of tweens) item.tween.cancel(); });
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
      for (const member of this.planned) if (member.side === card.side) member.active = member === card;
      Object.assign(card, condition(event.args[2], card)); return [this.instant()];
    }
    if (event.type === '-status' || event.type === '-curestatus' || event.type === 'faint') {
      card.status = event.type === '-status' ? event.args[1] || '' : '';
      if (event.type === 'faint') card.hp = 0;
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
    return this.instant();
  }
  dispose(): void {
    if (this.retired) return;
    this.retired = true;
    for (const stop of this.stops.splice(0)) try { stop(); } catch (error) { this.cleanupErrors.push(String(error)); }
  }
}
