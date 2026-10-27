/**
 * Turn session messages into plain text lines for the placeholder battle UI. Pure and headless-testable.
 * Display names come from `names` (stable id -> shown name); every sentence comes from a text key resolved by the
 * translator (English by default, so the English output is exactly the step 2 text). Unknown event types are ignored
 * on purpose: the text UI is a placeholder, not a protocol consumer.
 */
import { defaultTranslator } from "../i18n/index";
import type { Translator } from "../i18n/index";
import type { BattleEvent, SessionMessage } from "../battle/protocol";

export interface Describer {
  message(m: SessionMessage): string[];
  event(e: BattleEvent): string[];
}

export function make(names: Record<string, string> = {}, tr: Translator = defaultTranslator()): Describer {
  const idOf = (ident: string): string => String(ident).replace(/^p\d[a-z]?: /, "");
  const nm = (ident: string): string => {
    const name = names[idOf(ident)] || idOf(ident);
    return String(ident).startsWith("p1") ? name : tr.t("battle.foe_prefix", { name });
  };
  const pct = (h: string): string => { const m = /^(\d+)\/(\d+)/.exec(h); return m ? `${m[1]}/${m[2]}` : h.startsWith("0") ? "0" : h; };
  const itemName = (id: string): string => tr.tOr(`item.name.${id}`, id.replace(/ball$/, " Ball").replace(/^./, (c) => c.toUpperCase()));
  const statName = (id: string): string => tr.tOr(`stat.${id}`, id);
  const status = (a0: string, id: string, kind: "inflicted" | "cured"): string =>
    tr.has(`battle.status.${id}.${kind}`) ? tr.t(`battle.status.${id}.${kind}`, { name: nm(a0) }) : tr.t(`battle.status_${kind}`, { name: nm(a0), status: id });

  function event(e: BattleEvent): string[] {
    const a = e.args;
    const a0 = a[0] ?? "", a1 = a[1] ?? "";
    switch (e.type) {
      case "switch": case "drag": return a0.startsWith("p1") ? [tr.t("battle.go", { name: names[idOf(a0)] || idOf(a0) })] : [tr.t("battle.foe_sent_out", { name: names[idOf(a0)] || a0 })];
      case "move": return [tr.t("battle.used_move", { user: nm(a0), move: a1 })];
      case "-damage": { if (/\[from\]/.test(a.join("|"))) return [tr.t("battle.hurt", { name: nm(a0), hp: pct(a1) })]; return a1.startsWith("0") ? [] : [tr.t("battle.hp_left", { name: nm(a0), hp: pct(a1) })]; }
      case "-heal": return /\[silent\]/.test(a.join("|")) ? [] : [tr.t("battle.recovered", { name: nm(a0), hp: pct(a1) })];
      case "faint": return [tr.t("battle.fainted", { name: nm(a0) })];
      case "-supereffective": return [tr.t("battle.super_effective")];
      case "-resisted": return [tr.t("battle.not_very_effective")];
      case "-immune": return [tr.t("battle.immune", { name: nm(a0) })];
      case "-miss": return [tr.t("battle.missed", { name: nm(a0) })];
      case "-crit": return [tr.t("battle.crit")];
      case "-status": return [status(a0, a1, "inflicted")];
      case "-curestatus": return [status(a0, a1, "cured")];
      case "-boost": return [tr.t(Number(a[2]) > 1 ? "battle.boost_rose_sharply" : "battle.boost_rose", { name: nm(a0), stat: statName(a1) })];
      case "-unboost": return [tr.t("battle.stat_fell", { name: nm(a0), stat: statName(a1) })];
      case "rpg": return rpg(a);
      case "win": return [];
      default: return [];
    }
  }

  function rpg(a: string[]): string[] {
    const what = a[0], x = a[2] ?? "", target = a[3] ?? "", res = a[4];
    const tn = names[target] || target;
    if (what === "item") {
      if (res === "ok") return [a[5] !== undefined && /^\d+$/.test(a[5]) ? tr.t("item.used_recovered", { item: itemName(x), target: tn, hp: a[5] }) : tr.t("item.used", { item: itemName(x), target: tn })];
      if (res === "noeffect") return [tr.t("item.no_effect", { item: itemName(x) })];
      return [tr.t("item.invalid")];
    }
    if (what === "ball") {
      if (res === "blocked") return [tr.t("ball.blocked")];
      if (res === "notarget") return [tr.t("ball.no_target")];
      if (res === "caught") return [tr.t("ball.thrown", { ball: itemName(x) }), tr.t("ball.caught", { target: tn })];
      const shakes = Number(a[5]);
      return [tr.t("ball.thrown", { ball: itemName(x) }), tr.t(`ball.shake${shakes === 0 ? 0 : shakes === 1 ? 1 : shakes === 2 ? 2 : 3}`)];
    }
    if (what === "run") {
      // |rpg|run|side|ok|rate|attempts  (args: what, side, result, rate, attempts)
      const r = a[2];
      if (r === "ok") return [tr.t("run.ok")];
      if (r === "fail") return [tr.t("run.fail")];
      if (r === "denied") return [tr.t(a[3] === "trainer" ? "run.denied_trainer" : "run.denied_other")];
    }
    return [];
  }

  function message(m: SessionMessage): string[] {
    switch (m.kind) {
      case "events": return m.events.flatMap(event);
      case "growth": {
        const name = names[m.member] || m.member;
        const out = m.exp > 0 ? [tr.t("growth.gained", { name, exp: m.exp })] : [];
        for (const lv of m.levelUps) out.push(tr.t("growth.grew", { name, level: lv }));
        return out;
      }
      case "learned": return [tr.t(m.replaced === null ? "learn.learned" : "learn.replaced", { name: names[m.member] || m.member, move: m.move })];
      case "learn-prompt": return [tr.t("learn.prompt", { name: names[m.member] || m.member, move: m.move.name })];
      case "error": return [tr.t("error.line", { message: m.message })];
      case "end": return [tr.t(m.reason === "win" ? (m.winner === "Player" ? "end.win" : "end.lose") : m.reason === "caught" ? "end.caught" : m.reason === "run" ? "end.ran" : "end.draw")];
      default: return [];
    }
  }
  return { message, event };
}
