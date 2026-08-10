/**
 * Infers the specific Content Type of a bookmark based on URL patterns and metadata.
 * 
 * @param {Object} metadata The extracted metadata from extractor.js
 * @param {string} url The raw URL
 * @returns {string} The inferred content type
 */
export function inferContentType(metadata, url) {
  const { title = '', domain = '' } = metadata;
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // 1. GitHub Repo
  if (domain === 'github.com' && lowerUrl.match(/github\.com\/[^/]+\/[^/]+(?:\/tree\/[^/]+)?$/)) {
    return 'GitHub Repo';
  }

  // 2. YouTube Video
  if ((domain === 'youtube.com' && lowerUrl.includes('/watch?v=')) || domain === 'youtu.be') {
    return 'YouTube Video';
  }

  // 3. Research Paper
  if (lowerUrl.endsWith('.pdf') || domain === 'arxiv.org' || lowerUrl.includes('doi.org')) {
    return 'Research Paper';
  }

  // 4. Documentation
  if (
    lowerUrl.includes('/docs') || 
    lowerUrl.includes('/reference') || 
    lowerUrl.includes('api.') || 
    domain.startsWith('docs.') || 
    lowerTitle.includes('documentation') ||
    lowerTitle.includes('reference')
  ) {
    return 'Documentation';
  }

  // 5. Product / SaaS
  if (
    lowerUrl.includes('/pricing') || 
    lowerUrl.includes('/features') || 
    lowerTitle.includes('pricing') ||
    lowerTitle.includes('book a demo')
  ) {
    return 'Product';
  }

  // 6. Blog
  if (
    lowerUrl.includes('/blog') || 
    lowerUrl.includes('/article') || 
    domain === 'medium.com' ||
    domain === 'dev.to'
  ) {
    return 'Blog';
  }

  // Default fallback
  return 'Website';
}
