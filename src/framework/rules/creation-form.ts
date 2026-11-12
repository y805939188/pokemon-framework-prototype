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

/** Possible automatic creation results across supported environments, owners and natures.
 * Author diagnostics only: never samples, filters, or replaces the actual creation draw.
 */
export function creationFormCandidates(species: string): readonly number[] {
  const range = (count: number, start = 0): number[] => Array.from({ length: count }, (_, i) => start + i);
  switch (species.replace(/[^a-z0-9]/gi, "").toUpperCase()) {
    case "UNOWN": return range(28);
    case "BURMY": case "WORMADAM": case "LYCANROC": return range(3);
    case "SCATTERBUG": case "SPEWPA": case "VIVILLON": return range(18);
    case "PUMPKABOO": case "GOURGEIST": return range(4);
    case "MINIOR": return range(7, 7);
    case "TOXEL": case "TOXTRICITY": case "SINISTEA": case "POLTEAGEIST": case "URSHIFU": return range(2);
    case "ALCREMIE": return range(63);
    default: return [0];
  }
}

/** Latent creation identities sharing a single battle species in the pinned Gen 8 Dex.
 * Never extend this to forms with different battle data merely because their author record is missing.
 */
export function storedCreationForms(species: string): readonly number[] {
  switch (species.replace(/[^a-z0-9]/gi, "").toUpperCase()) {
    case "TOXEL": return [0, 1];
    case "SCATTERBUG": case "SPEWPA": return Array.from({ length: 18 }, (_, i) => i);
    default: return [];
  }
}
