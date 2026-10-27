import production = require("@pokemon-framework/engine/production");

// This must remain a compile-time error: a number is not the persistent GameState contract.
const invalidPort: production.app.GameStatePort = {
  read: () => 42,
  replace: () => {},
};
void invalidPort;
