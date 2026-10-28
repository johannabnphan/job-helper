// Content script entry. The side panel injects this file into every frame of
// the tab, then calls window.__jobHelper.fill(payload) in each frame.
// It fills fields and highlights what needs review. It never submits.
import type { FillPayload, FillReport } from '../shared/messages';
import { pickAdapter } from './adapters';
import { fillDocument } from './engine';
import { overlay } from './overlay';

interface JobHelperApi {
  fill(payload: FillPayload): Promise<FillReport>;
  clear(): void;
}

declare global {
  interface Window {
    __jobHelper?: JobHelperApi;
  }
}

if (!window.__jobHelper) {
  window.__jobHelper = {
    async fill(payload) {
      const adapter = pickAdapter(location, document);
      try {
        return await fillDocument(document, adapter, payload);
      } catch (err) {
        return { url: location.href, adapter: adapter.name, fields: [], error: String(err) };
      }
    },
    clear() {
      overlay.clear();
    },
  };
}
