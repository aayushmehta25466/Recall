import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Controllable settings for the AI-fallback test
let mockSettings = { autoOrganize: true, openrouterApiKey: '' };

jest.unstable_mockModule('../database/indexeddb/db.js', () => ({
  saveBookmark: jest.fn().mockResolvedValue(undefined),
  getBookmark: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../core/folder-manager/manager.js', () => ({
  moveBookmarkToCategory: jest.fn().mockResolvedValue('target-folder-id'),
  cleanupEmptyFolders: jest.fn().mockResolvedValue(undefined),
  clearFolderCache: jest.fn(),
  mergeDuplicateEngineFolders: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../core/ai-classifier/classifier.js', () => ({
  classifyWithAI: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../shared/settings.js', () => ({
  getSettings: jest.fn(async () => ({ ...mockSettings })),
}));

const { saveBookmark, getBookmark } = await import('../database/indexeddb/db.js');
const { moveBookmarkToCategory } = await import('../core/folder-manager/manager.js');
const { classifyWithAI } = await import('../core/ai-classifier/classifier.js');
const { runBulkSync } = await import('../core/sync-engine/bulk.js');

/**
 * Build a getTree() response for a single bookmark under a folder chain.
 * `folderPath` segments sit under the bar, e.g. ['Engine Organized', 'Development'].
 */
function treeWith(folderPath, url, { barId = '1', barTitle = 'Bookmarks Bar', title = 'Bookmark' } = {}) {
  let node = { id: 'leaf', title, url };
  for (let i = folderPath.length - 1; i >= 0; i--) {
    node = { id: `f${i}`, title: folderPath[i], children: [node] };
  }
  return [{
    id: '0',
    title: '',
    children: [{ id: barId, title: barTitle, children: [node] }],
  }];
}

function installChromeMock(tree) {
  globalThis.chrome = {
    bookmarks: { getTree: jest.fn().mockResolvedValue(tree) },
    runtime: { sendMessage: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('Bulk sync processBookmark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getBookmark.mockResolvedValue(null);
    mockSettings = { autoOrganize: true, openrouterApiKey: '' };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '',
    });
  });

  test('already-organized bookmark is not re-fetched, re-classified, or re-moved', async () => {
    const url = 'https://react.dev/reference/react';
    installChromeMock(treeWith(['Engine Organized', 'Development', 'Web', 'Frontend'], url));

    await runBulkSync(true);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(moveBookmarkToCategory).not.toHaveBeenCalled();
    expect(saveBookmark).toHaveBeenCalledTimes(1);
    expect(saveBookmark.mock.calls[0][0]).toMatchObject({
      url,
      category: 'Development',
      subcategory: 'Web / Frontend',
      chromeFolder: 'Engine Organized / Development / Web / Frontend',
    });
  });

  test('detects the engine tree even when the browser bar id is not "1" (Firefox)', async () => {
    const url = 'https://react.dev/reference/react';
    installChromeMock(treeWith(['Engine Organized', 'Development', 'Web', 'Frontend'], url, {
      barId: 'toolbar_____',
      barTitle: 'Bookmarks Toolbar',
    }));

    await runBulkSync(true);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(moveBookmarkToCategory).not.toHaveBeenCalled();
    // The bar never leaks into the stored path
    expect(saveBookmark.mock.calls[0][0].chromeFolder)
      .toBe('Engine Organized / Development / Web / Frontend');
  });

  test('tolerates the engine tree nested under other folders', async () => {
    const url = 'https://example.com/a';
    installChromeMock(treeWith(['Archive', 'Engine Organized', 'Learning', 'Content', 'Tutorials'], url));

    await runBulkSync(true);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(saveBookmark.mock.calls[0][0]).toMatchObject({
      category: 'Learning',
      subcategory: 'Content / Tutorials',
    });
  });

  test('unknown category folder becomes Uncategorized without AI', async () => {
    const url = 'https://example.com/bogus';
    installChromeMock(treeWith(['Engine Organized', 'NotACategory', 'Nope'], url));

    await runBulkSync(true);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(moveBookmarkToCategory).not.toHaveBeenCalled();
    expect(saveBookmark.mock.calls[0][0]).toMatchObject({
      category: 'Uncategorized',
      subcategory: '',
    });
  });

  test('DB-categorized bookmark sitting in a user folder is left alone', async () => {
    const url = 'https://github.com/acme/repo';
    installChromeMock(treeWith(['My Stuff'], url));
    getBookmark.mockResolvedValue({
      url,
      category: 'Development',
      subcategory: 'Languages & Tools / Open Source',
    });

    await runBulkSync(true);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(moveBookmarkToCategory).not.toHaveBeenCalled();
  });

  test('DB-categorized but unplaced bookmark is moved without re-fetching', async () => {
    const url = 'https://github.com/acme/repo';
    installChromeMock(treeWith([], url)); // directly under the bar → no folder yet
    getBookmark.mockResolvedValue({
      url,
      category: 'Development',
      subcategory: 'Languages & Tools / Open Source',
    });

    await runBulkSync(true);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(moveBookmarkToCategory).toHaveBeenCalledWith(
      url,
      'Development',
      'Languages & Tools / Open Source'
    );
  });

  test('genuinely new bookmarks are fetched and classified (AI fallback)', async () => {
    const url = 'https://unknown.example/x';
    installChromeMock(treeWith([], url));
    mockSettings = { autoOrganize: true, openrouterApiKey: 'sk-test' };

    await runBulkSync(true);

    expect(globalThis.fetch).toHaveBeenCalledWith(url, { redirect: 'follow' });
    expect(classifyWithAI).toHaveBeenCalled();
  });

  test('re-running sync over an organized tree is a no-op (idempotent)', async () => {
    const urls = ['https://a.example/', 'https://b.example/', 'https://c.example/'];
    const tree = [{
      id: '0',
      title: '',
      children: [{
        id: '1',
        title: 'Bookmarks Bar',
        children: [{
          id: 'engine',
          title: 'Engine Organized',
          children: [{
            id: 'dev',
            title: 'Development',
            children: [{
              id: 'web',
              title: 'Web',
              children: [{
                id: 'front',
                title: 'Frontend',
                children: urls.map((u, i) => ({ id: `bm${i}`, title: `BM ${i}`, url: u })),
              }],
            }],
          }],
        }],
      }],
    }];
    installChromeMock(tree);

    await runBulkSync(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(moveBookmarkToCategory).not.toHaveBeenCalled();

    globalThis.fetch.mockClear();
    classifyWithAI.mockClear();
    moveBookmarkToCategory.mockClear();

    await runBulkSync(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(moveBookmarkToCategory).not.toHaveBeenCalled();
  });
});
