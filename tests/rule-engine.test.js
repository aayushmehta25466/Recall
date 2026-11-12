import { describe, test, expect } from '@jest/globals';
import {
  matchCondition,
  matchRule,
  findMatchingRule,
  normalizeRule,
  normalizeRules,
  describeRule,
} from '../core/taxonomy/ruleEngine.js';

const context = {
  url: 'https://docs.react.dev/learn/hooks',
  domain: 'docs.react.dev',
  title: 'React Hooks – Docs',
  description: 'Learn how hooks work',
  siteName: 'React',
  author: 'Meta',
  language: 'en',
  keywords: ['react', 'hooks', 'frontend'],
  tags: ['frontend', 'tutorial'],
  contentType: 'Documentation',
  category: 'Uncategorized',
};

const makeRule = (over = {}) => ({
  id: 'r1',
  name: 'Test rule',
  enabled: true,
  priority: 1,
  match: 'all',
  conditions: [{ field: 'domain', op: 'endsWith', value: 'react.dev' }],
  action: { category: 'Development', subcategory: 'Web / Frontend' },
  ...over,
});

const settings = (rules = [], over = {}) => ({ customRules: rules, customDomainMappings: {}, ...over });

describe('matchCondition', () => {
  test('domain operators', () => {
    expect(matchCondition(context, { field: 'domain', op: 'equals', value: 'docs.react.dev' })).toBe(true);
    expect(matchCondition(context, { field: 'domain', op: 'endsWith', value: 'react.dev' })).toBe(true);
    expect(matchCondition(context, { field: 'domain', op: 'contains', value: 'react' })).toBe(true);
    expect(matchCondition(context, { field: 'domain', op: 'equals', value: 'example.com' })).toBe(false);
  });

  test('regex is case-insensitive and invalid patterns do not throw', () => {
    expect(matchCondition(context, { field: 'url', op: 'regex', value: '/learn/' })).toBe(true);
    expect(matchCondition(context, { field: 'url', op: 'regex', value: '[' })).toBe(false);
  });

  test('text fields are case-insensitive', () => {
    expect(matchCondition(context, { field: 'title', op: 'contains', value: 'react hooks' })).toBe(true);
    expect(matchCondition(context, { field: 'contentType', op: 'equals', value: 'documentation' })).toBe(true);
  });

  test('keyword and tag arrays support includesAny / includesAll', () => {
    expect(matchCondition(context, { field: 'keywords', op: 'includesAny', value: 'hooks, vue' })).toBe(true);
    expect(matchCondition(context, { field: 'keywords', op: 'includesAll', value: 'react, hooks' })).toBe(true);
    expect(matchCondition(context, { field: 'keywords', op: 'includesAll', value: 'react, vue' })).toBe(false);
    expect(matchCondition(context, { field: 'tags', op: 'includesAny', value: 'tutorial' })).toBe(true);
  });

  test('empty values never match', () => {
    expect(matchCondition(context, { field: 'domain', op: 'contains', value: '  ' })).toBe(false);
  });

  test('unknown field or operator does not match', () => {
    expect(matchCondition(context, { field: 'nope', op: 'contains', value: 'x' })).toBe(false);
    expect(matchCondition(context, { field: 'title', op: 'nope', value: 'x' })).toBe(false);
  });
});

describe('matchRule', () => {
  test('all requires every condition', () => {
    const rule = makeRule({
      match: 'all',
      conditions: [
        { field: 'domain', op: 'endsWith', value: 'react.dev' },
        { field: 'title', op: 'contains', value: 'hooks' },
      ],
    });
    expect(matchRule(context, rule)).toBe(true);
  });

  test('any requires one condition', () => {
    const rule = makeRule({
      match: 'any',
      conditions: [
        { field: 'domain', op: 'equals', value: 'example.com' },
        { field: 'tags', op: 'includesAny', value: 'tutorial' },
      ],
    });
    expect(matchRule(context, rule)).toBe(true);
  });

  test('rules without conditions never match', () => {
    expect(matchRule(context, makeRule({ conditions: [] }))).toBe(false);
  });
});

