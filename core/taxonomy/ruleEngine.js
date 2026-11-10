import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { validateSubcategory } from './categories.js';

// General-purpose custom ruleset for fast classification. Pure and DOM-free so
// it runs in the service worker, the options page and tests alike.
//
// Evaluation order: rules sorted by `priority` (ascending, stable), first match
// wins. Rules run before the built-in domain map and keyword scoring, and
// before any AI fallback.

const VALID_CATEGORIES = Object.values(CATEGORIES);

// Operator catalogue, shared with the Rules tab UI.
export const OPERATOR_LABELS = {
  equals: 'equals',
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  regex: 'matches regex',
  includesAny: 'includes any of',
  includesAll: 'includes all of',
};

export const RULE_FIELDS = [
  { field: 'domain', label: 'Domain', ops: ['equals', 'endsWith', 'contains', 'regex'] },
  { field: 'url', label: 'URL', ops: ['contains', 'startsWith', 'regex'] },
  { field: 'title', label: 'Title', ops: ['equals', 'contains', 'regex'] },
  { field: 'description', label: 'Description', ops: ['equals', 'contains', 'regex'] },
  { field: 'keywords', label: 'Keywords', ops: ['includesAny', 'includesAll'] },
  { field: 'tags', label: 'Tags', ops: ['includesAny', 'includesAll'] },
  { field: 'contentType', label: 'Content type', ops: ['equals', 'contains'] },
  { field: 'siteName', label: 'Site name', ops: ['equals', 'contains', 'regex'] },
  { field: 'author', label: 'Author', ops: ['equals', 'contains', 'regex'] },
  { field: 'language', label: 'Language', ops: ['equals'] },
  { field: 'category', label: 'Current category', ops: ['equals'] },
];

const FIELD_INDEX = new Map(RULE_FIELDS.map((f) => [f.field, f]));

function asList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
}

function asText(value) {
  return String(value ?? '');
}

// Categories become native folder names, so keep them single-segment.
function sanitizeCategory(value) {
  return asText(value).trim().replace(/\s+/g, ' ').replace(/\//g, '-').slice(0, 40);
}

function sanitizeSubcategory(value) {
  return asText(value).trim().replace(/\s+/g, ' ').slice(0, 80);
}

function splitNeedles(value) {
  return asText(value).split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function includesAny(actual, value) {
  const list = asList(actual).map((v) => v.toLowerCase());
  const needles = splitNeedles(value);
  return needles.some((needle) => list.some((item) => item.includes(needle)));
}

function includesAll(actual, value) {
  const list = asList(actual).map((v) => v.toLowerCase());
  const needles = splitNeedles(value);
  return needles.length > 0 && needles.every((needle) => list.some((item) => item.includes(needle)));
}

function regexTest(actual, value) {
  try {
    return new RegExp(value, 'i').test(asText(actual));
  } catch {
    return false;
  }
}

const OPERATORS = {
  equals: (actual, value) => asText(actual).toLowerCase() === asText(value).trim().toLowerCase(),
  contains: (actual, value) => asText(actual).toLowerCase().includes(asText(value).toLowerCase()),
  startsWith: (actual, value) => asText(actual).toLowerCase().startsWith(asText(value).toLowerCase()),
  endsWith: (actual, value) => asText(actual).toLowerCase().endsWith(asText(value).toLowerCase()),
  regex: regexTest,
  includesAny,
  includesAll,
};

/** True when one condition matches the classification context. */
export function matchCondition(context, condition) {
  if (!condition || typeof condition !== 'object') return false;
  const def = FIELD_INDEX.get(condition.field);
  if (!def) return false;
  if (!def.ops.includes(condition.op)) return false;
  if (asText(condition.value).trim() === '') return false;
  const fn = OPERATORS[condition.op];
  if (!fn) return false;
  return fn(context?.[condition.field], condition.value);
}

/** Combine a rule's conditions with its match mode. */
export function matchRule(context, rule) {
  const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
  if (conditions.length === 0) return false;
  return rule.match === 'any'
    ? conditions.some((c) => matchCondition(context, c))
    : conditions.every((c) => matchCondition(context, c));
}

/**
 * Validate and normalise one rule. Returns null when the rule cannot be used
 * (empty category, no usable conditions, malformed shape).
 */
export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const action = rule.action || {};

  // A category may be one of the built-ins or any user-defined name. Unknown
  // non-empty values are kept as custom categories.
  const rawCategory = sanitizeCategory(action.category);
  if (!rawCategory) return null;
  const category = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === rawCategory.toLowerCase()
  ) || rawCategory;

  const conditions = (Array.isArray(rule.conditions) ? rule.conditions : [])
    .filter((c) => c && FIELD_INDEX.has(c.field) && FIELD_INDEX.get(c.field).ops.includes(c.op))
    .filter((c) => asText(c.value).trim() !== '')
    .map((c) => ({ field: c.field, op: c.op, value: asText(c.value).trim() }));
  if (conditions.length === 0) return null;

  return {
    id: typeof rule.id === 'string' && rule.id ? rule.id : `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: asText(rule.name).trim() || 'Untitled rule',
    enabled: rule.enabled !== false,
    priority: Number.isFinite(rule.priority) ? rule.priority : 100,
    match: rule.match === 'any' ? 'any' : 'all',
    conditions,
    action: {
      category,
      // Canonicalise taxonomy paths; preserve free-text custom subcategories.
      subcategory: validateSubcategory(category, sanitizeSubcategory(action.subcategory))
        || sanitizeSubcategory(action.subcategory),
      tags: asList(action.tags).slice(0, 5),
    },
  };
}

/**
 * Normalise the active ruleset and fold in legacy `customDomainMappings`
 * (exact-domain rules that run after explicitly configured rules).
 */
export function normalizeRules(settings) {
  const raw = Array.isArray(settings?.customRules) ? settings.customRules : [];
  const rules = raw.map(normalizeRule).filter(Boolean);

  const legacy = settings?.customDomainMappings || {};
  let offset = 0;
  for (const [domain, mapping] of Object.entries(legacy)) {
    const rule = normalizeRule({
      id: `legacy_${domain}`,
      name: `Domain: ${domain}`,
      enabled: true,
      priority: 1_000_000 + offset,
      match: 'all',
      conditions: [{ field: 'domain', op: 'equals', value: domain }],
      action: mapping,
    });
    if (rule) {
      rules.push(rule);
      offset += 1;
    }
  }

  return rules.sort((a, b) => a.priority - b.priority);
}

/**
 * Find the first enabled rule in an already-normalized list.
 * Returns { rule, category, subcategory, tags } or null.
 */
export function findMatchingRuleIn(context, rules) {
  for (const rule of rules || []) {
    if (!rule.enabled) continue;
    if (matchRule(context, rule)) {
      return {
        rule,
        category: rule.action.category,
        subcategory: rule.action.subcategory,
        tags: rule.action.tags,
      };
    }
  }
  return null;
}

/** Normalize the settings ruleset once, then find the first match. */
export function findMatchingRule(context, settings) {
  return findMatchingRuleIn(context, normalizeRules(settings));
}

/** Compact human-readable summary used by the Rules list. */
export function describeRule(rule) {
  const joiner = rule.match === 'any' ? ' OR ' : ' AND ';
  return rule.conditions
    .map((c) => `${c.field} ${OPERATOR_LABELS[c.op] || c.op} "${c.value}"`)
    .join(joiner);
}
