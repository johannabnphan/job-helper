import type { FillPayload } from '../../shared/messages';
import type { FieldHandle } from '../fields';

/**
 * Site-specific knowledge layered over the generic label matcher. Every hook
 * is optional: an adapter only overrides what the generic logic gets wrong.
 */
export interface Adapter {
  name: string;
  matches(loc: Location, doc: Document): boolean;
  /** Container that holds the application form. */
  root?(doc: Document): ParentNode | null;
  /** Better question text for a control than the generic heuristics find. */
  label?(el: HTMLElement): string | undefined;
  /** Exact field identity (profile key, section, entry index) from known ids. */
  describe?(f: FieldHandle): Partial<FieldHandle> | undefined;
  /** Controls to ignore. */
  skip?(el: HTMLElement): boolean;
  /** Custom widgets the generic scan can't see (e.g. Yes/No button pairs). */
  extraFields?(root: ParentNode): FieldHandle[];
  /** Extra things to tell the user, e.g. "click Add for your other jobs". */
  notes?(doc: Document, payload: FillPayload): Array<{ anchor: HTMLElement; message: string }>;
}
