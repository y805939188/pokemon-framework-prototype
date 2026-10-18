/**
 * Turn session messages into plain text lines for the placeholder battle UI.
 * Pure and headless-testable. Display names come from `names` (stable id -> shown name).
 * Unknown event types are ignored on purpose: the text UI is a placeholder, not a protocol consumer.
 */
import type { BattleEvent, SessionMessage } from "../battle/protocol.ts";

const STATUS: Record<string, string> = { psn: "poisoned", tox: "badly poisoned", brn: "burned", par: "paralyzed", slp: "asleep", frz: "frozen" };
const STAT: Record<string, string> = { atk: "Attack", def: "Defense", spa: "Sp. Atk", spd: "Sp. Def", spe: "Speed", accuracy: "accuracy", evasion: "evasiveness" };

export interface Describer {
  message(m: SessionMessage): string[];
  event(e: BattleEvent): string[];
}

export function make(names: Record<string, string> = {}): Describer {
  const nm = (ident: string): string => {
    const id = String(ident).replace(/^p\d[a-z]?: /, "");
    const own = String(ident).startsWith("p1");
    const n = names[id] || id;
    return own ? n : `The foe's ${n}`;
  };
  const pct = (h: string): string => { const m = /^(\d+)\/(\d+)/.exec(h); return m ? `${m[1]}/${m[2]}` : h.startsWith("0") ? "0" : h; };
  const itemName = (id: string): string => id.replace(/ball$/, " Ball").replace(/^./, (c) => c.toUpperCase());

  function event(e: BattleEvent): string[] {
    const a = e.args;
    const a0 = a[0] ?? "", a1 = a[1] ?? "";
    switch (e.type) {
      case "switch": case "drag": return a0.startsWith("p1") ? [`Go! ${nm(a0).replace(/^The foe's /, "")}!`] : [`The foe sent out ${names[a0.replace(/^p\d[a-z]?: /, "")] || a0}!`];
      case "move": return [`${nm(a0)} used ${a1}!`];
      case "-damage": { if (/\[from\]/.test(a.join("|"))) return [`${nm(a0)} was hurt (${pct(a1)})`]; return a1.startsWith("0") ? [] : [`${nm(a0)} has ${pct(a1)} HP left.`]; }
      case "-heal": return /\[silent\]/.test(a.join("|")) ? [] : [`${nm(a0)} recovered HP (${pct(a1)}).`];
      case "faint": return [`${nm(a0)} fainted!`];
      case "-supereffective": return ["It's super effective!"];
      case "-resisted": return ["It's not very effective..."];
      case "-immune": return [`It doesn't affect ${nm(a0)}...`];
      case "-miss": return [`${nm(a0)}'s attack missed!`];
      case "-crit": return ["A critical hit!"];
      case "-status": return [`${nm(a0)} was ${STATUS[a1] || a1}!`];
      case "-curestatus": return [`${nm(a0)} was cured of ${STATUS[a1] || a1}.`];
      case "-boost": return [`${nm(a0)}'s ${STAT[a1] || a1} rose${Number(a[2]) > 1 ? " sharply" : ""}!`];
      case "-unboost": return [`${nm(a0)}'s ${STAT[a1] || a1} fell!`];
      case "rpg": return rpg(a);
      case "win": return [];
      default: return [];
    }
  }

  function rpg(a: string[]): string[] {
    const what = a[0], x = a[2] ?? "", target = a[3] ?? "", res = a[4];
    const tn = names[target] || target;
    if (what === "item") {
      if (res === "ok") return [a[5] !== undefined && /^\d+$/.test(a[5]) ? `Used ${itemName(x)} on ${tn}. Recovered ${a[5]} HP.` : `Used ${itemName(x)} on ${tn}.`];
      if (res === "noeffect") return [`It won't have any effect. (${itemName(x)} was not used up)`];
      return ["That can't be used."];
    }
    if (what === "ball") {
      if (res === "blocked") return ["The trainer blocked the Ball! Don't be a thief!"];
      if (res === "notarget") return ["There is no target for the Ball!"];
      if (res === "caught") return [`You threw a ${itemName(x)}!`, `Gotcha! ${tn} was caught!`];
      const shakes = Number(a[5]);
      return [`You threw a ${itemName(x)}!`, shakes === 0 ? "Oh no! The Pokémon broke free!" : shakes === 1 ? "Aww! It appeared to be caught!" : shakes === 2 ? "Aargh! Almost had it!" : "Gah! It was so close, too!"];
    }
    if (what === "run") {
      // |rpg|run|side|ok|rate|attempts  (args: what, side, result, rate, attempts)
      const r = a[2];
      if (r === "ok") return ["Got away safely!"];
      if (r === "fail") return ["Can't escape!"];
      if (r === "denied") return [a[3] === "trainer" ? "No! There's no running from a trainer battle!" : "You can't run away!"];
    }
    return [];
  }

  function message(m: SessionMessage): string[] {
    switch (m.kind) {
      case "events": return m.events.flatMap(event);
      case "growth": {
        const n = names[m.member] || m.member;
        const out = m.exp > 0 ? [`${n} gained ${m.exp} Exp. Points!`] : [];
        for (const lv of m.levelUps) out.push(`${n} grew to Lv. ${lv}!`);
        return out;
      }
      case "learned": return [`${names[m.member] || m.member} ${m.replaced === null ? "learned" : "forgot an old move and learned"} ${m.move}!`];
      case "learn-prompt": return [`${names[m.member] || m.member} wants to learn ${m.move.name}, but already knows four moves.`];
      case "error": return [`(${m.message})`];
      case "end": return [m.reason === "win" ? (m.winner === "Player" ? "You won the battle!" : "You lost the battle...") : m.reason === "caught" ? "The wild Pokémon is yours!" : m.reason === "run" ? "You ran away." : "The battle ended in a draw."];
      default: return [];
    }
  }
  return { message, event };
}
