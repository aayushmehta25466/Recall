import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../core/ai-classifier/classifier.js', () => ({
  classifyWithAI: jest.fn().mockResolvedValue(null),
}));

const { classifyWithAI } = await import('../core/ai-classifier/classifier.js');
const { classifyBookmark } = await import('../core/sync-engine/bulk.js');

const settings = (over = {}) => ({
  openrouterApiKey: 'sk-test',
  customRules: [],
  customDomainMappings: {},
  ...over,
});

// github.com is a built-in domain mapping, so fast rules match it.
const knownMetadata = {
  title: 'Repo', description: '', domain: 'github.com', keywords: [],
};
const unknownMetadata = {
  title: 'X', description: '', domain: 'unknown.example', keywords: [],
};

describe('classifyBookmark AI gate (useAI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    classifyWithAI.mockResolvedValue(null);
  });

  test('fast rules match → AI is never called', async () => {
    const result = await classifyBookmark(
      knownMetadata, 'https://github.com/acme/repo', settings(), { useAI: true }
    );

    expect(result.category).toBe('Development');
    expect(classifyWithAI).not.toHaveBeenCalled();
  });

  test('fast miss + useAI true + key → returns the AI result', async () => {
    classifyWithAI.mockResolvedValue({ category: 'Learning', subcategory: 'Content / Tutorials' });

    const result = await classifyBookmark(
      unknownMetadata, 'https://unknown.example/x', settings(), { useAI: true }
    );

    expect(classifyWithAI).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ category: 'Learning', subcategory: 'Content / Tutorials' });
  });

  test('fast miss + useAI false → no AI call, stays Uncategorized', async () => {
    const result = await classifyBookmark(
      unknownMetadata, 'https://unknown.example/x', settings(), { useAI: false }
    );

    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(result.category).toBe('Uncategorized');
  });

  test('fast miss + useAI true but no API key → no AI call', async () => {
    const result = await classifyBookmark(
      unknownMetadata, 'https://unknown.example/x', settings({ openrouterApiKey: '' }), { useAI: true }
    );

    expect(classifyWithAI).not.toHaveBeenCalled();
    expect(result.category).toBe('Uncategorized');
  });

  test('default options keep AI on, as bulk sync relies on', async () => {
    classifyWithAI.mockResolvedValue({ category: 'Design', subcategory: '' });

    const result = await classifyBookmark(unknownMetadata, 'https://unknown.example/x', settings());

    expect(classifyWithAI).toHaveBeenCalled();
    expect(result.category).toBe('Design');
  });

  test('a custom rule beats the built-in domain mapping', async () => {
    const rule = {
      id: 'r_github',
      name: 'GitHub → Design',
      enabled: true,
      priority: 1,
      match: 'all',
      conditions: [{ field: 'domain', op: 'equals', value: 'github.com' }],
      action: { category: 'Design', subcategory: 'Resources / Tools' },
    };

    const result = await classifyBookmark(
      knownMetadata, 'https://github.com/acme/repo', settings({ customRules: [rule] }), { useAI: true }
    );

    expect(result.category).toBe('Design');
    expect(result.subcategory).toBe('Resources / Tools');
    expect(classifyWithAI).not.toHaveBeenCalled();
  });

  test('legacy domain mappings still classify', async () => {
    const result = await classifyBookmark(
      unknownMetadata,
      'https://unknown.example/x',
      settings({ customDomainMappings: { 'unknown.example': { category: 'Personal', subcategory: '' } } }),
      { useAI: true }
    );

    expect(result.category).toBe('Personal');
    expect(classifyWithAI).not.toHaveBeenCalled();
  });

  test('rules can match stored tags', async () => {
    const rule = {
      id: 'r_tags',
      name: 'Tutorial tag',
      enabled: true,
      priority: 1,
      match: 'any',
      conditions: [{ field: 'tags', op: 'includesAny', value: 'tutorial' }],
      action: { category: 'Learning', subcategory: 'Content / Tutorials' },
    };

    const result = await classifyBookmark(
      { ...unknownMetadata, tags: ['tutorial'] },
      'https://unknown.example/x',
      settings({ customRules: [rule] }),
      { useAI: false }
    );

    expect(result.category).toBe('Learning');
    expect(result.subcategory).toBe('Content / Tutorials');
  });
});
