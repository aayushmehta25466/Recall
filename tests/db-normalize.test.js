import { describe, test, expect } from '@jest/globals';
import { normalizeTrashFields } from '../database/indexeddb/db.js';

describe('normalizeTrashFields (v4 migration)', () => {
  test('backfills isTrashed on a legacy record', () => {
    const legacy = { url: 'https://a.example', title: 'A', category: 'Development' };

    expect(normalizeTrashFields(legacy)).toEqual({
      url: 'https://a.example',
      title: 'A',
      category: 'Development',
      isTrashed: 0,
      trashedAt: null,
    });
  });

  test('preserves an existing trashedAt when present', () => {
    const legacy = { url: 'https://a.example', trashedAt: '2024-01-01T00:00:00Z' };

    expect(normalizeTrashFields(legacy).trashedAt).toBe('2024-01-01T00:00:00Z');
  });

  test('leaves records that already have isTrashed untouched', () => {
    expect(normalizeTrashFields({ url: 'a', isTrashed: 0 })).toBeNull();
    expect(normalizeTrashFields({ url: 'b', isTrashed: 1 })).toBeNull();
  });

  test('ignores empty input', () => {
    expect(normalizeTrashFields(null)).toBeNull();
    expect(normalizeTrashFields(undefined)).toBeNull();
  });
});
