import { ashby } from './ashby';
import { generic } from './generic';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import type { Adapter } from './types';
import { workday } from './workday';

// Checked in order; the generic label matcher is the fallback.
const ADAPTERS: Adapter[] = [greenhouse, lever, ashby, workday];

export function pickAdapter(loc: Location, doc: Document): Adapter {
  return ADAPTERS.find((a) => a.matches(loc, doc)) ?? generic;
}
