import { jest, describe, test, expect, beforeEach } from '@jest/globals';

/**
 * End-to-end test of the native "Add bookmark" path.
 *
 * It loads the real background service worker (real folder manager, real fast
 * classifier, real metadata extractor) with an in-memory fake chrome.bookmarks
 * API, fires the same `bookmarks.onCreated` event Chrome fires when you use the
 * star / "Add bookmark" button, and asserts the bookmark ends up inside
 * "Engine Organized".
 */

// Only the storage/AI/network boundaries are mocked; the organizing logic runs for real.
jest.unstable_mockModule('../database/indexeddb/db.js', () => {
  const store = new Map();
  return {
    saveBookmark: jest.fn(async (b) => { store.set(b.url, b); return b; }),
    getBookmark: jest.fn(async (url) => store.get(url) || null),
    updateBookmark: jest.fn(async (url, fields) => {
      const cur = store.get(url);
      if (!cur) return null;
      const next = { ...cur, ...fields };
      store.set(url, next);
      return next;
    }),
    trashBookmark: jest.fn(),
    restoreBookmark: jest.fn(),
    emptyTrash: jest.fn(),
    purgeOldTrash: jest.fn(async () => 0),
    getTrashedBookmarks: jest.fn(async () => []),
    getAllBookmarks: jest.fn(async () => [...store.values()]),
    getActiveBookmarks: jest.fn(async () => [...store.values()]),
    getBookmarksByCategory: jest.fn(async () => []),
    saveBookmarks: jest.fn(),
    clearAllBookmarks: jest.fn(),
  };
});

jest.unstable_mockModule('../core/search-index/search.js', () => ({
  searchBookmarks: jest.fn(async () => []),
  buildSearchIndex: jest.fn(async () => ({ count: 0 })),
  indexBookmark: jest.fn(),
  removeFromIndex: jest.fn(),
}));

jest.unstable_mockModule('../core/ai-classifier/batchCategorizer.js', () => ({
  runBatchCategorize: jest.fn(async () => ({ processed: 0, categorized: 0 })),
  getUncategorizedBookmarks: jest.fn(async () => []),
}));

jest.unstable_mockModule('../core/ai-classifier/classifier.js', () => ({
  classifyWithAI: jest.fn(async () => null),
}));

/** In-memory fake of the chrome.bookmarks tree, keyed by Chrome ids. */
function createChromeMock({ barId = '1', barTitle = 'Bookmarks Bar' } = {}) {
  let nextId = 100;
  const nodes = new Map();
  const listeners = { created: [], removed: [], changed: [], moved: [] };

  nodes.set('0', { id: '0', title: '', children: ['1', '2'] });
  nodes.set(barId, { id: barId, title: barTitle, parentId: '0', children: [] });
  nodes.set('2', { id: '2', title: 'Other Bookmarks', parentId: '0', children: [] });

  const childrenOf = (id) => (nodes.get(id)?.children || []).map((cid) => nodes.get(cid));

  const bookmarks = {
    async getTree() {
      const build = (id) => {
        const node = nodes.get(id);
        if (!node) return null;
        const out = { id: node.id, title: node.title };
        if (node.url) out.url = node.url;
        const kids = childrenOf(id);
        if (kids.length || !node.url) out.children = kids.map((k) => build(k.id));
        return out;
      };
      return [build('0')];
    },
    async getChildren(parentId) {
      return childrenOf(parentId);
    },
    async get(ids) {
      const arr = Array.isArray(ids) ? ids : [ids];
      return arr.map((id) => {
        const n = nodes.get(id);
        if (!n) throw new Error(`No bookmark with id ${id}`);
        return n;
      });
    },
    async search({ url }) {
      return [...nodes.values()].filter((n) => n.url === url);
    },
    async create({ parentId, title, url }) {
      const id = String(nextId++);
      const node = { id, title, parentId, children: [], ...(url ? { url } : {}) };
      nodes.set(id, node);
      nodes.get(parentId).children.push(id);
      return node;
    },
    async move(id, { parentId }) {
      const node = nodes.get(id);
      const oldParentId = node.parentId;
      const old = nodes.get(oldParentId);
      old.children = old.children.filter((c) => c !== id);
      node.parentId = parentId;
      nodes.get(parentId).children.push(id);
      for (const fn of listeners.moved) fn(id, { parentId, oldParentId });
      return node;
    },
    async remove(id) { nodes.delete(id); },
    async removeTree(id) { nodes.delete(id); },
    onCreated: { addListener: (fn) => listeners.created.push(fn) },
    onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
    onChanged: { addListener: (fn) => listeners.changed.push(fn) },
    onMoved: { addListener: (fn) => listeners.moved.push(fn) },
  };

  /** Add a bookmark exactly like the native UI would (then fire onCreated). */
  function nativeAdd({ id, title, url, parentId = '2' }) {
    const node = { id, title, url, parentId, children: [] };
    nodes.set(id, node);
    nodes.get(parentId).children.push(id);
    for (const fn of listeners.created) fn(id, { ...node });
    return node;
  }

  /** Path of a node, skipping the invisible root, e.g. "Bookmarks Bar / Engine Organized / …". */
  function pathOf(id) {
    const parts = [];
    const node = nodes.get(id);
    let parent = node ? nodes.get(node.parentId) : null;
    while (parent && parent.parentId) {
      parts.unshift(parent.title);
      parent = nodes.get(parent.parentId);
    }
    return parts.join(' / ');
  }

  return { nodes, listeners, bookmarks, nativeAdd, pathOf };
}

