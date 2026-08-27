import { CATEGORIES } from '../shared/types/taxonomy.js';
import { taxonomyTree, isValidSubcategory, validateSubcategory, flattenSubcategoryPaths, buildTaxonomyPrompt } from '../core/taxonomy/categories.js';
import { getDomainMapping } from '../core/taxonomy/domainMappings.js';
import { getScoreForKeywords } from '../core/taxonomy/keywordRules.js';

describe('Taxonomy Phase 1', () => {
  test('isValidSubcategory should correctly validate known subcategories', () => {
    // Full path match
    expect(isValidSubcategory(CATEGORIES.DEVELOPMENT, 'Web / Frontend')).toBe(true);
    expect(isValidSubcategory(CATEGORIES.DEVELOPMENT, 'Data & AI / ML')).toBe(true);
    expect(isValidSubcategory(CATEGORIES.BUSINESS, 'Operations / SaaS')).toBe(true);
    // Leaf-only backwards compat
    expect(isValidSubcategory(CATEGORIES.DEVELOPMENT, 'Frontend')).toBe(true);
    expect(isValidSubcategory(CATEGORIES.DEVELOPMENT, 'UnknownSubcategory')).toBe(false);
  });

  test('validateSubcategory returns canonical path', () => {
    // Exact path
    expect(validateSubcategory(CATEGORIES.DEVELOPMENT, 'Web / Frontend')).toBe('Web / Frontend');
    // Leaf-only → full path
    expect(validateSubcategory(CATEGORIES.DEVELOPMENT, 'Frontend')).toBe('Web / Frontend');
    // Group-only → first leaf
    expect(validateSubcategory(CATEGORIES.DEVELOPMENT, 'Mobile')).toBe('Mobile / iOS');
    // Invalid
    expect(validateSubcategory(CATEGORIES.DEVELOPMENT, 'Banana')).toBe('');
  });

  test('flattenSubcategoryPaths returns all paths for a category', () => {
    const paths = flattenSubcategoryPaths(CATEGORIES.DEVELOPMENT);
    expect(paths).toContain('Web / Frontend');
    expect(paths).toContain('Data & AI / ML');
    expect(paths).toContain('Languages & Tools / Open Source');
    expect(paths.length).toBe(19); // 4+2+3+5+5 = 19 leaves under Development
  });

  test('taxonomyTree has nested structure', () => {
    expect(typeof taxonomyTree[CATEGORIES.DEVELOPMENT]).toBe('object');
    expect(Array.isArray(taxonomyTree[CATEGORIES.DEVELOPMENT])).toBe(false);
    expect(taxonomyTree[CATEGORIES.DEVELOPMENT]['Web']).toEqual(['Frontend', 'Backend', 'API', 'Documentation']);
  });

  test('buildTaxonomyPrompt generates hierarchical text', () => {
    const text = buildTaxonomyPrompt();
    expect(text).toContain('Development:');
    expect(text).toContain('Web: Frontend, Backend');
    expect(text).toContain('Data & AI: Database, AI, ML');
  });

  test('getDomainMapping should resolve known domains', () => {
    const mapping = getDomainMapping('github.com');
    expect(mapping).toEqual({
      category: CATEGORIES.DEVELOPMENT,
      subcategory: 'Languages & Tools / Open Source'
    });

    const unknownMapping = getDomainMapping('unknown.com');
    expect(unknownMapping).toBeNull();
  });

  test('getScoreForKeywords should score text correctly', () => {
    const text = 'This is a react frontend tutorial for developers.';
    const scores = getScoreForKeywords(text);
    
    // 'react' and 'frontend' should match Development/Web/Frontend
    // 'tutorial' should match Learning/Content/Tutorials
    expect(scores[`${CATEGORIES.DEVELOPMENT}/Web / Frontend`]).toBeGreaterThan(0);
    expect(scores[`${CATEGORIES.LEARNING}/Content / Tutorials`]).toBeGreaterThan(0);
    expect(scores[`${CATEGORIES.DEVELOPMENT}/Web / Frontend`]).toBe(40); // 2 matches * 20 weight
  });
});
