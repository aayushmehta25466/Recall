import { CATEGORIES } from '../../shared/types/taxonomy.js';

/**
 * Keyword rules for fallback classification.
 * subcategory values use hierarchical paths: "Group / Leaf"
 */
export const keywordRules = [
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Web / Backend',
    keywords: ['backend', 'node.js', 'django', 'flask', 'express', 'spring boot', 'server-side', 'golang', 'microservices'],
    weight: 20
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Web / Frontend',
    keywords: ['frontend', 'react', 'vue', 'angular', 'svelte', 'css', 'html', 'tailwind', 'webpack', 'browser', 'ui component'],
    weight: 20
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Data & AI / AI',
    keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural networks', 'openai', 'llm', 'gpt', 'pytorch', 'tensorflow'],
    weight: 30
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Web / API',
    keywords: ['api', 'rest', 'graphql', 'endpoint', 'webhook', 'oauth'],
    weight: 20
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'DevOps & Cloud / DevOps',
    keywords: ['devops', 'ci/cd', 'docker', 'kubernetes', 'terraform', 'jenkins'],
    weight: 20
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'DevOps & Cloud / Cloud',
    keywords: ['aws', 'azure', 'gcp', 'cloud', 'serverless', 'lambda'],
    weight: 20
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Languages & Tools / Open Source',
    keywords: ['open source', 'github', 'gitlab', 'repository', 'pull request'],
    weight: 15
  },
  {
    category: CATEGORIES.DEVELOPMENT,
    subcategory: 'Languages & Tools / Testing',
    keywords: ['leetcode', 'algorithms', 'data structures', 'interview', 'coding challenge'],
    weight: 15
  },
  {
    category: CATEGORIES.LEARNING,
    subcategory: 'Content / Tutorials',
    keywords: ['tutorial', 'how to', 'guide', 'step-by-step', 'learn'],
    weight: 15
  },
  {
    category: CATEGORIES.LEARNING,
    subcategory: 'Content / Videos',
    keywords: ['video', 'youtube', 'course', 'lecture', 'watch'],
    weight: 15
  },
  {
    category: CATEGORIES.LEARNING,
    subcategory: 'Content / Blogs',
    keywords: ['blog', 'article', 'post', 'medium', 'dev.to'],
    weight: 15
  },
  {
    category: CATEGORIES.BUSINESS,
    subcategory: 'Operations / SaaS',
    keywords: ['pricing', 'features', 'customers', 'book a demo', 'start free trial'],
    weight: 20
  },
  {
    category: CATEGORIES.DESIGN,
    subcategory: 'Resources / Inspiration',
    keywords: ['dribbble', 'behance', 'design inspiration', 'showcase', 'portfolio'],
    weight: 15
  },
  {
    category: CATEGORIES.DESIGN,
    subcategory: 'Resources / Tools',
    keywords: ['figma', 'sketch', 'adobe', 'design tool', 'wireframe', 'mockup'],
    weight: 15
  },
  {
    category: CATEGORIES.PRODUCTIVITY,
    subcategory: 'Tools / Task Management',
    keywords: ['todo', 'task', 'project management', 'kanban', 'sprint'],
    weight: 15
  },
  {
    category: CATEGORIES.NEWS_MEDIA,
    subcategory: 'Sources / Tech News',
    keywords: ['news', 'tech', 'startup', 'funding', 'launch', 'product hunt'],
    weight: 15
  },
];

export function getScoreForKeywords(text) {
  const lowerText = text.toLowerCase();
  const scores = {}; // 'Category/Group/Leaf' -> score

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
