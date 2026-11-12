import { describe, test, expect } from '@jest/globals';
import { planRuleApplication } from '../core/sync-engine/applyRules.js';

const settings = (rules = []) => ({ customRules: rules, customDomainMappings: {} });

const rule = (over = {}) => ({
  id: 'r1',
  name: 'React docs',
  enabled: true,
  priority: 1,
  match: 'all',
  conditions: [{ field: 'domain', op: 'endsWith', value: 'react.dev' }],
  action: { category: 'Development', subcategory: 'Web / Frontend', tags: ['react'] },
  ...over,
});

describe('planRuleApplication', () => {
  test('emits only records a rule would change', () => {
    const bookmarks = [
      {
        url: 'https://react.dev/docs',
        domain: 'react.dev',
        category: 'Uncategorized',
        subcategory: '',
        tags: [],
      },
      {
        url: 'https://example.com/x',
        domain: 'example.com',
        category: 'Uncategorized',
        subcategory: '',
        tags: [],
      },
    ];

    const updates = planRuleApplication(bookmarks, settings([rule()]));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      url: 'https://react.dev/docs',
      category: 'Development',
      subcategory: 'Web / Frontend',
      tags: ['react'],
    });
  });

  test('skips records that already match the rule action', () => {
    const bookmarks = [
      {
        url: 'https://react.dev/docs',
        domain: 'react.dev',
        category: 'Development',
        subcategory: 'Web / Frontend',
        tags: ['react'],
      },
    ];
    expect(planRuleApplication(bookmarks, settings([rule()]))).toEqual([]);
  });

  test('merges rule tags into existing tags', () => {
    const bookmarks = [
      {
        url: 'https://react.dev/docs',
        domain: 'react.dev',
        category: 'Uncategorized',
        tags: ['docs'],
      },
    ];
    const [update] = planRuleApplication(bookmarks, settings([rule()]));
    expect(update.tags).toEqual(['docs', 'react']);
  });

  test('never emits Uncategorized and ignores disabled rules', () => {
    const uncatRule = rule({
      action: { category: 'Uncategorized', subcategory: '', tags: [] },
    });
    const disabled = rule({ id: 'r2', enabled: false });

    const bookmarks = [
      { url: 'https://react.dev/docs', domain: 'react.dev', category: 'Development', tags: [] },
    ];

    expect(planRuleApplication(bookmarks, settings([uncatRule]))).toEqual([]);
    expect(planRuleApplication(bookmarks, settings([disabled]))).toEqual([]);
  });

  test('honors priority and supports custom categories/subcategories', () => {
    const bookmarks = [
      { url: 'https://a.example/x', domain: 'a.example', category: 'Uncategorized', tags: [] },
    ];
    const low = rule({
      id: 'low',
      priority: 10,
      conditions: [{ field: 'domain', op: 'contains', value: 'example' }],
      action: { category: 'Learning', subcategory: '' },
    });
    const high = rule({
      id: 'high',
      priority: 1,
      conditions: [{ field: 'domain', op: 'contains', value: 'a.example' }],
      action: { category: 'My Tools', subcategory: 'Docs' },
    });

    const [update] = planRuleApplication(bookmarks, settings([low, high]));
    expect(update.category).toBe('My Tools');
    expect(update.subcategory).toBe('Docs');
  });

  test('ignores records without a URL', () => {
    expect(planRuleApplication([{ domain: 'react.dev', tags: [] }], settings([rule()]))).toEqual([]);
  });

  test('matches keywords stored on the record', () => {
    const keywordRule = rule({
      conditions: [{ field: 'keywords', op: 'includesAll', value: 'react, hooks' }],
    });
    const bookmarks = [
      { url: 'https://x.example/y', category: 'Uncategorized', keywords: ['react', 'hooks'], tags: [] },
    ];
    expect(planRuleApplication(bookmarks, settings([keywordRule]))).toHaveLength(1);
  });

  test('does not emit a change when nothing matches', () => {
    const bookmarks = [
      { url: 'https://other.example/z', domain: 'other.example', category: 'Uncategorized', tags: [] },
    ];
    expect(planRuleApplication(bookmarks, settings([rule()]))).toEqual([]);
  });

  test('uses tags and contentType stored on the record', () => {
    const tagRule = rule({
      conditions: [
        { field: 'tags', op: 'includesAny', value: 'tutorial' },
        { field: 'contentType', op: 'equals', value: 'Documentation' },
      ],
    });
    const bookmarks = [
      {
        url: 'https://example.com/a',
        domain: 'example.com',
        category: 'Uncategorized',
        contentType: 'Documentation',
        tags: ['tutorial'],
      },
    ];
    const [update] = planRuleApplication(bookmarks, settings([tagRule]));
    expect(update.category).toBe('Development');
  });
});
