/** WP21 B-family only. Stored forms are never recomputed by reading a summary/storage screen. */
import { secretId } from "./member-identity";

export interface CreationEnvironment { environment?: string | null; timeOfDay?: "day" | "dusk" | "night" }
const LOW_KEY_NATURES = ["lonely", "bold", "relaxed", "timid", "serious", "modest", "mild", "quiet", "bashful", "calm", "gentle", "careful"];

export function creationForm(species: string, nature: string, playerId: number, random: (n: number) => number, context: CreationEnvironment = {}): number {
  const draw = (n: number): number => {
    const value = random(n);
    if (!Number.isInteger(value) || value < 0 || value >= n) throw new RangeError(`random(${n}) returned ${value}`);
    return value;
  };
  switch (species.replace(/[^a-z0-9]/gi, "").toUpperCase()) {
    case "UNOWN": return draw(28);
    case "BURMY": case "WORMADAM": return context.environment == null ? 2 : ["rock", "sand", "cave"].includes(context.environment) ? 1 : 0;
    case "SCATTERBUG": case "SPEWPA": case "VIVILLON": return secretId(playerId) % 18;
    case "PUMPKABOO": case "GOURGEIST": { const roll = draw(100); return roll < 5 ? 3 : roll < 20 ? 2 : roll < 65 ? 1 : 0; }
    case "LYCANROC": return context.timeOfDay === "dusk" ? 2 : context.timeOfDay === "night" ? 1 : 0;
    case "MINIOR": return draw(7) + 7;
    case "TOXEL": case "TOXTRICITY": return LOW_KEY_NATURES.includes(nature.toLowerCase()) ? 1 : 0;
    case "SINISTEA": case "POLTEAGEIST": return draw(100) < 10 ? 1 : 0;
    case "ALCREMIE": return draw(63);
    case "URSHIFU": return draw(2);
    default: return 0;
  }
}
