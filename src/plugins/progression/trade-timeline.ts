/** WP67-B C: card advance is not cancellation. Artwork travel durations are placeholder presentation pacing. */
export class TradeTimeline {
  phase: 'card' | 'outgoing' | 'sending' | 'farewell' | 'incoming' | 'received' | 'care' | 'ended' = 'card';
  private now: number;
  private since: number;
  constructor(now: number) { this.now = this.since = now; }
  update(now: number, input: { use?: boolean; back?: boolean }): 'presented' | null {
    this.now = Math.max(this.now, now);
    const elapsed = this.now - this.since, advance = input.use || input.back;
    if (this.phase === 'card' && (elapsed >= 2500 || advance)) this.phase = 'outgoing';
    else if (this.phase === 'outgoing' && elapsed >= 2000) this.phase = 'sending';
    else if (this.phase === 'sending' && advance) this.phase = 'farewell';
    else if (this.phase === 'farewell' && advance) this.phase = 'incoming';
    else if (this.phase === 'incoming' && elapsed >= 2000) this.phase = 'received';
    else if (this.phase === 'received' && advance) this.phase = 'care';
    else if (this.phase === 'care' && advance) { this.phase = 'ended'; return 'presented'; }
    else return null;
    this.since = this.now;
    return null;
  }
  get progress() { return Math.min(1, Math.max(0, (this.now - this.since) / 2000)); }
}
