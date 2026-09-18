/**
 * Debounced, serialized auto-categorize scheduler.
 *
 * Bookmark creation files a bookmark under "Uncategorized". When the
 * `autoAiCategorize` setting is on, this runs the *batch* AI workflow over every
 * uncategorized bookmark — one request per 15 URLs rather than one request per
 * bookmark — which is what keeps the (large, fixed) taxonomy prompt from being
 * paid once per bookmark.
 *
 * Every side effect is injected so the decision logic is unit-testable without
 * chrome or a DOM.
 */
export function createAutoCategorizeQueue({
  runBatch,     // async (settings, onProgress) => { processed, categorized }
  getSettings,  // async () => settings
  isSyncing,    // () => boolean
  hasWork,      // async () => boolean — are there uncategorized bookmarks left?
  acquireLock,  // async () => boolean
  releaseLock,  // async () => void
  delayMs = 4000,
  log = () => {},
}) {
  let timer = null;
  let running = false;
  let pending = false;

  /** Coalesces a burst of saves into a single run. */
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { flush(); }, delayMs);
  }

  async function flush() {
    timer = null;
    let locked = false;

    try {
      const settings = await getSettings();
      if (!settings.autoAiCategorize) return log('off');
      if (!settings.openrouterApiKey) return log('no-key');
      if (isSyncing()) return log('syncing');
      if (!(await hasWork())) return log('nothing');
      if (!(await acquireLock())) {
        // Another context is mid-batch (the Review button, or our own previous run
        // that hasn't released yet). Retry after the backoff instead of overlapping.
        pending = true;
        schedule();
        return log('locked');
      }
      locked = true;
      pending = false;

      running = true;
      const { processed, categorized } = await runBatch(settings, (current, total) =>
        log('progress', current, total));
      log('done', categorized, processed);
    } catch (error) {
      log('error', error);
    } finally {
      running = false;
      if (locked) await releaseLock();
    }
  }

  return { schedule, flush, state: () => ({ running, pending }) };
}