function installChrome(mock) {
  const storage = {};
  globalThis.chrome = {
    bookmarks: mock.bookmarks,
    storage: {
      sync: {
        get(_keys, cb) { cb({ ...storage }); },
        set(values, cb) { Object.assign(storage, values); cb && cb(); },
      },
      local: {
        get(key, cb) {
          const out = {};
          if (typeof key === 'string') out[key] = storage[key];
          else Object.assign(out, storage);
          cb(out);
        },
        set(values, cb) { Object.assign(storage, values); cb && cb(); },
        remove(key, cb) { delete storage[key]; cb && cb(); },
      },
    },
    runtime: {
      getManifest: () => ({ version: 'test' }),
      onInstalled: { addListener() {} },
      onConnect: { addListener() {} },
      onMessage: { addListener() {} },
      sendMessage: (_msg, cb) => { cb && cb(undefined); },
    },
    commands: { onCommand: { addListener() {} } },
  };
}

async function waitFor(predicate, { timeout = 3000, step = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}

// ── Module-level setup ────────────────────────────────────────────────────
// These imports must be top-level dynamic imports so Jest evaluates this file
// as ESM (that is what makes jest.unstable_mockModule take effect).
const mock = createChromeMock();
installChrome(mock);
globalThis.fetch = jest.fn(async () => ({
  ok: true,
  headers: { get: () => 'text/html' },
  text: async () => '<html><head><title>Repo</title></head></html>',
}));

// init() installs a 10-minute safety timer; unref the long ones so Jest exits.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const longTimers = [];
globalThis.setTimeout = (fn, ms, ...rest) => {
  const id = realSetTimeout(fn, ms, ...rest);
  if (ms >= 600000) longTimers.push(id);
  return id;
};

const { getBookmark } = await import('../database/indexeddb/db.js');
await import('../extension/background/background.js');

globalThis.setTimeout = realSetTimeout;
afterAll(() => {
  for (const id of longTimers) realClearTimeout(id);
});

describe('Native bookmark creation auto-organize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<html><head><title>Repo</title></head></html>',
    }));
  });

  test('a bookmark added via the native UI is filed under Engine Organized', async () => {
    // Known domain (github.com → Development) saved into "Other Bookmarks".
    mock.nativeAdd({
      id: '200',
      title: 'acme/repo',
      url: 'https://github.com/acme/repo',
      parentId: '2',
    });
    // Unknown domain should still be filed, under Uncategorized.
    mock.nativeAdd({
      id: '201',
      title: 'Some page',
      url: 'https://unknown.example/x',
      parentId: '2',
    });

    const knownFiled = await waitFor(() => mock.pathOf('200').startsWith('Bookmarks Bar / Engine Organized'));
    const unknownFiled = await waitFor(() => mock.pathOf('201').startsWith('Bookmarks Bar / Engine Organized'));

    expect(knownFiled).toBe(true);
    expect(mock.pathOf('200'))
      .toBe('Bookmarks Bar / Engine Organized / Development / Languages & Tools / Open Source');

    expect(unknownFiled).toBe(true);
    expect(mock.pathOf('201')).toBe('Bookmarks Bar / Engine Organized / Uncategorized');

    expect((await getBookmark('https://github.com/acme/repo')).chromeFolder)
      .toBe('Engine Organized / Development / Languages & Tools / Open Source');
  });

  test('re-files a bookmark the native dialog moves out right after saving', async () => {
    // The star bubble creates the node, we file it, then Chrome moves it to the
    // folder the user picked — this used to be the final word.
    const folderId = '999';
    mock.nodes.set(folderId, { id: folderId, title: 'Random Folder', parentId: '2', children: [] });
    mock.nodes.get('2').children.push(folderId);

    await mock.bookmarks.move('200', { parentId: folderId });
    expect(mock.pathOf('200')).toBe('Other Bookmarks / Random Folder');

    const refiled = await waitFor(() => mock.pathOf('200').startsWith('Bookmarks Bar / Engine Organized'));
    expect(refiled).toBe(true);
    expect(mock.pathOf('200'))
      .toBe('Bookmarks Bar / Engine Organized / Development / Languages & Tools / Open Source');
  });
});
