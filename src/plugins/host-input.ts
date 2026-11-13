/** Shared MZ input sampling. Each plugin is an IIFE, so module state alone cannot own this service. */
import type { Action, Direction, InputFrame } from './management/model';

type Button = Action | Direction;
export interface HostKeyEvent { code?: string; key?: string; keyCode?: number }
interface InputAdapter {
  keyMapper: Record<number, string>;
  keyRepeatWait?: number;
  keyRepeatInterval?: number;
  isPressed(button: string): boolean;
  isTriggered(button: string): boolean;
  isRepeated(button: string): boolean;
}
export interface InputHost {
  Input: InputAdapter;
  Graphics: { frameCount?: number };
  TouchInput: { isCancelled(): boolean };
  document: { addEventListener(kind: string, callback: (event: HostKeyEvent) => void): void };
  addEventListener(kind: string, callback: () => void): void;
}
export interface HostInput {
  inputFrame(): InputFrame;
  keyboardActions(): readonly Button[];
  domPressed(button: Button): boolean;
  consumeNative(event: HostKeyEvent, action: 'use' | 'back'): void;
  subscribeKeyboard(down: (event: HostKeyEvent) => void, up: (event: HostKeyEvent) => void): () => void;
  onBlur(callback: () => void): () => void;
}

const KEY: Readonly<Record<string, Button>> = { Enter: 'use', Space: 'use', KeyZ: 'use', Escape: 'back', KeyX: 'back', Numpad0: 'back', ShiftLeft: 'action', ShiftRight: 'action', ControlLeft: 'special', ControlRight: 'special', KeyA: 'jumpup', PageUp: 'jumpup', KeyS: 'jumpdown', PageDown: 'jumpdown', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down' };
const LEGACY_KEY: Readonly<Record<number, Button>> = { 13: 'use', 32: 'use', 90: 'use', 27: 'back', 88: 'back', 96: 'back', 16: 'action', 17: 'special', 33: 'jumpup', 65: 'jumpup', 34: 'jumpdown', 83: 'jumpdown', 38: 'up', 37: 'left', 39: 'right', 40: 'down' };
export const INPUT_ALIASES: Readonly<Record<Button, string>> = Object.freeze({ use: 'ok', back: 'cancel', action: 'shift', special: 'control', jumpup: 'pageup', jumpdown: 'pagedown', up: 'up', left: 'left', right: 'right', down: 'down' });
export const eventKey = (event: HostKeyEvent): Button | undefined => KEY[event.code ?? ''] || LEGACY_KEY[event.keyCode ?? -1];
const physicalCode = (event: HostKeyEvent) => event.code || String(event.keyCode ?? event.key);
const nativeKey = (event: HostKeyEvent) => event.code || (event.key === 'Enter' || event.key === 'Escape' ? event.key : event.keyCode === 13 ? 'Enter' : event.keyCode === 27 ? 'Escape' : '');
const SHARED_INPUT = Symbol.for('pokemon-framework.host-input.v1');

export function hostInput(host: InputHost): HostInput {
  const services = host as InputHost & { [key: symbol]: HostInput | undefined };
  const previous = services[SHARED_INPUT];
  if (previous) return previous;

  // Only actual DOM keys enter this registry. Gamepad/service state is sampled separately each frame.
  const keyboardKeys = new Map<string, Button>(), nativeConsumed = new Map<string, Button>();
  const keyboardSubscribers = new Set<{ down(event: HostKeyEvent): void; up(event: HostKeyEvent): void }>();
  const blurSubscribers = new Set<() => void>();
  const domStarts = new Map<Button, number>();
  let sampleFrame = -1, sample: InputFrame = { pressed: {}, triggered: {}, repeated: {} };
  const service: HostInput = {
    keyboardActions: () => [...keyboardKeys.values()],
    domPressed: button => [...keyboardKeys.values(), ...nativeConsumed.values()].includes(button),
    consumeNative: (event, action) => { nativeConsumed.set(nativeKey(event), action); },
    subscribeKeyboard(down, up) {
      const subscriber = { down, up }; keyboardSubscribers.add(subscriber);
      return () => { keyboardSubscribers.delete(subscriber); };
    },
    onBlur(callback) { blurSubscribers.add(callback); return () => { blurSubscribers.delete(callback); }; },
    inputFrame() {
      const frame = host.Graphics.frameCount ?? 0;
      if (frame !== sampleFrame) {
        sampleFrame = frame;
        const next: InputFrame = { pressed: {}, triggered: {}, repeated: {} };
        const dom = new Set([...keyboardKeys.values(), ...nativeConsumed.values()]);
        for (const key of Object.keys(INPUT_ALIASES) as Button[]) {
          const was = domStarts.has(key);
          if (dom.has(key) && !was) domStarts.set(key, frame); else if (!dom.has(key)) domStarts.delete(key);
          const edge = dom.has(key) && !was, age = frame - (domStarts.get(key) ?? frame);
          const repeat = edge || dom.has(key) && age >= (host.Input.keyRepeatWait ?? 24) && (age - (host.Input.keyRepeatWait ?? 24)) % (host.Input.keyRepeatInterval ?? 6) === 0;
          next.pressed[key] = dom.has(key) || host.Input.isPressed(INPUT_ALIASES[key]);
          next.triggered[key] = edge || host.Input.isTriggered(INPUT_ALIASES[key]);
          if (key === 'up' || key === 'left' || key === 'right' || key === 'down') next.repeated[key] = repeat || host.Input.isRepeated(INPUT_ALIASES[key]);
        }
        if (host.TouchInput.isCancelled()) next.triggered.back = true;
        sample = next;
      }
      return { pressed: { ...sample.pressed }, triggered: { ...sample.triggered }, repeated: { ...sample.repeated } };
    },
  };
  services[SHARED_INPUT] = service;
  // A/S are adapter bindings for the abstract JUMPUP/JUMPDOWN actions.
  host.Input.keyMapper[65] = 'pageup'; host.Input.keyMapper[83] = 'pagedown';
  for (const method of ['isTriggered', 'isRepeated'] as const) {
    const original = host.Input[method];
    host.Input[method] = function (button: string) {
      const key = button === 'ok' ? 'use' : ['cancel', 'menu', 'escape'].includes(button) ? 'back' : undefined;
      if (key && [...nativeConsumed.values()].includes(key)) return false;
      return original.call(this, button);
    };
  }
  host.document.addEventListener('keydown', event => {
    const key = eventKey(event); if (key) keyboardKeys.set(physicalCode(event), key);
    for (const subscriber of keyboardSubscribers) subscriber.down(event);
  });
  host.document.addEventListener('keyup', event => {
    nativeConsumed.delete(nativeKey(event)); keyboardKeys.delete(physicalCode(event));
    for (const subscriber of keyboardSubscribers) subscriber.up(event);
  });
  host.addEventListener('blur', () => {
    nativeConsumed.clear(); keyboardKeys.clear();
    for (const callback of blurSubscribers) callback();
  });
  return service;
}
