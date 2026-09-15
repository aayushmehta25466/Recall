import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../database/indexeddb/db.js', () => ({
  getActiveBookmarks: jest.fn().mockResolvedValue([]),
  trashBookmark: jest.fn().mockResolvedValue(undefined),
}));

const { getActiveBookmarks, trashBookmark } = await import('../database/indexeddb/db.js');
const { collectLiveUrls, reconcileRemovedBookmarks } = await import('../core/sync-engine/reconcile.js');

const tree = [{
  id: '0',
  title: '',
  children: [{
    id: '1',
    title: 'Bookmarks Bar',
    children: [{
      id: 'engine',
      title: 'Engine Organized',
      children: [
        { id: 'b1', title: 'A', url: 'https://a.example/page' },
        { id: 'b2', title: 'B', url: 'https://b.example/x?utm_source=news' },
      ],
    }],
  }],
}];

describe('collectLiveUrls', () => {
  test('collects and normalizes nested bookmark URLs', () => {
    const urls = collectLiveUrls(tree);
    expect(urls.has('https://a.example/page')).toBe(true);
    expect(urls.has('https://b.example/x')).toBe(true); // tracking param stripped
    expect(urls.size).toBe(2);
  });

  test('handles empty and undefined trees', () => {
    expect(collectLiveUrls([]).size).toBe(0);
    expect(collectLiveUrls(undefined).size).toBe(0);
  });
});

describe('reconcileRemovedBookmarks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trashBookmark.mockResolvedValue(undefined);
  });

  test('trashes only bookmarks missing from Chrome', async () => {
    getActiveBookmarks.mockResolvedValue([
      { url: 'https://a.example/page' },               // present
      { url: 'https://b.example/x?utm_source=news' },  // present after normalization
      { url: 'https://gone.example/y' },               // missing
    ]);

    const trashed = [];
    const result = await reconcileRemovedBookmarks(tree, { onTrashed: (b) => trashed.push(b.url) });

    expect(result).toEqual({ checked: 3, trashed: 1 });
    expect(trashBookmark).toHaveBeenCalledTimes(1);
    expect(trashBookmark).toHaveBeenCalledWith('https://gone.example/y');
    expect(trashed).toEqual(['https://gone.example/y']);
  });

  test('skips an empty tree instead of trashing the whole library', async () => {
    getActiveBookmarks.mockResolvedValue([{ url: 'https://a.example/page' }]);

    const result = await reconcileRemovedBookmarks([]);

    expect(result).toEqual({ checked: 0, trashed: 0, skipped: 'empty-tree' });
    expect(trashBookmark).not.toHaveBeenCalled();
  });
});
