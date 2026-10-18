'use strict';
/**
 * Showdown "custom-formats" extension (officially supported: dist/config/custom-formats.js is
 * merged into the format list). Adds `[Gen 8] RPG Custom Game`: Gen 8 Custom Game plus one
 * engine event, `RpgAction`, that resolves non-move actions inside the turn queue.
 * Staged into the engine build by scripts/build-showdown.sh; no Showdown source is modified.
 */
const { HEAL_ITEMS, healRequest } = require('./rpg-rules.cjs');

/** Pending actions live on the (serialized) battle object so snapshots carry them. */
function pendingFor(battle, sideId) {
	const rpg = battle.rpg;
	const p = rpg && rpg.pending[sideId];
	if (rpg) delete rpg.pending[sideId];
	return p || null;
}

function emit(battle, ...parts) {
	battle.add('rpg', ...parts);
}

function resolveItem(battle, user, payload) {
	const side = user.side;
	const target = side.pokemon.find(p => p.name === payload.target);
	const spec = HEAL_ITEMS[payload.item];
	if (!target || !spec) {
		emit(battle, 'item', side.id, payload.item, payload.target || '-', 'invalid');
		return;
	}
	// Execution-time re-check (WP40 4.2 / WP28 3.5): fainted or already full => no effect.
	if (target.fainted || target.hp <= 0 || target.hp >= target.maxhp) {
		emit(battle, 'item', side.id, payload.item, target.name, 'noeffect');
		return;
	}
	const request = healRequest(spec, target);
	const healed = target.heal(request); // actual = min(request, missing); no Heal Block etc.
	if (target.isActive) battle.add('-heal', target, target.getHealth);
	emit(battle, 'item', side.id, payload.item, target.name, 'ok', healed, target.hp, target.maxhp);
}

const handlers = {
	item: resolveItem,
};

exports.Formats = [
	{ section: 'RPG' }, // section header is its own list element
	{
		name: '[Gen 8] RPG Custom Game',
		mod: 'gen8',
		searchShow: false,
		debug: true,
		battle: { trunc: Math.trunc },
		ruleset: ['Team Preview', 'Cancel Mod', 'Max Team Size = 24', 'Max Move Count = 24', 'Max Level = 9999', 'Default Level = 100'],
		onBegin() {
			this.rpg = { pending: {}, attempts: {} };
		},
		onRpgAction(pokemon) {
			const payload = pendingFor(this, pokemon.side.id);
			if (!payload) return;
			const h = handlers[payload.kind];
			if (!h) {
				emit(this, 'unknown', pokemon.side.id, payload.kind);
				return;
			}
			h(this, pokemon, payload);
		},
	},
];
