import {
  getFolderPath,
  getTargetFolderId,
  getBookmarksBarNode,
  moveBookmarkToCategory,
  clearFolderCache,
} from '../core/folder-manager/manager.js';
import { parseEngineFolderPath } from '../core/folder-manager/paths.js';

/**
 * Minimal in-memory fake of the chrome.bookmarks API.
 * Builds a tree with the guaranteed root nodes "0" (root), "1" (bar), "2" (other).
 */
function createChromeMock(bookmarks = []) {
  let nextId = 100;
  const store = new Map();
  store.set('0', { id: '0', title: '', children: ['1', '2'] });
  store.set('1', { id: '1', title: 'Bookmarks Bar', parentId: '0', children: [] });
  store.set('2', { id: '2', title: 'Other Bookmarks', parentId: '0', children: [] });

  for (const b of bookmarks) {
    const id = String(nextId++);
    const parentId = b.parentId || '2';
    store.set(id, { id, title: b.title || '', url: b.url, parentId, children: [] });
    store.get(parentId).children.push(id);
  }

  const childrenOf = (id) => (store.get(id)?.children || []).map(cid => store.get(cid));

  const chromeMock = {
    bookmarks: {
      calls: { get: [], search: [], move: [], getTree: 0 },
      async getTree() {
        chromeMock.bookmarks.calls.getTree++;
        const build = (id) => {
          const node = store.get(id);
          if (!node) return null;
          const out = { id: node.id, title: node.title };
          if (node.url) out.url = node.url;
          const kids = childrenOf(id);
          if (kids.length) out.children = kids.map(k => build(k.id));
          else if (!node.url) out.children = [];
          return out;
        };
        return [build('0')];
      },
      async getChildren(parentId) {
        return childrenOf(parentId);
      },
      async get(ids) {
        const arr = Array.isArray(ids) ? ids : [ids];
        chromeMock.bookmarks.calls.get.push(arr);
        return arr.map(id => {
          const node = store.get(id);
          if (!node) throw new Error(`No bookmark with id ${id}`);
          return node;
        });
      },
      async search({ url }) {
        chromeMock.bookmarks.calls.search.push(url);
        return [...store.values()].filter(n => n.url === url);
      },
      async create({ parentId, title }) {
        const id = String(nextId++);
        store.set(id, { id, title, parentId, children: [] });
        store.get(parentId).children.push(id);
        return store.get(id);
      },
      async move(id, { parentId }) {
        chromeMock.bookmarks.calls.move.push({ id, parentId });
        const node = store.get(id);
        const oldParent = store.get(node.parentId);
        oldParent.children = oldParent.children.filter(c => c !== id);
        node.parentId = parentId;
        store.get(parentId).children.push(id);
        return node;
      },
    },
    store,
  };
  return chromeMock;
}

/** Walk up the tree and return the full folder path containing a node. */
function pathOf(store, id) {
  const parts = [];
  const node = store.get(id);
  let current = node ? store.get(node.parentId) : null;
  while (current && current.parentId) {
    parts.unshift(current.title);
    current = store.get(current.parentId);
  }
  return parts.join(' / ');
}

