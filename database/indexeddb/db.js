import { openDB } from 'idb';

const DB_NAME = 'recall-db';
const DB_VERSION = 4; // v4 backfills isTrashed on legacy records
const STORE_NAME = 'bookmarks';

let dbPromise = null;

/**
 * Backfill the trash fields on a record written before they existed.
 * Returns an updated copy, or null when nothing needs changing.
 *
 * Records with no `isTrashed` match neither the 0 nor the 1 index entry, so they
 * were invisible to Home, search, the compound-category query, and reconciliation.
 */
export function normalizeTrashFields(record) {
  if (!record || record.isTrashed !== undefined) return null;
  return { ...record, isTrashed: 0, trashedAt: record.trashedAt ?? null };
}

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, newVersion, tx) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Fresh install — create store with all indexes
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('category', 'category');
          store.createIndex('dateAdded', 'dateAdded');
          store.createIndex('isTrashed', 'isTrashed');
          store.createIndex('sortOrder', 'sortOrder');
          // Compound index for the most common query: active bookmarks by category
          store.createIndex('category_isTrashed', ['category', 'isTrashed']);
          return;
        }

        const store = tx.objectStore(STORE_NAME);

        // v2 → v3: add the compound index if missing
        if (oldVersion < 3 && !store.indexNames.contains('category_isTrashed')) {
          store.createIndex('category_isTrashed', ['category', 'isTrashed']);
        }

        // v3 → v4: backfill isTrashed on legacy records
        if (oldVersion < 4) {
          let cursor = await store.openCursor();
          while (cursor) {
            const normalized = normalizeTrashFields(cursor.value);
            if (normalized) await cursor.update(normalized);
            cursor = await cursor.continue();
          }
        }
      },
      blocked() {
        console.warn(
          'Recall: IndexedDB upgrade blocked — another tab/worker (often an older ' +
          'copy of the extension) is still holding "recall-db" open. Close other ' +
          'extension pages, or remove the duplicate extension, then reload.'
        );
      },
    }).catch((err) => {
      // IndexedDB refuses to downgrade. If "recall-db" was written by a NEWER build
      // than this one (e.g. an older build, or a duplicate install, is loaded), the
      // open fails with VersionError. Open the existing database as-is so search and
      // sync keep working instead of the worker failing to boot.
      if (err && err.name === 'VersionError') {
        console.warn(
          `Recall: "recall-db" is at a newer version than this build expects (${DB_VERSION}). ` +
          'Opening it read/write as-is — reload/update the extension to the matching build.'
        );
        return openDB(DB_NAME);
      }
      throw err;
    });
  }
  return dbPromise;
}

export async function saveBookmark(bookmark) {
  const db = await initDB();
  await db.put(STORE_NAME, bookmark);
  return bookmark;
}

export async function getBookmark(url) {
  const db = await initDB();
  return db.get(STORE_NAME, url);
}

export async function getAllBookmarks() {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function deleteBookmark(url) {
  const db = await initDB();
  return db.delete(STORE_NAME, url);
}

export async function updateBookmark(url, fields) {
  const db = await initDB();
  const existing = await db.get(STORE_NAME, url);
  if (!existing) return null;
  const updated = { ...existing, ...fields, dateUpdated: new Date().toISOString() };
  await db.put(STORE_NAME, updated);
  return updated;
}

/**
 * Get all non-trashed bookmarks using the isTrashed index.
 * Legacy records are normalized to `isTrashed: 0` by the v4 migration, so the
 * index is complete.
 */
export async function getActiveBookmarks() {
  const db = await initDB();
  return db.getAllFromIndex(STORE_NAME, 'isTrashed', 0);
}

/**
 * Get bookmarks by category using the compound index.
 * Much faster than loading all bookmarks and filtering.
 */
export async function getBookmarksByCategory(category) {
  const db = await initDB();
  // Use compound index: category + isTrashed = 0
  return db.getAllFromIndex(STORE_NAME, 'category_isTrashed', [category, 0]);
}

/**
 * Get trashed bookmarks using the isTrashed index.
 */
export async function getTrashedBookmarks() {
  const db = await initDB();
  return db.getAllFromIndex(STORE_NAME, 'isTrashed', 1);
}

export async function trashBookmark(url) {
  return updateBookmark(url, {
    isTrashed: 1, // Use 1 instead of true for better index performance
    trashedAt: new Date().toISOString(),
  });
}

export async function restoreBookmark(url) {
  return updateBookmark(url, {
    isTrashed: 0,
    trashedAt: null,
  });
}

export async function emptyTrash() {
  const trashed = await getTrashedBookmarks();
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const b of trashed) {
    await tx.store.delete(b.url);
  }
  await tx.done;
  return trashed.length;
}

export async function purgeOldTrash(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  const trashed = await getTrashedBookmarks();
  const now = Date.now();
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  let count = 0;
  for (const b of trashed) {
    if (b.trashedAt && (now - new Date(b.trashedAt).getTime()) > maxAgeMs) {
      await tx.store.delete(b.url);
      count++;
    }
  }
  await tx.done;
  return count;
}

export async function saveBookmarks(bookmarks) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const b of bookmarks) {
    await tx.store.put(b);
  }
  await tx.done;
}

export async function deleteBookmarks(urls) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const url of urls) {
    await tx.store.delete(url);
  }
  await tx.done;
}

export async function clearAllBookmarks() {
  const db = await initDB();
  await db.clear(STORE_NAME);
}
