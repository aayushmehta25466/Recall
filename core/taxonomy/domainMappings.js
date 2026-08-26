import { CATEGORIES } from '../../shared/types/taxonomy.js';

export const domainMappings = {
  'github.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Languages & Tools / Open Source' },
  'stackoverflow.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Languages & Tools / Documentation' },
  'developer.mozilla.org': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Web / Documentation' },
  'youtube.com': { category: CATEGORIES.LEARNING, subcategory: 'Content / Videos' },
  'figma.com': { category: CATEGORIES.DESIGN, subcategory: 'Resources / Tools' },
  'leetcode.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Languages & Tools / Testing' },
  'aws.amazon.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'DevOps & Cloud / Cloud' },
  'stripe.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Web / API' },
  'medium.com': { category: CATEGORIES.LEARNING, subcategory: 'Content / Blogs' },
  'news.ycombinator.com': { category: CATEGORIES.NEWS_MEDIA, subcategory: 'Sources / Tech News' },
  'arxiv.org': { category: CATEGORIES.LEARNING, subcategory: 'References / Research Papers' },
  'dribbble.com': { category: CATEGORIES.DESIGN, subcategory: 'Resources / Inspiration' },
  'jira.atlassian.com': { category: CATEGORIES.PRODUCTIVITY, subcategory: 'Tools / Task Management' },
  'chromewebstore.google.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Languages & Tools / Extensions' },
  'chrome.google.com': { category: CATEGORIES.DEVELOPMENT, subcategory: 'Languages & Tools / Extensions' },
};

/**
 * Returns the hardcoded category mapping for a given domain/hostname
 * @param {string} domain 
 * @returns {Object|null}
 */
export function getDomainMapping(domain) {
  if (domainMappings[domain]) {
    return domainMappings[domain];
  }
  return null;
}
