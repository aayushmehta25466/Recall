import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// The Review tab reads its queue from getUncategorizedBookmarks(); cover the
// filtering contract so manually reviewed items leave the queue.
jest.unstable_mockModule('../database/indexeddb/db.js', () => ({
  getActiveBookmarks: jest.fn(),
  updateBookmark: jest.fn(),
}));

const { getActiveBookmarks } = await import('../database/indexeddb/db.js');
const { getUncategorizedBookmarks } = await import('../core/ai-classifier/batchCategorizer.js');

describe('review queue (getUncategorizedBookmarks)', () => {
  beforeEach(() => {
    getActiveBookmarks.mockReset();
  });

  test('returns only Uncategorized or empty-category bookmarks', async () => {
    getActiveBookmarks.mockResolvedValue([
      { url: 'https://a.example/', category: 'Uncategorized' },
      { url: 'https://b.example/', category: '' },
      { url: 'https://c.example/', category: 'Development' },
      { url: 'https://d.example/' },
    ]);

    const queue = await getUncategorizedBookmarks();
    expect(queue.map((b) => b.url)).toEqual([
      'https://a.example/',
      'https://b.example/',
      'https://d.example/',
    ]);
  });

  test('is empty once every bookmark is categorized', async () => {
    getActiveBookmarks.mockResolvedValue([{ url: 'https://c.example/', category: 'Design' }]);
    expect(await getUncategorizedBookmarks()).toEqual([]);
  });
});
