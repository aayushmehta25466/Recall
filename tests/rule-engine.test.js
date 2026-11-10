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