describe('findMatchingRule', () => {
  test('first rule by priority wins', () => {
    const low = makeRule({
      id: 'low',
      priority: 1,
      action: { category: 'Learning', subcategory: 'Content / Tutorials' },
    });
    const high = makeRule({ id: 'high', priority: 5, action: { category: 'Design', subcategory: '' } });

    const match = findMatchingRule(context, settings([high, low]));
    expect(match.category).toBe('Learning');
    expect(match.rule.id).toBe('low');
  });

  test('disabled rules are skipped', () => {
    const disabled = makeRule({ id: 'off', enabled: false, priority: 1 });
    const active = makeRule({ id: 'on', priority: 2, action: { category: 'Design', subcategory: '' } });

    const match = findMatchingRule(context, settings([disabled, active]));
    expect(match.category).toBe('Design');
  });

  test('returns rule tags', () => {
    const rule = makeRule({ action: { category: 'Development', subcategory: '', tags: ['react'] } });
    const match = findMatchingRule(context, settings([rule]));
    expect(match.tags).toEqual(['react']);
  });

  test('legacy domain mappings still classify', () => {
    const match = findMatchingRule(
      { ...context, domain: 'legacy.example' },
      { customRules: [], customDomainMappings: { 'legacy.example': { category: 'Business', subcategory: '' } } }
    );
    expect(match.category).toBe('Business');
  });

  test('custom rules beat legacy mappings', () => {
    const match = findMatchingRule(
      { ...context, domain: 'legacy.example' },
      {
        customRules: [makeRule({
          priority: 1,
          conditions: [{ field: 'domain', op: 'equals', value: 'legacy.example' }],
          action: { category: 'Design', subcategory: '' },
        })],
        customDomainMappings: { 'legacy.example': { category: 'Business', subcategory: '' } },
      }
    );
    expect(match.category).toBe('Design');
  });
});

describe('normalizeRule / normalizeRules', () => {
  test('accepts and trims custom categories', () => {
    const rule = normalizeRule(makeRule({ action: { category: '  My Tools  ', subcategory: '' } }));
    expect(rule.action.category).toBe('My Tools');
  });

  test('rejects an empty category', () => {
    expect(normalizeRule(makeRule({ action: { category: '   ', subcategory: '' } }))).toBeNull();
  });

  test('sanitizes slashes in custom category names', () => {
    const rule = normalizeRule(makeRule({ action: { category: 'My / Tools', subcategory: '' } }));
    expect(rule.action.category).toBe('My - Tools');
  });

  test('keeps custom subcategories that are not in the taxonomy', () => {
    const rule = normalizeRule(makeRule({ action: { category: 'Development', subcategory: 'Banana' } }));
    expect(rule.action.subcategory).toBe('Banana');
  });

  test('keeps custom subcategories for custom categories', () => {
    const rule = normalizeRule(makeRule({ action: { category: 'My Tools', subcategory: 'My Sub' } }));
    expect(rule.action.subcategory).toBe('My Sub');
  });

  test('drops rules with no usable conditions', () => {
    expect(normalizeRule(makeRule({ conditions: [{ field: 'title', op: 'contains', value: ' ' }] }))).toBeNull();
  });

  test('normalizeRules folds legacy mappings in after custom rules', () => {
    const rules = normalizeRules({
      customRules: [makeRule({ priority: 0 })],
      customDomainMappings: { 'x.example': { category: 'Personal', subcategory: '' } },
    });
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe('r1');
    expect(rules[1].id).toBe('legacy_x.example');
  });
});

