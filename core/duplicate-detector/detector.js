/**
 * Normalizes a URL to prevent duplicate entries based on tracking params, trailing slashes, or protocols.
 * @param {string} url 
 * @returns {string} Normalized URL
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove hash
    parsed.hash = '';
    // Strip common tracking parameters
    const params = new URLSearchParams(parsed.search);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    for (const p of trackingParams) {
      params.delete(p);
    }
    parsed.search = params.toString();
    
    // Convert to lowercase domain
    parsed.hostname = parsed.hostname.toLowerCase();
    
    let finalUrl = parsed.toString();
    
    // Remove trailing slash if present
    if (finalUrl.endsWith('/')) {
      finalUrl = finalUrl.slice(0, -1);
    }
    
    // Optional: could strip www., or normalize https to http for comparison.
    // For safety, we keep protocol and www unless explicitly asked to strip.
    return finalUrl;
  } catch (e) {
    return url;
  }
}

/**
 * Checks if a bookmark is a duplicate.
 * @param {string} url 
 * @param {Array} existingBookmarks 
 * @returns {boolean}
 */
export function isDuplicate(url, existingBookmarks) {
  const norm = normalizeUrl(url);
  return existingBookmarks.some(b => normalizeUrl(b.url) === norm);
}
