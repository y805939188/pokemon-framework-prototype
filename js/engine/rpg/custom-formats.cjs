'use strict';
/**
 * Showdown "custom-formats" extension (officially supported: dist/config/custom-formats.js is
 * merged into the format list). Adds `[Gen 8] RPG Custom Game`: Gen 8 Custom Game plus one
 * engine event, `RpgAction`, that resolves non-move actions inside the turn queue.
 * Staged into the engine build by scripts/build-showdown.sh; no Showdown source is modified.
 */
const { HEAL_ITEMS, STATUS_ITEMS, STAT_ITEMS, healRequest, captureNumbers, rollCapture, escapeRate } = require('./rpg-rules.cjs');

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
	const status = STATUS_ITEMS[payload.item];
	const stat = STAT_ITEMS[payload.item];
	if (target && (status || stat) && !spec) {
		if (target.fainted || target.hp <= 0) { emit(battle, 'item', side.id, payload.item, target.name, 'noeffect'); return; }
		if (status) {
			const cures = status.cures === 'all' ? !!target.status : status.cures.includes(target.status);
			const confused = status.confusion && target.isActive && !!target.volatiles['confusion'];
			if (!cures && !confused) { emit(battle, 'item', side.id, payload.item, target.name, 'noeffect'); return; }
			if (cures) target.cureStatus(!target.isActive); // active: engine shows the cure; bench: silent
			if (confused) target.removeVolatile('confusion');
			emit(battle, 'item', side.id, payload.item, target.name, 'ok');
			return;
		}
		// stat items need an active target (battle-only effect)
		if (!target.isActive) { emit(battle, 'item', side.id, payload.item, target.name, 'noeffect'); return; }
		const applied = battle.boost(stat.boosts, target, user, null, true);
		emit(battle, 'item', side.id, payload.item, target.name, applied ? 'ok' : 'noeffect');
		return;
	}
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

/** Ending the engine battle is only a way to stop the queue; the business meaning is rpg.outcome. */
function finish(battle, outcome) {
	battle.rpg.outcome = outcome;
	battle.tie();
}

function foesOf(user) {
	return user.side.foe.active.filter(p => p && !p.fainted);
}

function resolveRun(battle, user) {
	const side = user.side;
	if (!battle.rpg.wild) { emit(battle, 'run', side.id, 'denied', 'trainer'); return; }
	if (user.trapped || user.volatiles['partiallytrapped'] || user.volatiles['trapped']) { emit(battle, 'run', side.id, 'denied', 'trapped'); return; }
	const foes = foesOf(user);
	if (!foes.length) { emit(battle, 'run', side.id, 'denied', 'nofoe'); return; }
	// attempts only count once the calculation is reached (WP41 7.2)
	const attempts = (battle.rpg.attempts[side.id] = (battle.rpg.attempts[side.id] || 0) + 1);
	const ownSpeed = user.storedStats.spe; // unmodified battle copy, not boosted/paralysed speed
	const foeSpeed = Math.max(...foes.map(f => f.storedStats.spe));
	const rate = escapeRate(ownSpeed, foeSpeed, attempts);
	const ok = rate >= 256 || battle.random(256) < rate;
	emit(battle, 'run', side.id, ok ? 'ok' : 'fail', rate, attempts);
	if (ok) finish(battle, { kind: 'run', side: side.id });
}

function resolveBall(battle, user, payload) {
	const side = user.side;
	if (!battle.rpg.wild) { emit(battle, 'ball', side.id, payload.ball, '-', 'blocked'); return; } // trainer blocks the ball
	let target = side.foe.pokemon.find(p => p.name === payload.target);
	if (!target) { emit(battle, 'ball', side.id, payload.ball, payload.target || '-', 'notarget'); return; }
	if (target.fainted) { // WP38 2: redirect to a living companion, else no target (ball already spent)
		target = side.foe.pokemon.find(p => !p.fainted && p !== target);
		if (!target) { emit(battle, 'ball', side.id, payload.ball, payload.target, 'notarget'); return; }
	}
	const own = side.active.filter(p => p && !p.fainted);
	const ctx = Object.assign({
		turn: battle.turn - 1, // rounds already completed
		targetLevel: target.level,
		targetTypes: target.getTypes(),
		targetBaseSpeed: target.species.baseStats.spe,
		weightHg: target.getWeight(),
		userMaxLevel: Math.max(...own.map(p => p.level)),
		ultraBeast: !!(target.species.tags && target.species.tags.includes('Ultra Beast')),
	}, payload.ctx || {});
	const nums = captureNumbers({ ballId: payload.ball, baseRate: payload.catchRate, maxHp: target.maxhp, hp: target.hp, status: target.status || '', ctx });
	const res = rollCapture(nums, ctx, n => battle.random(n));
	emit(battle, 'ball', side.id, payload.ball, target.name, res.shakes === 4 ? 'caught' : 'escaped', res.shakes, res.critical ? 1 : 0, nums.x, nums.y === null ? '-' : nums.y);
	if (res.shakes === 4) {
		finish(battle, {
			kind: 'caught', side: side.id, target: target.name, ball: payload.ball,
			// what the game needs to take over: stable id + current persistent-relevant state
			mon: { id: target.name, species: target.species.name, level: target.level, hp: target.hp, maxhp: target.maxhp, status: target.status || '' },
		});
	}
}

const handlers = {
	item: resolveItem,
	run: resolveRun,
	ball: resolveBall,
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