describe('operators (every supported field)', () => {
  const ctx = {
    url: 'https://example.com/path/to/page.html',
    domain: 'example.com',
    title: 'Hello World Guide',
    description: 'A friendly guide',
    siteName: 'Example',
    author: 'Jane Doe',
    language: 'en',
    keywords: ['alpha', 'beta'],
    tags: ['one', 'two'],
    contentType: 'Documentation',
    category: 'Learning',
  };

  test('url operators', () => {
    expect(matchCondition(ctx, { field: 'url', op: 'contains', value: '/path/' })).toBe(true);
    expect(matchCondition(ctx, { field: 'url', op: 'startsWith', value: 'https://example' })).toBe(true);
    expect(matchCondition(ctx, { field: 'url', op: 'regex', value: '\\.html$' })).toBe(true);
  });

  test('domain operators', () => {
    expect(matchCondition(ctx, { field: 'domain', op: 'endsWith', value: 'example.com' })).toBe(true);
    expect(matchCondition(ctx, { field: 'domain', op: 'contains', value: 'ample' })).toBe(true);
    expect(matchCondition(ctx, { field: 'domain', op: 'regex', value: '^example\\.' })).toBe(true);
  });

  test('text fields: title, description, siteName, author, contentType, category', () => {
    expect(matchCondition(ctx, { field: 'title', op: 'equals', value: 'hello world guide' })).toBe(true);
    expect(matchCondition(ctx, { field: 'description', op: 'contains', value: 'friendly' })).toBe(true);
    expect(matchCondition(ctx, { field: 'siteName', op: 'equals', value: 'Example' })).toBe(true);
    expect(matchCondition(ctx, { field: 'author', op: 'contains', value: 'jane' })).toBe(true);
    expect(matchCondition(ctx, { field: 'contentType', op: 'contains', value: 'doc' })).toBe(true);
    expect(matchCondition(ctx, { field: 'category', op: 'equals', value: 'learning' })).toBe(true);
    expect(matchCondition(ctx, { field: 'language', op: 'equals', value: 'EN' })).toBe(true);
  });

  test('includesAll needs every needle and at least one', () => {
    expect(matchCondition(ctx, { field: 'keywords', op: 'includesAll', value: 'alpha, beta' })).toBe(true);
    expect(matchCondition(ctx, { field: 'keywords', op: 'includesAll', value: 'alpha, gamma' })).toBe(false);
    expect(matchCondition(ctx, { field: 'keywords', op: 'includesAll', value: '' })).toBe(false);
  });

  test('operators a field does not support never match', () => {
    expect(matchCondition(ctx, { field: 'language', op: 'contains', value: 'e' })).toBe(false);
    expect(matchCondition(ctx, { field: 'keywords', op: 'equals', value: 'alpha' })).toBe(false);
  });
});

describe('priority and ordering', () => {
  test('equal priorities keep insertion order (stable)', () => {
    const a = makeRule({ id: 'a', priority: 5, action: { category: 'Learning', subcategory: '' } });
    const b = makeRule({ id: 'b', priority: 5, action: { category: 'Design', subcategory: '' } });
    expect(findMatchingRule(context, settings([a, b])).rule.id).toBe('a');
  });

  test('normalizeRules sorts ascending', () => {
    const rules = normalizeRules({
      customRules: [
        makeRule({ id: 'z', priority: 9 }),
        makeRule({ id: 'a', priority: 1 }),
      ],
    });
    expect(rules.map((r) => r.id)).toEqual(['a', 'z']);
  });
});

describe('normalizeRule edge cases', () => {
  test('defaults priority, enabled, match mode and name', () => {
    const rule = normalizeRule({
      conditions: [{ field: 'title', op: 'contains', value: 'x' }],
      action: { category: 'Development' },
    });
    expect(rule.priority).toBe(100);
    expect(rule.enabled).toBe(true);
    expect(rule.match).toBe('all');
    expect(rule.name).toBe('Untitled rule');
    expect(rule.action.tags).toEqual([]);
  });

  test('splits comma tags and caps at five', () => {
    const rule = normalizeRule(
      makeRule({ action: { category: 'Development', subcategory: '', tags: 'a, b, c, d, e, f' } })
    );
    expect(rule.action.tags).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('drops unknown fields and unsupported operators', () => {
    expect(normalizeRule(makeRule({ conditions: [{ field: 'bogus', op: 'contains', value: 'x' }] }))).toBeNull();
    expect(normalizeRule(makeRule({ conditions: [{ field: 'title', op: 'bogus', value: 'x' }] }))).toBeNull();
  });

  test('preserves an explicitly disabled rule', () => {
    expect(normalizeRule(makeRule({ enabled: false })).enabled).toBe(false);
  });

  test('custom category flows through matching with its tags', () => {
    const rule = makeRule({
      action: { category: 'Reading', subcategory: 'Later', tags: ['read', 'later'] },
    });
    const match = findMatchingRule(context, settings([rule]));
    expect(match.category).toBe('Reading');
    expect(match.subcategory).toBe('Later');
    expect(match.tags).toEqual(['read', 'later']);
  });
});

describe('describeRule', () => {
  test('renders conditions with the match mode', () => {
    const rule = normalizeRule(
      makeRule({
        match: 'any',
        conditions: [
          { field: 'domain', op: 'endsWith', value: 'react.dev' },
          { field: 'tags', op: 'includesAny', value: 'tutorial' },
        ],
      })
    );
    expect(describeRule(rule)).toContain('domain ends with "react.dev"');
    expect(describeRule(rule)).toContain(' OR ');
  });
});
