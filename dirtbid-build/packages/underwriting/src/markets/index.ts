import type { MarketConfig } from '../types.js';
import { ALTADENA_CA } from './altadena-ca.js';
import { HAMPTON_ROADS_VA } from './hampton-roads-va.js';
import { GENERIC_US } from './generic-us.js';
import { RICHMOND_VA } from './richmond-va.js';

const registry = new Map<string, MarketConfig>([
  [ALTADENA_CA.code, ALTADENA_CA],
  [HAMPTON_ROADS_VA.code, HAMPTON_ROADS_VA],
  [RICHMOND_VA.code, RICHMOND_VA],
  [GENERIC_US.code, GENERIC_US],
]);

export function registerMarket(cfg: MarketConfig): void {
  registry.set(cfg.code, cfg);
}
export function getMarket(code: string): MarketConfig | undefined {
  return registry.get(code);
}
export function listMarkets(): MarketConfig[] {
  return [...registry.values()];
}
export { ALTADENA_CA, HAMPTON_ROADS_VA, RICHMOND_VA, GENERIC_US };
