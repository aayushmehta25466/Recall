import { openDB } from 'idb';

const DB_NAME = 'recall-db';
const DB_VERSION = 3; // Bump version for new indexes
const STORE_NAME = 'bookmarks';

let dbPromise = null;

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        let store;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Fresh install — create store with all indexes
          store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('category', 'category');
          store.createIndex('dateAdded', 'dateAdded');
          store.createIndex('isTrashed', 'isTrashed');
          store.createIndex('sortOrder', 'sortOrder');
          // Compound index for the most common query: active bookmarks by category
          store.createIndex('category_isTrashed', ['category', 'isTrashed']);
        } else if (oldVersion < 3) {
          // v2 → v3: add compound index if missing
          store = tx.objectStore(STORE_NAME);
          if (!store.indexNames.contains('category_isTrashed')) {
            store.createIndex('category_isTrashed', ['category', 'isTrashed']);
          }
        }
      },
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
 * Avoids loading trashed bookmarks into memory.
 */
export async function getActiveBookmarks() {
  const db = await initDB();
  const all = await db.getAllFromIndex(STORE_NAME, 'isTrashed', 0);
  // Index returns 0 for non-trashed, but we also need to handle
  // bookmarks where isTrashed is undefined (legacy records)
  const trashed = await db.getAllFromIndex(STORE_NAME, 'isTrashed', 1);
  const trashedUrls = new Set(trashed.map(b => b.url));
  return all.filter(b => !trashedUrls.has(b.url));
}

/**
 * Get all non-trashed bookmarks count using index cursor.
 * Much faster than loading all records for counting.
 */
export async function getBookmarkCount() {
  const db = await initDB();
  let count = 0;
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('isTrashed');
  // Count non-trashed (0) and undefined (legacy)
  count += await index.count(0);
  // Also count records where isTrashed is not set (legacy)
  const cursor = await tx.store.openCursor();
  if (cursor) {
    let c = cursor;
    while (c) {
      if (!c.value.isTrashed) count++;
      c = await c.continue();
    }
  }
  return count;
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
