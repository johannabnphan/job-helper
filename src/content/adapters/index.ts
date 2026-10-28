import { generic } from './generic';
import type { Adapter } from './types';

const ADAPTERS: Adapter[] = [];

export function pickAdapter(loc: Location, doc: Document): Adapter {
  return ADAPTERS.find((a) => a.matches(loc, doc)) ?? generic;
}
