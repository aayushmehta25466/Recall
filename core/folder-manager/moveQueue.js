/**
 * Persisted retry queue for native Chrome moves that failed.
 *
 * moveBookmarkToCategory() can fail transiently (folder API race, bookmark
 * deleted between save and move, service worker torn down mid-flight). Instead
 * of losing the move, the failure is recorded in chrome.storage.local and
 * retried on the next service-worker startup and after each sync.
 *
 * Entries are keyed by URL and dropped after MAX_MOVE_ATTEMPTS so a bookmark
 * that no longer exists can't retry forever.
 */
const STORAGE_KEY = 'pendingMoves';
export const MAX_MOVE_ATTEMPTS = 5;
const MAX_QUEUE_SIZE = 200;

// Serialize read-modify-write cycles so concurrent failures don't clobber each other.
let lock = Promise.resolve();
function withLock(fn) {
  const result = lock.then(fn, fn);
  lock = result.then(() => {}, () => {});
  return result;
}

function readAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      resolve(Array.isArray(data?.[STORAGE_KEY]) ? data[STORAGE_KEY] : []);
    });
  });
}

function writeAll(moves) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: moves }, resolve);
  });
}

/** Read the current queue (mainly for the UI / diagnostics). */
export function getPendingMoves() {
  return readAll();
}

/**
 * Record a failed move. Repeat failures for the same URL bump the attempt
 * counter instead of adding duplicates.
 */
export function enqueueFailedMove({ url, category, subcategory, reason = '' }) {
  if (!url) return Promise.resolve(0);

  return withLock(async () => {
    const moves = await readAll();
    const now = new Date().toISOString();
    const existing = moves.find((m) => m.url === url);

    if (existing) {
      existing.category = category;
      existing.subcategory = subcategory;
      existing.attempts = (existing.attempts || 0) + 1;
      existing.reason = reason || existing.reason;
      existing.updatedAt = now;
    } else {
      moves.push({
        url,
        category,
        subcategory,
        attempts: 1,
        reason,
        createdAt: now,
      });
    }

    await writeAll(moves.slice(-MAX_QUEUE_SIZE));
    return moves.length;
  });
}

/**
 * Retry every queued move with `moveFn(url, category, subcategory)`.
 * Successful moves are removed; failures keep their entry (bumping attempts),
 * and entries at MAX_MOVE_ATTEMPTS are dropped.
 */
export function retryPendingMoves(moveFn) {
  return withLock(async () => {
    const moves = await readAll();
    if (moves.length === 0) return { retried: 0, succeeded: 0, dropped: 0 };

    let succeeded = 0;
    let dropped = 0;
    const remaining = [];

    for (const move of moves) {
      let folderId = null;
      try {
        folderId = await moveFn(move.url, move.category, move.subcategory);
      } catch {
        folderId = null;
      }

      if (folderId) {
        succeeded++;
        continue;
      }

      move.attempts = (move.attempts || 0) + 1;
      move.updatedAt = new Date().toISOString();
      if (move.attempts >= MAX_MOVE_ATTEMPTS) dropped++;
      else remaining.push(move);
    }

    await writeAll(remaining);
    return { retried: moves.length, succeeded, dropped };
  });
}

/** Remove a single URL from the queue (e.g. after a manual move). */
export function clearPendingMove(url) {
  return withLock(async () => {
    const moves = (await readAll()).filter((m) => m.url !== url);
    await writeAll(moves);
    return moves.length;
  });
}
