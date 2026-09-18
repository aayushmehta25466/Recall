/**
 * Cross-context lock for the AI batch workflow.
 *
 * `runBatchCategorize()` runs in whichever context calls it — the options page
 * (Review-tab button) or the service worker (auto-AI on save). Both write to the
 * same IndexedDB, so without a lock the two can overlap and double-process (and
 * double-spend API tokens).
 *
 * Persisted in chrome.storage.local with a TTL so a worker killed mid-run can't
 * hold the lock forever.
 */
const KEY = 'aiBatchLock';
const TTL_MS = 5 * 60 * 1000;

function readLock() {
  return new Promise((resolve) => {
    chrome.storage.local.get(KEY, (data) => resolve(data?.[KEY] || null));
  });
}

export async function acquireAiBatchLock() {
  const held = await readLock();
  if (held && Date.now() - held.startedAt < TTL_MS) return false;

  await new Promise((resolve) => {
    chrome.storage.local.set({ [KEY]: { startedAt: Date.now() } }, resolve);
  });
  return true;
}

export async function releaseAiBatchLock() {
  await new Promise((resolve) => {
    chrome.storage.local.remove(KEY, resolve);
  });
}
