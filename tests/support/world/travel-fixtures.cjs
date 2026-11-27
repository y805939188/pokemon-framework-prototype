'use strict';
const path = require('node:path');
function rules(namespace, file) {
  if (process.env.PF55_E3_RULES_DIR) return require(path.join(process.env.PF55_E3_RULES_DIR, file + '.js'));
  return require(path.join(require('./regular-world-core-runtime.cjs').output(), file + '.js'));
}
const value = v => ({ status: 'value', value: v });
const location = (mapId = 1, x = 5, y = 5, direction = 6) => ({ mapId, x, y, direction });
const appearance = { characterName: 'synthetic-e3', characterIndex: 0, tileId: 0, pattern: 4, opacity: 100, blendMode: 0, walkAnime: true, stepAnime: false };
const companion = (eventId = 1, x = 3, y = 5) => ({ originMapId: 7, originEventId: eventId, name: 'friend-' + eventId, location: location(1, x, y), visible: true, appearance: { ...appearance } });
const member = (id = 'm', moves = ['fly'], overrides = {}) => ({ id, moves: moves.map(id => ({ id, pp: 0, maxpp: 10 })), isEgg: false, hp: 0, ...overrides });
module.exports = { rules, value, location, companion, member };
