export type PrebattleLocation = 0 | 1 | 2 | 3;
export interface PrebattlePlan {
  readonly version: 'default-prebattle-v1'; readonly category: number; readonly location: PrebattleLocation;
  readonly night: boolean; readonly contextSource: 'explicit-or-default-not-inferred';
  readonly referenceEffect: string; readonly renderer: 'default-opacity-placeholder-v1';
  readonly flashColour: 'black' | 'white'; readonly flashMs: number; readonly mainMs: number;
  readonly afterMs: number; readonly returnMs: number;
}
/** WP16 default selection only. Special registrations/portraits and visual fidelity are separate work. */
export function prebattlePlan(kind: unknown, presentation: any, parameters: any, battleTime: number): Readonly<PrebattlePlan> {
  const value = presentation?.transition;
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('invalid prebattle context');
  const integer = (raw: unknown, fallback: number) => {
    if (raw === undefined || raw === '') return fallback;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^[0-3]$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 3) throw new Error('invalid prebattle category/location'); return n;
  };
  const category = integer(value?.category, kind === 'trainer' ? 1 : 0);
  const location = integer(value?.location ?? parameters.prebattleLocation, 0) as PrebattleLocation;
  const night = value?.night === undefined ? battleTime === 2 : value.night;
  if (typeof night !== 'boolean') throw new Error('invalid prebattle night');
  const wild = night ? ['SnakeSquares','DiagonalBubbleBR','DiagonalBubbleBR','RisingSplash'] : ['SnakeSquares','DiagonalBubbleTL','DiagonalBubbleBR','RisingSplash'];
  const trainer = night ? ['SpinBallSplit','BallDown','BallDown','WavySpinBall'] : ['TwoBallPass','ThreeBallDown','BallDown','WavyThreeBallUp'];
  const referenceEffect = category === 3 ? 'FourBallBurst' : category % 2 ? trainer[location] : wild[location];
  const seconds: Record<string,number> = { FourBallBurst:.9, TwoBallPass:1, ThreeBallDown:2, BallDown:.9, WavyThreeBallUp:1.1, SpinBallSplit:1, WavySpinBall:1 };
  return Object.freeze({ version:'default-prebattle-v1', category, location, night, contextSource:'explicit-or-default-not-inferred',
    referenceEffect, renderer:'default-opacity-placeholder-v1', flashColour:night || location === 2 ? 'black' : 'white',
    flashMs:800, mainMs:(seconds[referenceEffect] ?? 1.25)*1000, afterMs:100, returnMs:400 });
}
export interface PrebattleOverlay { paint(colour: 'black'|'white', opacity: number): void; dispose(): void; }
interface PrebattlePorts {
  current(): boolean; now(): number; frame(): number; overlay(scene: unknown): PrebattleOverlay;
  captureBGS(): {pause():void;restore():void}|null; prepareAudio(): void; enterBattle(): void;
  resetEncounter(): void; failed(error: unknown): void;
}
type Phase = 'new'|'flash'|'transition'|'after'|'battle'|'return-pending'|'return'|'done'|'cancelled'|'failed';
const errorText = (e: unknown) => String(e instanceof Error ? e.message : e);
/** One owned host presentation; no session, persistent state, global timers or engine random source. */
export class PrebattleOperation {
  private phase: Phase = 'new'; private layer: PrebattleOverlay|null = null; private map: unknown = null;
  private restoreBGS: (()=>void)|null = null; private started = 0; private lastClock = -Infinity;
  private trace: {phase: Phase; at: number; frame: number; targetMs: number}[] = [];
  private primaryError: string|null = null; private cleanupErrors: string[] = [];
  constructor(readonly plan: Readonly<PrebattlePlan>, private readonly p: PrebattlePorts) {}
  get phaseName(): Phase { return this.phase; }
  pending() { return ['new','flash','transition','after','return-pending','return'].includes(this.phase); }
  snapshot() { return { ...this.plan, phase:this.phase, primaryError:this.primaryError,
    cleanupErrors:[...this.cleanupErrors], stages:this.trace.map(x=>({...x})) }; }
  private now() { const n=this.p.now(); if (!Number.isFinite(n) || n<this.lastClock) throw new Error('invalid prebattle clock'); this.lastClock=n; return n; }
  private stage(phase: Phase, at: number, targetMs=0) {
    const frame=this.p.frame();if(!Number.isSafeInteger(frame)||frame<0)throw new Error('invalid prebattle frame');
    this.phase=phase;this.started=at;this.trace.push({phase,at,frame,targetMs});
  }
  private disposeLayer() { const layer=this.layer;this.layer=null;this.map=null;if(layer)layer.dispose(); }
  private attach(map: unknown, phase: Phase) {
    const layer=this.p.overlay(map);
    if(this.phase!==phase||!this.p.current()){layer.dispose();return false;}
    this.map=map;this.layer=layer;return true;
  }
  private paint(colour: 'black'|'white', opacity: number) {
    const phase=this.phase;this.layer!.paint(colour,opacity);
    if(this.phase!==phase||!this.p.current()){this.cancel(false);return false;}return true;
  }
  private restore() { const restore=this.restoreBGS;this.restoreBGS=null;if(restore&&this.p.current())restore(); }
  private fail(error: unknown) {
    if (this.phase==='failed'||this.phase==='cancelled'||this.phase==='done') return;
    this.primaryError=errorText(error);this.phase='failed';
    for (const f of [()=>this.disposeLayer(),()=>this.restore()])try{f();}catch(e){this.cleanupErrors.push(errorText(e));}
    if(this.p.current())this.p.failed(error);
  }
  start(map: unknown) {
    if(this.phase!=='new')return;
    try{
      if(!this.p.current()){this.phase='cancelled';return;}
      if(!this.attach(map,'new')){this.cancel(false);return;}
      const bgs=this.p.captureBGS();if(this.phase!=='new'||!this.p.current()){this.cancel(false);return;}
      this.restoreBGS=bgs?()=>bgs.restore():null;bgs?.pause();
      if(this.phase!=='new'||!this.p.current()){this.cancel(false);return;}this.p.prepareAudio();
      if(!this.p.current()||this.phase!=='new'){this.cancel(false);return;}
      this.stage('flash',this.now(),this.plan.flashMs);this.paint(this.plan.flashColour,0);
    }catch(e){this.fail(e);}
  }
  tick(map: unknown) {
    if(this.phase==='new'||['done','cancelled','failed','battle'].includes(this.phase))return;
    try{
      if(!this.p.current()){this.cancel(false);return;}
      if(this.phase==='return-pending'){
        if(!this.attach(map,'return-pending')){this.cancel(false);return;}
        this.p.resetEncounter();if(!this.p.current()){this.cancel(false);return;}
        this.stage('return',this.now(),this.plan.returnMs);this.paint('black',1);return;
      }
      if(map!==this.map)throw new Error('prebattle map changed before handoff');
      const now=this.now(),elapsed=now-this.started;
      if(this.phase==='flash'){
        if(elapsed>=this.plan.flashMs){if(this.paint('black',0))this.stage('transition',now,this.plan.mainMs);}
        else{const f=(elapsed%400)/200;this.paint(this.plan.flashColour,f<=1?f:2-f);}
      }else if(this.phase==='transition'){
        if(!this.paint('black',Math.min(1,elapsed/this.plan.mainMs)))return;
        if(elapsed>=this.plan.mainMs)this.stage('after',now,this.plan.afterMs);
      }else if(this.phase==='after'){
        if(elapsed>=this.plan.afterMs){this.stage('battle',now);this.p.enterBattle();}
      }else if(this.phase==='return'){
        if(!this.paint('black',Math.max(0,1-elapsed/this.plan.returnMs)))return;
        if(elapsed>=this.plan.returnMs){this.stage('done',now);this.disposeLayer();}
      }
    }catch(e){this.fail(e);}
  }
  /** Keep the last Map frame black until SceneManager actually removes that map. */
  mapTerminated(map: unknown) {
    if(map!==this.map)return;
    try{this.disposeLayer();if(['flash','transition','after'].includes(this.phase))this.fail(new Error('prebattle map left before handoff'));}
    catch(e){this.fail(e);}
  }
  finish(normal: boolean) {
    if(this.phase!=='battle'){if(!normal)this.cancel(true);return;}
    if(!normal){this.cancel(true);return;}
    try{
      if(!this.p.current()){this.cancel(false);return;}
      this.stage('return-pending',this.now());this.restore();
    }catch(e){this.fail(e);}
  }
  cancel(restoreBGS=false) {
    if(['done','cancelled','failed'].includes(this.phase))return;
    this.phase='cancelled';
    for(const f of [()=>this.disposeLayer(),()=>{if(restoreBGS)this.restore();else this.restoreBGS=null;}])
      try{f();}catch(e){this.cleanupErrors.push(errorText(e));}
  }
}