describe('Folder Manager', () => {
  beforeEach(() => {
    clearFolderCache();
  });

  describe('getFolderPath', () => {
    test('builds a path with a subcategory', () => {
      expect(getFolderPath('Development', 'Web / Frontend'))
        .toBe('Engine Organized / Development / Web / Frontend');
    });

    test('builds a path without a subcategory', () => {
      expect(getFolderPath('Uncategorized', ''))
        .toBe('Engine Organized / Uncategorized');
    });
  });

  describe('moveBookmarkToCategory', () => {
    test('moves by Chrome ID without a URL lookup', async () => {
      globalThis.chrome = createChromeMock([
        { url: 'https://github.com/acme/repo', title: 'Repo', parentId: '2' },
      ]);
      const [node] = await globalThis.chrome.bookmarks.search({ url: 'https://github.com/acme/repo' });
      globalThis.chrome.bookmarks.calls.search = []; // ignore the setup lookup

      const targetId = await moveBookmarkToCategory(
        'https://github.com/acme/repo', 'Development', 'Web / Frontend', node.id
      );

      expect(targetId).toBeTruthy();
      expect(globalThis.chrome.bookmarks.calls.get).toEqual([[node.id]]);
      expect(globalThis.chrome.bookmarks.calls.search).toEqual([]);
      expect(pathOf(globalThis.chrome.store, node.id))
        .toBe('Bookmarks Bar / Engine Organized / Development / Web / Frontend');
    });

    test('falls back to URL lookup when the Chrome ID is stale', async () => {
      globalThis.chrome = createChromeMock([
        { url: 'https://example.com/a', title: 'A', parentId: '2' },
      ]);
      const [node] = await globalThis.chrome.bookmarks.search({ url: 'https://example.com/a' });

      const targetId = await moveBookmarkToCategory(
        'https://example.com/a', 'Learning', 'Content / Tutorials', 'stale-id'
      );

      expect(targetId).toBeTruthy();
      expect(globalThis.chrome.bookmarks.calls.search).toContain('https://example.com/a');
      expect(pathOf(globalThis.chrome.store, node.id))
        .toBe('Bookmarks Bar / Engine Organized / Learning / Content / Tutorials');
    });

    test('files unmatched bookmarks under Uncategorized', async () => {
      globalThis.chrome = createChromeMock([
        { url: 'https://unknown.example/x', title: 'X', parentId: '2' },
      ]);
      const [node] = await globalThis.chrome.bookmarks.search({ url: 'https://unknown.example/x' });

      await moveBookmarkToCategory('https://unknown.example/x', 'Uncategorized', '', node.id);

      expect(pathOf(globalThis.chrome.store, node.id))
        .toBe('Bookmarks Bar / Engine Organized / Uncategorized');
    });

    test('returns null when the bookmark is not in Chrome', async () => {
      globalThis.chrome = createChromeMock([]);

      const targetId = await moveBookmarkToCategory(
        'https://missing.example/x', 'Development', 'Web / Frontend', 'nope'
      );

      expect(targetId).toBeNull();
    });

    test('returns null when there is no bookmarks bar', async () => {
      globalThis.chrome = createChromeMock([]);
      globalThis.chrome.bookmarks.getTree = async () => [{ id: '0', children: [] }];

      const targetId = await getTargetFolderId('Development', 'Web / Frontend');
      expect(targetId).toBeNull();
    });

    test('falls back to the first root folder when the bar id is not "1"', async () => {
      // e.g. Firefox ids — previously every move failed with "Could not find Bookmarks Bar"
      const created = [];
      globalThis.chrome = {
        bookmarks: {
          async getTree() {
            return [{ id: 'root________', children: [
              { id: 'toolbar_____', title: 'Bookmarks Toolbar', children: [] },
              { id: 'menu________', title: 'Bookmarks Menu', children: [] },
            ] }];
          },
          async getChildren() { return []; },
          async get() { return []; },
          async create({ parentId, title }) {
            const node = { id: `f${created.length}`, title, parentId, children: [] };
            created.push(node);
            return node;
          },
          async move() {},
          async search() { return []; },
        },
      };

      const targetId = await getTargetFolderId('Development', 'Web / Frontend');

      expect(targetId).toBeTruthy();
      expect(created.map((n) => n.title))
        .toEqual(['Engine Organized', 'Development', 'Web', 'Frontend']);
    });

    test('resolves the Bookmarks Bar once and reuses it for later moves', async () => {
      globalThis.chrome = createChromeMock([
        { url: 'https://example.com/one', title: 'One', parentId: '2' },
        { url: 'https://example.com/two', title: 'Two', parentId: '2' },
      ]);

      await moveBookmarkToCategory('https://example.com/one', 'Development', 'Web / Frontend');
      await moveBookmarkToCategory('https://example.com/two', 'Development', 'Web / Frontend');

      // One tree fetch for both moves — previously every move refetched the tree
      expect(globalThis.chrome.bookmarks.calls.getTree).toBe(1);
    });

    test('shares a single bar lookup across concurrent moves', async () => {
      const urls = [1, 2, 3, 4, 5].map((n) => `https://example.com/${n}`);
      globalThis.chrome = createChromeMock(
        urls.map((url, i) => ({ url, title: `Item ${i}`, parentId: '2' }))
      );

      await Promise.all(
        urls.map((url) => moveBookmarkToCategory(url, 'Learning', 'Content / Tutorials'))
      );

      // Concurrent callers must share one retry loop, not run five of them
      expect(globalThis.chrome.bookmarks.calls.getTree).toBe(1);
    });

    test('retries while the bookmark tree is still empty', async () => {
      const mock = createChromeMock([]);
      const getPopulatedTree = mock.bookmarks.getTree;
      let treeCalls = 0;
      mock.bookmarks.getTree = async () => {
        treeCalls++;
        // A cold service worker sees an unpopulated tree for the first calls
        return treeCalls <= 2 ? [{ id: '0', children: [] }] : getPopulatedTree();
      };
      globalThis.chrome = mock;

      const barNode = await getBookmarksBarNode({ delayMs: 1 });

      expect(barNode).toEqual({ id: '1', title: 'Bookmarks Bar' });
    });
  });
});

describe('parseEngineFolderPath', () => {
  test('reads category and subcategory from an engine path', () => {
    expect(parseEngineFolderPath('Engine Organized / Development / Web / Frontend'))
      .toEqual({ category: 'Development', subcategory: 'Web / Frontend' });
  });

  test('matches the root and category case-insensitively', () => {
    expect(parseEngineFolderPath('engine organized / development / web / frontend'))
      .toEqual({ category: 'Development', subcategory: 'Web / Frontend' });
  });

  test('tolerates a browser bar prefix (Firefox shape)', () => {
    expect(parseEngineFolderPath('Bookmarks Toolbar / Engine Organized / Learning / Content / Tutorials'))
      .toEqual({ category: 'Learning', subcategory: 'Content / Tutorials' });
  });

  test('falls back to Uncategorized for an unknown category folder', () => {
    expect(parseEngineFolderPath('Engine Organized / Nope / X'))
      .toEqual({ category: 'Uncategorized', subcategory: '' });
  });

  test('handles the engine root with no category folder', () => {
    expect(parseEngineFolderPath('Engine Organized'))
      .toEqual({ category: 'Uncategorized', subcategory: '' });
  });

  test('returns null outside the engine tree', () => {
    expect(parseEngineFolderPath('My Stuff / Web')).toBeNull();
    expect(parseEngineFolderPath('')).toBeNull();
    expect(parseEngineFolderPath(undefined)).toBeNull();
  });
});
