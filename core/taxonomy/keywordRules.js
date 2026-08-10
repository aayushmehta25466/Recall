import { CATEGORIES } from '../../shared/types/taxonomy.js';

/**
 * Basic keyword rules for fallback classification.
 * structure:
 * {
 *   category: {
 *     subcategory: {
 *        keywords: [string],
 *        weight: number // Base points awarded per match
 *     }
 *   }
 * }
 */
export const keywordRules = [
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Backend',
    keywords: ['backend', 'node.js', 'django', 'flask', 'express', 'spring boot', 'server-side', 'golang', 'microservices'],
    weight: 20
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Frontend',
    keywords: ['frontend', 'react', 'vue', 'angular', 'svelte', 'css', 'html', 'tailwind', 'webpack', 'browser', 'ui component'],
    weight: 20
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'AI',
    keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural networks', 'openai', 'llm', 'gpt', 'pytorch', 'tensorflow'],
    weight: 30
  },
  {
    category: CATEGORIES.LEARNING,
    subcategory: 'Tutorials',
    keywords: ['tutorial', 'how to', 'guide', 'step-by-step', 'learn'],
    weight: 15
  },
  {
    category: CATEGORIES.BUSINESS,
    subcategory: 'SaaS',
    keywords: ['pricing', 'features', 'customers', 'book a demo', 'start free trial'],
    weight: 20
  }
];

export function getScoreForKeywords(text) {
  const lowerText = text.toLowerCase();
  const scores = {}; // 'Category/Subcategory' -> score

  keywordRules.forEach(rule => {
    let matchCount = 0;
    rule.keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        matchCount++;
      }
    });

    if (matchCount > 0) {
      const key = `${rule.category}/${rule.subcategory}`;
      if (!scores[key]) scores[key] = 0;
      scores[key] += matchCount * rule.weight;
    }
  });

  return scores;
}
