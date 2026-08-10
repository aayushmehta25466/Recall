import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock the database module
jest.unstable_mockModule('../database/indexeddb/db.js', () => ({
  getAllBookmarks: jest.fn(),
  getActiveBookmarks: jest.fn(),
}));

// Mock settings
jest.unstable_mockModule('../shared/settings.js', () => ({
  getSettings: jest.fn().mockResolvedValue({ semanticSearch: false, openrouterApiKey: '' }),
}));

// Mock semantic search
jest.unstable_mockModule('../core/search-engine/semantic.js', () => ({
  semanticSearch: jest.fn().mockResolvedValue([]),
}));

const { getActiveBookmarks } = await import('../database/indexeddb/db.js');
const { searchBookmarks } = await import('../core/search-index/search.js');

const mockBookmarks = [
  {
    url: 'https://github.com/facebook/react',
    title: 'React - A JavaScript library for building user interfaces',
    description: 'React makes it painless to create interactive UIs.',
    category: 'Development',
    subcategory: 'Frontend',
    keywords: ['react', 'javascript', 'ui'],
    tags: [],
    dateAdded: '2024-01-15T10:00:00Z',
  },
  {
    url: 'https://medium.com/article/my-post',
    title: 'How to Learn React in 2024',
    description: 'A comprehensive guide to learning React.',
    category: 'Learning',
    subcategory: 'Blogs',
    keywords: ['react', 'tutorial', 'learning'],
    tags: [],
    dateAdded: '2024-02-20T10:00:00Z',
  },
  {
    url: 'https://stackoverflow.com/questions/123',
    title: 'React useEffect cleanup function',
    description: 'Stack Overflow question about useEffect.',
    category: 'Development',
    subcategory: 'Learning',
    keywords: ['react', 'useeffect'],
    tags: [],
    dateAdded: '2024-03-10T10:00:00Z',
  },
];

describe('Search Engine', () => {
  beforeEach(() => {
    getActiveBookmarks.mockResolvedValue(mockBookmarks);
  });

  test('should return latest 50 when query is empty', async () => {
    const results = await searchBookmarks('');
    expect(results).toHaveLength(3);
  });

  test('should return latest 50 when query is whitespace', async () => {
    const results = await searchBookmarks('   ');
    expect(results).toHaveLength(3);
  });

  test('should match title with highest score', async () => {
    const results = await searchBookmarks('React');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toBe('https://github.com/facebook/react');
  });

  test('should match URL', async () => {
    const results = await searchBookmarks('medium.com');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toContain('medium.com');
  });

  test('should match keywords', async () => {
    const results = await searchBookmarks('useeffect');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toContain('stackoverflow.com');
  });

  test('should match category', async () => {
    const results = await searchBookmarks('Development');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(b => b.category === 'Development')).toBe(true);
  });

  test('should match description', async () => {
    const results = await searchBookmarks('comprehensive guide');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toContain('medium.com');
  });

  test('should return empty for no matches', async () => {
    const results = await searchBookmarks('xyznonexistent');
    expect(results).toHaveLength(0);
  });

  test('should handle null/undefined bookmarks gracefully', async () => {
    getActiveBookmarks.mockResolvedValue([]);
    const results = await searchBookmarks('test');
    expect(results).toHaveLength(0);
  });
});
