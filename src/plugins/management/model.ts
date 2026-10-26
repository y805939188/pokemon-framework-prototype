/** Host-independent input/focus model, owned by the MZ adapter. No game state writes. */
export type Direction = 'up' | 'left' | 'right' | 'down';
export type Action = 'back' | 'use' | 'action' | 'special' | 'jumpup' | 'jumpdown';
export interface InputFrame { repeated: Partial<Record<Direction, boolean>>; triggered: Partial<Record<Action | Direction, boolean>>; pressed: Partial<Record<Action | Direction, boolean>> }
const directions: Direction[] = ['up','left','right','down'];
export function inputIntent(frame: InputFrame, context: 'box'|'panel'|'mark-summary'|'mark-storage'|'ordinary', organize = true): { direction?: Direction; action?: Action } {
  const direction = directions.find(key => frame.repeated[key]);
  const order: Action[] = context === 'box' ? ['jumpup','jumpdown','special',...(organize ? ['action' as const] : []),'back','use']
    : context === 'panel' ? [...(organize ? ['action' as const] : []),'back','use']
    : context === 'mark-summary' ? ['back','use','action'] : ['back','use','action','special'];
  const action = order.find(key => frame.triggered[key]);
  // Summary marking is one mutually exclusive chain; storage marking has direction then one button.
  return context === 'mark-summary' && action ? { action } : { ...(direction ? { direction } : {}), ...(action ? { action } : {}) };
}
export function partyCursor(current: number, direction: Direction, occupied: readonly number[]): number {
  const full = new Set(occupied), cancel = 6;
  if (!full.size) return cancel;
  if (current === cancel) return direction === 'up' || direction === 'left' ? Math.max(...occupied) : Math.min(...occupied);
  const step = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -2 : 2;
  let next = current;
  for (let i=0;i<7;i++) { next += step; if (next<0 || next>=6) return cancel; if (full.has(next)) return next; }
  return cancel;
}
export function panelCursor(current: number, direction: Direction): number {
  if (direction==='left' || direction==='right') return (current + (direction==='left'?-1:1) + 7)%7;
  if(current===6)return direction==='up'?5:0;
  const next=current+(direction==='up'?-2:2);return next<0||next>5?6:next;
}
export function boxCursor(current: number, direction: Direction): { cursor: number; boxDelta: number } {
  if(current===-1){if(direction==='left'||direction==='right')return {cursor:-1,boxDelta:direction==='left'?-1:1};return {cursor:direction==='up'?-2:2,boxDelta:0};}
  if(current===-2)return {cursor:direction==='up'?25:direction==='down'?-1:-3,boxDelta:0};
  if(current===-3)return {cursor:direction==='up'?28:direction==='down'?-1:-2,boxDelta:0};
  if(direction==='up')return {cursor:current<6?-1:current-6,boxDelta:0};
  if(direction==='down')return {cursor:current>=24?(current%6<3?-2:-3):current+6,boxDelta:0};
  const row=Math.floor(current/6),col=current%6;return {cursor:row*6+(col+(direction==='left'?-1:1)+6)%6,boxDelta:0};
}
export function summaryCursor(current: number, direction: 'up'|'down', occupied: readonly number[]): number {
  const ordered=[...occupied].sort((a,b)=>a-b);return direction==='up' ? ordered.filter(n=>n<current).at(-1)??current : ordered.find(n=>n>current)??current;
}
export function ribbonCursor(current: number, direction: Direction, count: number): number {
  const slots=Math.max(12,Math.ceil(count/4)*4);
  if(direction==='up'||direction==='down')return (current+(direction==='up'?-4:4)+slots)%slots;
  return Math.floor(current/4)*4+(current%4+(direction==='left'?-1:1)+4)%4;
}
export function markCursor(current: number, direction: Direction): number {
  if(direction==='left'||direction==='right')return (current+(direction==='left'?-1:1)+8)%8;
  if(current>=6)return direction==='up'?(current===6?3:5):current===6?0:2;
  const next=current+(direction==='up'?-3:3);return next<0?(current<2?6:7):next>=6?(current%3<2?6:7):next;
}
export function editMark(marks: readonly number[], index: number, clear: boolean, variants=3): number[] {
  const copy=[...marks];if(index<0||index>5)return copy;
  if(clear){if((copy[index]??0)>0)copy[index]=0;return copy;}
  while(copy.length<=index)copy.push(0);copy[index]=((copy[index]??0)+1)%variants;return copy;
}
export function boxLinkAvailable(hasLink: boolean|undefined, disabledSwitch: boolean|undefined, disableMap: boolean|undefined, quickSwitch=false): boolean {
  return hasLink===true && disabledSwitch===false && disableMap===false && !quickSwitch;
}
/** Trigger buttons are latched until physical release, including when MZ clears its service during transitions. */
export class InputLatch {
  private readonly blocked=new Set<string>();
  arm(pressed: InputFrame['pressed']): void {for(const [key,down]of Object.entries(pressed))if(down)this.blocked.add(key);}
  release(key: Action|Direction):void {this.blocked.delete(key);}
  filter(frame: InputFrame):InputFrame {
    const next:InputFrame={repeated:{...frame.repeated},triggered:{...frame.triggered},pressed:{...frame.pressed}};
    for(const key of this.blocked){if(!frame.pressed[key as keyof InputFrame['pressed']])this.blocked.delete(key);else {delete next.triggered[key as Action];delete next.repeated[key as Direction];}}
    return next;
  }
}
