import { CATEGORIES } from '../../shared/types/taxonomy.js';

export const domainMappings = {
  'github.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Open Source' },
  'stackoverflow.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Learning' },
  'developer.mozilla.org': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Documentation' },
  'youtube.com': { category: CATEGORIES.LEARNING, subcategory: 'Videos' },
  'figma.com': { category: CATEGORIES.DESIGN, subcategory: 'Tools' },
  'leetcode.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Interview Prep' },
  'aws.amazon.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Cloud' },
  'stripe.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'API' }, // Needs deeper path matching for docs in real impl
  'medium.com': { category: CATEGORIES.LEARNING, subcategory: 'Blogs' },
  'news.ycombinator.com': { category: CATEGORIES.NEWS_MEDIA, subcategory: 'Tech News' },
  'arxiv.org': { category: CATEGORIES.LEARNING, subcategory: 'Research Papers' },
  'dribbble.com': { category: CATEGORIES.DESIGN, subcategory: 'Inspiration' },
  'jira.atlassian.com': { category: CATEGORIES.PRODUCTIVITY, subcategory: 'Task Management' },
  'chromewebstore.google.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Extensions' },
  'chrome.google.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Extensions' },
};

/**
 * Returns the hardcoded category mapping for a given domain/hostname
 * @param {string} domain 
 * @returns {Object|null}
 */
export function getDomainMapping(domain) {
  // Simple check for now, can be expanded to check suffixes (e.g. docs.stripe.com)
  if (domainMappings[domain]) {
    return domainMappings[domain];
  }
  return null;
}
