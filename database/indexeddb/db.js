import { openDB } from 'idb';

const DB_NAME = 'bookmark-engine-db';
const DB_VERSION = 2;
const STORE_NAME = 'bookmarks';

let dbPromise = null;

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        let store;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Fresh install or version 0 → create store with v1 indexes
          store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('category', 'category');
          store.createIndex('dateAdded', 'dateAdded');
        } else if (oldVersion < 2) {
          // v1 → v2: add new indexes to existing store
          store = tx.objectStore(STORE_NAME);
          if (!store.indexNames.contains('isTrashed')) {
            store.createIndex('isTrashed', 'isTrashed');
          }
          if (!store.indexNames.contains('sortOrder')) {
            store.createIndex('sortOrder', 'sortOrder');
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

export async function getActiveBookmarks() {
  const db = await initDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter(b => !b.isTrashed);
}

export async function getTrashedBookmarks() {
  const db = await initDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter(b => b.isTrashed);
}

export async function trashBookmark(url) {
  return updateBookmark(url, {
    isTrashed: true,
    trashedAt: new Date().toISOString(),
  });
}

export async function restoreBookmark(url) {
  return updateBookmark(url, {
    isTrashed: false,
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

export async function getBookmarksByCategory(category) {
  const all = await getActiveBookmarks();
  return all.filter(b => b.category === category);
}

export async function getBookmarkCount() {
  const all = await getAllBookmarks();
  return all.filter(b => !b.isTrashed).length;
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
