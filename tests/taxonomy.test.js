import { CATEGORIES } from '../shared/types/taxonomy.js';
import { taxonomyTree, isValidSubcategory } from '../core/taxonomy/categories.js';
import { getDomainMapping } from '../core/taxonomy/domainMappings.js';
import { getScoreForKeywords } from '../core/taxonomy/keywordRules.js';

describe('Taxonomy Phase 1', () => {
  test('isValidSubcategory should correctly validate known subcategories', () => {
    expect(isValidSubcategory(CATEGORIES.DEVELOPMENT, 'Frontend')).toBe(true);
    expect(isValidSubcategory(CATEGORIES.DEVELOPMENT, 'UnknownSubcategory')).toBe(false);
    expect(isValidSubcategory(CATEGORIES.BUSINESS, 'SaaS')).toBe(true);
  });

  test('getDomainMapping should resolve known domains', () => {
    const mapping = getDomainMapping('github.com');
    expect(mapping).toEqual({
      category: CATEGORIES.DEVELOPMENT,
      subcategory: 'Open Source'
    });

    const unknownMapping = getDomainMapping('unknown.com');
    expect(unknownMapping).toBeNull();
  });

  test('getScoreForKeywords should score text correctly', () => {
    const text = 'This is a react frontend tutorial for developers.';
    const scores = getScoreForKeywords(text);
    
    // 'react' and 'frontend' should match Development/Frontend
    // 'tutorial' should match Learning/Tutorials
    expect(scores[`${CATEGORIES.DEVELOPMENT}/Frontend`]).toBeGreaterThan(0);
    expect(scores[`${CATEGORIES.LEARNING}/Tutorials`]).toBeGreaterThan(0);
    expect(scores[`${CATEGORIES.DEVELOPMENT}/Frontend`]).toBe(40); // 2 matches * 20 weight
  });
});
